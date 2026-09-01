import { useState } from 'react';
import { useSystemBackups } from '@/lib/queries';
import { BackupStatsCards } from './components/BackupStatsCards';
import { CreateBackupCard } from './components/CreateBackupCard';
import { RestoreDropzone } from './components/RestoreDropzone';
import { RestorePreviewModal } from './components/RestorePreviewModal';
import { BackupHistoryTable } from './components/BackupHistoryTable';
import type { SystemBackupPayload, BackupValidationResult } from '@/types/models';

export function BackupRestoreCenter() {
  const { data: backups = [], isLoading } = useSystemBackups();
  const [modalState, setModalState] = useState<{
    open: boolean;
    payload: SystemBackupPayload | null;
    validationResult: BackupValidationResult | null;
  }>({
    open: false,
    payload: null,
    validationResult: null,
  });

  const handleFileValidated = (payload: SystemBackupPayload, validationResult: BackupValidationResult) => {
    setModalState({
      open: true,
      payload,
      validationResult,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. بطاقات الإحصائيات الأربع */}
      <BackupStatsCards backups={backups} isLoading={isLoading} />

      {/* 2. قسم الإجراءات (إنشاء نسخة فورية + استعادة من ملف) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CreateBackupCard />
        <RestoreDropzone onValidated={handleFileValidated} />
      </div>

      {/* 3. جدول سجل النسخ الاحتياطية السحابية والمحلية */}
      <BackupHistoryTable backups={backups} isLoading={isLoading} />

      {/* 4. مودال معاينة ومقارنة النسخة قبل الاستعادة */}
      <RestorePreviewModal
        open={modalState.open}
        onClose={() => setModalState({ open: false, payload: null, validationResult: null })}
        payload={modalState.payload}
        validationResult={modalState.validationResult}
      />
    </div>
  );
}
