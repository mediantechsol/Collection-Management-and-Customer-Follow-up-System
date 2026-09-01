import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast, errorMessage } from '@/components/ui/Toast';
import { IconCheck, IconInfo, IconRefresh } from '@/components/ui/Icons';
import { usePersonalTiers, useUpdateTierSettings } from '@/lib/queries';
import type { PersonalTierKey } from '@/types/models';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface TierFormItem {
  id: string;
  tier_key: PersonalTierKey;
  tier_name: string;
  color: string;
}

export const DEFAULT_TIER_CONFIGS: Record<PersonalTierKey, { name: string; color: string; label: string }> = {
  A: { name: 'فئة أ (أولوية عالية)', color: '#EF4444', label: 'الفئة أ' },
  B: { name: 'فئة ب (متابعة نشطة)', color: '#F59E0B', label: 'الفئة ب' },
  C: { name: 'فئة ج (وعود ومستقر)', color: '#3B82F6', label: 'الفئة ج' },
  D: { name: 'فئة د (عام / غير مصنف)', color: '#6B7280', label: 'الفئة د' },
};

export function PersonalTiersSettingsModal({ open, onClose }: Props) {
  const toast = useToast();
  const { data: tiers = [], isLoading } = usePersonalTiers();
  const updateTierSettings = useUpdateTierSettings();

  const [formTiers, setFormTiers] = useState<TierFormItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // تهيئة الحالة عند فتح المودال أو وصول البيانات
  useEffect(() => {
    if (!open) return;
    setError(null);

    const keys: PersonalTierKey[] = ['A', 'B', 'C', 'D'];
    const initial: TierFormItem[] = keys.map((key) => {
      const found = tiers.find((t) => t.tier_key === key);
      return {
        id: found?.id ?? '',
        tier_key: key,
        tier_name: found?.tier_name || DEFAULT_TIER_CONFIGS[key].name,
        color: found?.color || DEFAULT_TIER_CONFIGS[key].color,
      };
    });

    setFormTiers(initial);
  }, [open, tiers]);

  const handleNameChange = (tierKey: PersonalTierKey, name: string) => {
    setError(null);
    setFormTiers((prev) =>
      prev.map((item) => (item.tier_key === tierKey ? { ...item, tier_name: name } : item)),
    );
  };

  const handleResetDefaults = () => {
    setError(null);
    setFormTiers((prev) =>
      prev.map((item) => ({
        ...item,
        tier_name: DEFAULT_TIER_CONFIGS[item.tier_key].name,
        color: DEFAULT_TIER_CONFIGS[item.tier_key].color,
      })),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // التحقق من صحة الأسماء
    for (const item of formTiers) {
      const trimmed = item.tier_name.trim();
      if (!trimmed) {
        setError(`اسم ${DEFAULT_TIER_CONFIGS[item.tier_key].label} لا يمكن أن يكون فارغاً`);
        return;
      }
      if (trimmed.length > 30) {
        setError(`اسم ${DEFAULT_TIER_CONFIGS[item.tier_key].label} يجب ألا يتجاوز 30 حرفاً`);
        return;
      }
    }

    try {
      const payload = formTiers
        .filter((item) => !!item.id)
        .map((item) => ({
          id: item.id,
          tier_name: item.tier_name.trim(),
          color: item.color,
        }));

      if (payload.length > 0) {
        await updateTierSettings.mutateAsync(payload);
      }

      toast.show('تم تحديث مسميات فئاتك الشخصية بنجاح');
      onClose();
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <Modal
      open={open}
      title="تخصيص مسميات الفئات الشخصية (أ / ب / ج / د)"
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-600 leading-relaxed">
          يمكنك تخصيص مسميات فئاتك الأربع بما يناسب أسلوبك وطريقة متابعتك اليومية للعملاء:
        </p>

        {error && (
          <div className="rounded-md bg-red-50 p-2.5 text-xs font-semibold text-red-600">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-xs text-gray-500">جاري تحميل الفئات…</div>
        ) : (
          <div className="space-y-3">
            {formTiers.map((item) => {
              const conf = DEFAULT_TIER_CONFIGS[item.tier_key];
              return (
                <div
                  key={item.tier_key}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-2.5 transition hover:bg-gray-50"
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full ring-2 ring-white shadow-sm"
                      style={{ backgroundColor: conf.color }}
                    />
                    <span className="w-16 text-xs font-bold text-gray-700">{conf.label}</span>
                  </div>

                  <input
                    type="text"
                    className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                    placeholder={`مسمى ${conf.label}…`}
                    value={item.tier_name}
                    maxLength={30}
                    onChange={(e) => handleNameChange(item.tier_key, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-md bg-blue-50/70 p-3 text-[11.5px] text-blue-800 flex items-start gap-2.5">
          <IconInfo className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
          <span>
            <strong>ملاحظة:</strong> هذه المسميات خاصة بحسابك فقط لتسهيل تنظيم مهامك اليومية، ولا تظهر لزملائك أو الإدارة ولا تؤثر على نسب الحوافز المالية.
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <button
            type="button"
            className="btn btn-outline btn-sm text-gray-600 hover:text-gray-900 gap-1.5"
            onClick={handleResetDefaults}
            disabled={updateTierSettings.isPending}
          >
            <IconRefresh className="h-3.5 w-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClose}
              disabled={updateTierSettings.isPending}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={updateTierSettings.isPending || isLoading}
            >
              {updateTierSettings.isPending ? (
                'جاري الحفظ…'
              ) : (
                <>
                  <IconCheck className="h-3.5 w-3.5" />
                  <span>حفظ التعديلات</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
