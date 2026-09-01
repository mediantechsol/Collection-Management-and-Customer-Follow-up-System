import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast, errorMessage } from '@/components/ui/Toast';
import { useAddFollowup } from '@/lib/queries';
import { useProfile } from '@/features/auth/AuthContext';
import { todayStr } from '@/lib/logic/dates';
import { IconFileText, IconImage, IconPaperclip } from '@/components/ui/Icons';
import {
  formatFileSize,
  isImageFile,
  isPdfFile,
  uploadFollowupAttachment,
  validateAttachmentFile,
  type UploadProgress,
} from '@/lib/storage';
import type { FollowupType, Seriousness, UUID } from '@/types/models';

const TYPES: FollowupType[] = ['اتصال', 'واتساب', 'زيارة', 'أخرى'];
const LEVELS: Seriousness[] = ['عالي', 'متوسط', 'منخفض'];

interface Props {
  customerId: UUID;
  customerName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * تسجيل متابعة — كل الحقول التي طلبها العميل صراحة في رؤيته:
 * التاريخ والوقت (تلقائياً)، النوع، النتيجة، الموعد القادم، مستوى الجدية،
 * المبلغ المتوقع تحصيله، وإرفاق الملفات والمستندات (سندات، شيكات، صور، اتفاقيات)
 * مع شريط تقدم حي لمتابعة مراحل الرفع والتجهيز والحفظ.
 */
export function FollowupModal({ customerId, customerName, open, onClose }: Props) {
  const profile = useProfile();
  const toast = useToast();
  const addFollowup = useAddFollowup();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    followup_date: todayStr(),
    followup_time: new Date().toTimeString().slice(0, 5),
    type_followup: 'اتصال' as FollowupType,
    level_seriousness: 'متوسط' as Seriousness,
    contact_result: '',
    next_followup_date: '',
    expected_collection_amount: '',
    details: '',
    description_customer: '',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleFileSelection(file: File | null) {
    if (!file) return;
    const validation = validateAttachmentFile(file);
    if (!validation.valid) {
      setFileError(validation.error || 'الملف غير صالح');
      setSelectedFile(null);
      return;
    }
    setFileError(null);
    setSelectedFile(file);
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    handleFileSelection(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleFileSelection(file);
  }

  function removeFile() {
    setSelectedFile(null);
    setFileError(null);
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function save() {
    try {
      setIsUploading(true);
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;

      if (selectedFile) {
        setUploadProgress({ percent: 10, label: 'جاري فحص الملف وتجهيزه للرفع…' });
        const uploadResult = await uploadFollowupAttachment(
          customerId,
          selectedFile,
          (progress) => setUploadProgress(progress),
        );
        attachmentUrl = uploadResult.path;
        attachmentName = uploadResult.name;
        setUploadProgress({ percent: 95, label: 'تم الرفع! جاري حفظ بيانات المتابعة…' });
      }

      await addFollowup.mutateAsync({
        customer_id: customerId,
        user_id: profile.id,
        followup_date: form.followup_date || todayStr(),
        followup_time: form.followup_time || null,
        type_followup: form.type_followup,
        contact_result: form.contact_result.trim() || null,
        next_followup_date: form.next_followup_date || null,
        details: form.details.trim() || null,
        description_customer: form.description_customer.trim() || null,
        level_seriousness: form.level_seriousness,
        expected_collection_amount: Number(form.expected_collection_amount) || 0,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
      });

      setUploadProgress({ percent: 100, label: 'اكتمل الحفظ بنجاح!' });
      toast.show('تم حفظ المتابعة بنجاح' + (attachmentName ? ' مع المرفق' : ''));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
      setUploadProgress(null);
    } finally {
      setIsUploading(false);
    }
  }

  const isPending = addFollowup.isPending || isUploading;

  return (
    <Modal
      open={open}
      title={`إضافة متابعة — ${customerName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isPending}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={isPending}
          >
            {isUploading
              ? 'جارٍ الحفظ والرفع…'
              : addFollowup.isPending
                ? 'جارٍ الحفظ…'
                : 'حفظ المتابعة'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <div className="field">
          <label>تاريخ المتابعة</label>
          <input
            type="date"
            value={form.followup_date}
            onChange={(e) => set('followup_date', e.target.value)}
          />
        </div>
        <div className="field">
          <label>وقت المتابعة</label>
          <input
            type="time"
            value={form.followup_time}
            onChange={(e) => set('followup_time', e.target.value)}
          />
        </div>
        <div className="field">
          <label>نوع المتابعة</label>
          <select
            value={form.type_followup}
            onChange={(e) => set('type_followup', e.target.value as FollowupType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>مستوى جدية العميل</label>
          <select
            value={form.level_seriousness}
            onChange={(e) => set('level_seriousness', e.target.value as Seriousness)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>نتيجة التواصل</label>
        <input
          type="text"
          value={form.contact_result}
          onChange={(e) => set('contact_result', e.target.value)}
          placeholder="مثال: وعد بالسداد، لم يرد، سدّد جزئياً…"
        />
        <p className="mt-1 text-[11px] text-gray-500">
          كتابة كلمة «وعد» هنا مع تحديد موعد المتابعة القادمة تُطلق تنبيه «وعد بالسداد اليوم» في موعده.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <div className="field">
          <label>موعد المتابعة القادمة</label>
          <input
            type="date"
            value={form.next_followup_date}
            onChange={(e) => set('next_followup_date', e.target.value)}
          />
        </div>
        <div className="field">
          <label>المبلغ المتوقع تحصيله</label>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
            value={form.expected_collection_amount}
            onChange={(e) => set('expected_collection_amount', e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="field">
        <label>تفاصيل المتابعة</label>
        <textarea
          rows={3}
          value={form.details}
          onChange={(e) => set('details', e.target.value)}
          placeholder="أدخل ملاحظات أو تفاصيل المكالمة/الزيارة…"
        />
      </div>

      {/* ------------------------------------------- إرفاق مستند أو صورة */}
      <div className="field mt-3">
        <label className="flex items-center justify-between font-semibold">
          <span>إرفاق مستند أو صورة (اختياري)</span>
          <span className="text-[11px] font-normal text-gray-500">
            سند، شيك، صورة زيارة، PDF (حد أقصى 5 م.ب)
          </span>
        </label>

        {!selectedFile ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-600'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              onChange={onFileInputChange}
            />
            <div className="flex flex-col items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <IconPaperclip className="h-6 w-6 text-gray-400" />
              <span>
                اسحب وأفلت الملف هنا أو <span className="font-semibold text-blue-600 underline">اضغط للاستعراض</span>
              </span>
              <span className="text-[11px] text-gray-500">
                الصيغ المقبولة: JPG, PNG, WEBP, PDF
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                {isImageFile(selectedFile.name) ? (
                  <IconImage className="h-5 w-5 text-blue-600 shrink-0" />
                ) : isPdfFile(selectedFile.name) ? (
                  <IconFileText className="h-5 w-5 text-red-600 shrink-0" />
                ) : (
                  <IconPaperclip className="h-5 w-5 text-gray-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-800 dark:text-zinc-200">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={removeFile}
                disabled={isPending}
                className="btn btn-outline py-1 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                title="إزالة الملف"
              >
                إلغاء الملف
              </button>
            </div>

            {/* شريط تقدم الرفع والتجهيز */}
            {uploadProgress && (
              <div className="mt-2 rounded-md bg-blue-50/70 p-2.5 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                <div className="flex items-center justify-between text-xs text-blue-900 dark:text-blue-200 mb-1.5 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                    {uploadProgress.label}
                  </span>
                  <span className="font-bold mono">{uploadProgress.percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200/60 dark:bg-blue-900/40">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {fileError && (
          <p className="mt-1.5 text-xs font-semibold text-red-600">{fileError}</p>
        )}
      </div>
    </Modal>
  );
}
