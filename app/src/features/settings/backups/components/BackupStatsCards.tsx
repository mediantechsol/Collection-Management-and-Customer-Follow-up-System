import type { SystemBackupRecord } from '@/types/models';
import { IconArchive, IconClock, IconShield, IconDatabase } from '@/components/ui/Icons';

interface Props {
  backups: SystemBackupRecord[];
  isLoading: boolean;
}

export function BackupStatsCards({ backups, isLoading }: Props) {
  const totalCount = backups.length;
  const safetyCount = backups.filter((b) => b.backup_type === 'safety_pre_restore').length;
  const latestBackup = backups[0];

  const formattedLatestDate = latestBackup?.created_at
    ? latestBackup.created_at.replace('T', ' ').substring(0, 16)
    : 'لا توجد نسخ سابقة';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* بطاقة 1: إجمالي النسخ */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <IconArchive className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">إجمالي النسخ الاحتياطية</div>
          <div className="text-lg font-bold text-gray-900 mt-0.5">
            {isLoading ? '...' : `${totalCount} نسخة`}
          </div>
        </div>
      </div>

      {/* بطاقة 2: آخر نسخة احتياطية */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <IconClock className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500">آخر نسخة احتياطية</div>
          <div className="text-sm font-bold text-gray-900 mt-0.5 truncate" title={formattedLatestDate}>
            {isLoading ? '...' : formattedLatestDate}
          </div>
        </div>
      </div>

      {/* بطاقة 3: نقاط الأمان الآلية */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
          <IconShield className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">نقاط الأمان التلقائية</div>
          <div className="text-lg font-bold text-gray-900 mt-0.5">
            {isLoading ? '...' : `${safetyCount} نقطة`}
          </div>
        </div>
      </div>

      {/* بطاقة 4: حالة حماية النظام */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
          <IconDatabase className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">حالة تكامل البيانات</div>
          <div className="text-sm font-bold text-emerald-600 mt-0.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            محمي ومشفر
          </div>
        </div>
      </div>
    </div>
  );
}
