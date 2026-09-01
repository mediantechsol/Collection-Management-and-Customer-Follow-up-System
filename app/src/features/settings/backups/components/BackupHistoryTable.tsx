import { useState } from 'react';
import { useDeleteBackupRecord } from '@/lib/queries';
import { useToast, errorMessage } from '@/components/ui/Toast';
import { Pill } from '@/components/ui/Pill';
import { Modal } from '@/components/ui/Modal';
import { IconTrash, IconHistory, IconArchive } from '@/components/ui/Icons';
import type { SystemBackupRecord, BackupType } from '@/types/models';

interface Props {
  backups: SystemBackupRecord[];
  isLoading: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const TYPE_CONFIG: Record<BackupType, { label: string; tone: 'green' | 'blue' | 'purple' }> = {
  manual: { label: 'يدوية', tone: 'green' },
  safety_pre_restore: { label: 'نقطة أمان تلقائية', tone: 'blue' },
  auto_scheduled: { label: 'مجدولة', tone: 'purple' },
};

export function BackupHistoryTable({ backups, isLoading }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<SystemBackupRecord | null>(null);
  const toast = useToast();
  const deleteMutation = useDeleteBackupRecord();

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.show('تم حذف سجل النسخة الاحتياطية بنجاح');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(`فشل حذف سجل النسخة الاحتياطية: ${errorMessage(err)}`);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center">
            <IconHistory className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">سجل عمليات النسخ الاحتياطي ونقاط الأمان</h3>
            <p className="text-[11px] text-gray-500">سجل كامل وموثق للنسخ السحابية والمحلية المخزنة في النظام.</p>
          </div>
        </div>
        <span className="text-xs text-gray-400">
          {backups.length} {backups.length === 1 ? 'سجل' : 'سجلات'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right divide-y divide-gray-100 text-xs">
          <thead className="bg-gray-50/75 text-gray-600 font-semibold">
            <tr>
              <th className="py-2.5 px-4">اسم النسخة / الملف</th>
              <th className="py-2.5 px-3 text-center">النوع</th>
              <th className="py-2.5 px-3 text-center">الحجم</th>
              <th className="py-2.5 px-3 text-center">إحصائية السجلات</th>
              <th className="py-2.5 px-4">تاريخ الإنشاء</th>
              <th className="py-2.5 px-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>جاري تحميل سجل النسخ...</span>
                  </div>
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center">
                      <IconArchive className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-semibold text-gray-600">لا توجد نسخ احتياطية مسجلة حتى الآن</div>
                    <div className="text-[11px] text-gray-400">يمكنك إنشاء نسخة جديدة من الزر أعلاه.</div>
                  </div>
                </td>
              </tr>
            ) : (
              backups.map((backup) => {
                const typeInfo = TYPE_CONFIG[backup.backup_type] || { label: backup.backup_type, tone: 'green' };
                const counts = backup.table_counts || {};
                const totalRecords = Object.values(counts).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);

                return (
                  <tr key={backup.id} className="hover:bg-gray-50/80 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-gray-900">{backup.backup_name}</div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">{backup.file_name}</div>
                      {backup.notes && (
                        <div className="text-[11px] text-amber-700 bg-amber-50/60 px-2 py-0.5 rounded mt-1 inline-block">
                          {backup.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Pill tone={typeInfo.tone}>{typeInfo.label}</Pill>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-gray-700">
                      {formatBytes(backup.file_size_bytes)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-1 rounded text-[11px] font-medium"
                        title={`عملاء: ${counts.customers ?? 0} | متابعات: ${counts.followups ?? 0} | دفعات: ${counts.collections ?? 0}`}
                      >
                        {totalRecords > 0 ? `${totalRecords} سجل` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      <div>{backup.created_at ? backup.created_at.slice(0, 10) : '—'}</div>
                      <div className="text-[11px] text-gray-400">
                        {backup.created_at?.split('T')[1]?.substring(0, 5) || ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(backup)}
                        title="حذف سجل النسخة"
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* مودال تأكيد حذف السجل */}
      {deleteTarget && (
        <Modal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="تأكيد حذف سجل النسخة الاحتياطية"
        >
          <div className="space-y-3 text-xs">
            <p className="text-gray-700 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف سجل النسخة الاحتياطية:
              <br />
              <strong className="text-gray-900 block mt-1">{deleteTarget.backup_name}</strong>
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="px-3.5 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 font-medium"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
