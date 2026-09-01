import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useRestoreBackup } from '@/lib/queries';
import { useToast, errorMessage } from '@/components/ui/Toast';
import { IconAlertCircle, IconShield, IconRotateCcw } from '@/components/ui/Icons';
import type { SystemBackupPayload, BackupValidationResult } from '@/types/models';

interface Props {
  open: boolean;
  onClose: () => void;
  payload: SystemBackupPayload | null;
  validationResult: BackupValidationResult | null;
  onSuccess?: () => void;
}

const REQUIRED_CONFIRM_PHRASE = 'استعادة البيانات';

export function RestorePreviewModal({
  open,
  onClose,
  payload,
  validationResult,
  onSuccess,
}: Props) {
  const [createSafetySnapshot, setCreateSafetySnapshot] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const toast = useToast();
  const restoreMutation = useRestoreBackup();

  if (!open || !payload || !validationResult) return null;

  const isConfirmed = confirmText.trim() === REQUIRED_CONFIRM_PHRASE;

  const handleExecuteRestore = async () => {
    if (!isConfirmed) return;

    try {
      const res = await restoreMutation.mutateAsync({
        payload,
        createSafetySnapshot,
      });

      toast.show(res.message || 'تمت استعادة بيانات النظام بنجاح وتحديث كافة السجلات.');

      onSuccess?.();
      onClose();
      setConfirmText('');
    } catch (err) {
      toast.error(`فشلت عملية الاستعادة: ${errorMessage(err)}`);
    }
  };

  const manifest = validationResult.manifest;
  const backupCounts = validationResult.table_counts || {};
  const dbCounts = validationResult.current_database_counts || {
    customers: 0,
    balances: 0,
    followups: 0,
    collections: 0,
    custom_reminders: 0,
  };

  const comparisonRows = [
    { label: 'العملاء (Customers)', inBackup: backupCounts.customers ?? 0, inDB: dbCounts.customers ?? 0 },
    { label: 'الأرصدة (Balances)', inBackup: backupCounts.balances ?? 0, inDB: dbCounts.balances ?? 0 },
    { label: 'سجل المتابعات (Followups)', inBackup: backupCounts.followups ?? 0, inDB: dbCounts.followups ?? 0 },
    { label: 'الدفعات المحصلة (Collections)', inBackup: backupCounts.collections ?? 0, inDB: dbCounts.collections ?? 0 },
    { label: 'الحوافز المعتمدة (Incentives)', inBackup: backupCounts.incentives ?? 0, inDB: '—' },
    { label: 'التذكيرات الحرة (Reminders)', inBackup: backupCounts.custom_reminders ?? 0, inDB: dbCounts.custom_reminders ?? 0 },
    { label: 'فئات العملاء (Categories)', inBackup: backupCounts.customer_categories ?? 0, inDB: '—' },
    { label: 'إعدادات النظام (Settings)', inBackup: backupCounts.settings ?? 0, inDB: '—' },
  ];

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!restoreMutation.isPending) {
          onClose();
          setConfirmText('');
        }
      }}
      title="معاينة وتأكيد استعادة النظام الشاملة"
      wide={true}
    >
      <div className="space-y-4 text-xs">
        {/* بطاقة تحذير حرجة */}
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
            <IconAlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-rose-900">تنبيه أمان فائق الحساسية (Data Replacement)</h4>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed">
              ستقوم هذه العملية باستبدال كافة بيانات النظام الحالية (العملاء، الأرصدة، المتابعات، الدفعات، والحوافز) بالبيانات الموجودة في ملف النسخة الاحتياطية.
            </p>
          </div>
        </div>

        {/* بيانات الميتاداتا للنسخة */}
        <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[11px] text-gray-500">اسم النسخة</div>
            <div className="font-bold text-gray-900 truncate" title={manifest.backup_name}>
              {manifest.backup_name || 'نسخة احتياطية'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">تاريخ الإنشاء</div>
            <div className="font-bold text-gray-900">
              {manifest.created_at ? manifest.created_at.replace('T', ' ').substring(0, 16) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">المنشئ</div>
            <div className="font-bold text-gray-900">{manifest.created_by_username || 'مدير النظام'}</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">إصدار الهيكل</div>
            <div className="font-bold text-emerald-600">V{manifest.format_version || '2.0'} متوافق</div>
          </div>
        </div>

        {/* جدول مقارنة السجلات */}
        <div>
          <div className="font-bold text-gray-900 mb-2 flex items-center justify-between">
            <span>مقارنة أعداد السجلات:</span>
            <span className="text-[11px] font-normal text-gray-500">المطابقة قبل وبعد الاستعادة</span>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-right divide-y divide-gray-200">
              <thead className="bg-gray-100 text-gray-600 sticky top-0">
                <tr>
                  <th className="py-2 px-3 font-semibold">الجدول / الكيان</th>
                  <th className="py-2 px-3 font-semibold text-center">في ملف النسخة</th>
                  <th className="py-2 px-3 font-semibold text-center">الحالي في النظام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {comparisonRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-1.5 px-3 font-medium text-gray-800">{row.label}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-emerald-600">{row.inBackup}</td>
                    <td className="py-1.5 px-3 text-center text-gray-600">{row.inDB}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* خيار نقطة الأمان الآلية */}
        <label className="flex items-center gap-2.5 bg-blue-50/80 border border-blue-200 rounded-xl p-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={createSafetySnapshot}
            onChange={(e) => setCreateSafetySnapshot(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <div className="flex-1">
            <div className="font-bold text-blue-900 flex items-center gap-1.5">
              <IconShield className="w-4 h-4 text-blue-600" />
              <span>أخذ نقطة أمان آلية تلقائية قبل البدء (موصى به جداً)</span>
            </div>
            <div className="text-[11px] text-blue-700 mt-0.5">
              سيقوم النظام بحفظ نسخة احتياطية من الحالة الحالية تلقائياً قبل مسح البيانات للرجوع إليها في أي وقت.
            </div>
          </div>
        </label>

        {/* التأكيد النصي الإلزامي */}
        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1.5">
          <label className="block text-xs font-semibold text-gray-800">
            للتأكيد، يرجى كتابة عبارة <span className="text-rose-600 font-bold select-all">"{REQUIRED_CONFIRM_PHRASE}"</span> في الحقل أدناه:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={`اكتب "${REQUIRED_CONFIRM_PHRASE}" لتفعيل الزر`}
            disabled={restoreMutation.isPending}
            className="w-full text-xs font-bold rounded-lg border border-gray-300 px-3 py-2 text-rose-700 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-gray-100"
          />
        </div>

        {/* أزرار الإجراءات */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={restoreMutation.isPending}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
          >
            إلغاء التراجع
          </button>

          <button
            type="button"
            onClick={handleExecuteRestore}
            disabled={!isConfirmed || restoreMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {restoreMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>جاري تنفيذ الاستعادة الذرية الشاملة...</span>
              </>
            ) : (
              <>
                <IconRotateCcw className="w-4 h-4" />
                <span>تأكيد وتنفيذ الاستعادة الشاملة</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
