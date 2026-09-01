import { useState } from 'react';
import { useGenerateBackup } from '@/lib/queries';
import { useToast, errorMessage } from '@/components/ui/Toast';
import { IconDownload, IconArchive, IconShield } from '@/components/ui/Icons';

export function CreateBackupCard() {
  const [notes, setNotes] = useState('');
  const toast = useToast();
  const generateBackup = useGenerateBackup();

  const handleGenerate = async () => {
    try {
      const result = await generateBackup.mutateAsync({
        backupType: 'manual',
        notes: notes.trim() || undefined,
        autoDownload: true,
      });

      toast.show(`تم إنشاء وتحميل النسخة الاحتياطية بنجاح (${result.manifest.file_name})`);
      setNotes('');
    } catch (err) {
      toast.error(`فشل إنشاء النسخة الاحتياطية: ${errorMessage(err)}`);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <IconArchive className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">إنشاء وتصدير نسخة احتياطية فورية</h3>
          <p className="text-xs text-gray-500">
            توليد لقطة شاملة لكافة جداول وبيانات النظام (V1 + V2) وتنزيلها كملف JSON مشفر.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            ملاحظات أو وصف النسخة (اختياري)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: نسخة قبل استيراد مديونيات الربع الثالث"
            disabled={generateBackup.isPending}
            className="w-full text-xs rounded-lg border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg">
            <IconShield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>تتضمن بصمة أمان رقمية SHA-256 للمطابقة الفورية</span>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generateBackup.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generateBackup.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>جاري تجميع البيانات وتوليد الحزمة...</span>
              </>
            ) : (
              <>
                <IconDownload className="w-4 h-4" />
                <span>إنشاء وتنزيل النسخة الاحتياطية</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
