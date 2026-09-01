import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useValidateBackupPayload } from '@/lib/queries';
import { useToast, errorMessage } from '@/components/ui/Toast';
import { IconUpload, IconFileText, IconCheck, IconAlertCircle } from '@/components/ui/Icons';
import type { SystemBackupPayload, BackupValidationResult } from '@/types/models';

interface Props {
  onValidated: (payload: SystemBackupPayload, validationResult: BackupValidationResult) => void;
}

export function RestoreDropzone({ onValidated }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const validateMutation = useValidateBackupPayload();

  const handleFileProcess = (file: File) => {
    if (!file.name.endsWith('.json')) {
      toast.error('صيغة غير مدعومة: يرجى اختيار ملف بصيغة JSON (.json) فقط.');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const payload = JSON.parse(text) as SystemBackupPayload;

        if (!payload.manifest || !payload.tables) {
          throw new Error('الملف لا يحتوي على هيكل النسخة الاحتياطية المعتمد (manifest / tables)');
        }

        const validationResult = await validateMutation.mutateAsync(payload);
        toast.show(`تم فحص وتدقيق الملف بنجاح (الإصدار: ${validationResult.manifest.format_version})`);

        onValidated(payload, validationResult);
      } catch (err) {
        toast.error(`فشل التحقق من صحة ملف النسخة الاحتياطية: ${errorMessage(err)}`);
        setFileName(null);
      }
    };

    reader.onerror = () => {
      toast.error('خطأ في قراءة الملف');
      setFileName(null);
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileProcess(files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileProcess(files[0]);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
          <IconUpload className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">استعادة النظام من ملف خارجي</h3>
          <p className="text-xs text-gray-500">
            سحب وإفلات ملف JSON للتحقق المسبق من تكامله ومطابقة السجلات قبل تنفيذ الاستعادة.
          </p>
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mt-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
          isDragging
            ? 'border-amber-500 bg-amber-50/50 scale-[0.99]'
            : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {validateMutation.isPending ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <svg className="animate-spin h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs font-semibold text-gray-700">جاري فحص وتدقيق هيكل الملف والميتاداتا...</span>
          </div>
        ) : fileName ? (
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-semibold">
            <IconFileText className="w-4 h-4 text-emerald-600" />
            <span>{fileName}</span>
            <IconCheck className="w-4 h-4 text-emerald-600 mr-1" />
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-1">
              <IconUpload className="w-6 h-6" />
            </div>
            <div className="text-xs font-semibold text-gray-800">
              انقر لاختيار ملف نسخة احتياطية (.json) أو اسحبه إلى هنا
            </div>
            <div className="text-[11px] text-gray-400">
              يقبل ملفات النسخ الاحتياطية بصيغة JSON المعتمدة فقط
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
        <IconAlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <span>
          <strong>إجراء أمان:</strong> الاستعادة عملية حساسة. سيتم فتح نافذة معاينة مقارنة فورية بعد اختيار الملف، وأخذ نقطة أمان آلية قبل كتابة أي سجل في قاعدة البيانات.
        </span>
      </div>
    </div>
  );
}
