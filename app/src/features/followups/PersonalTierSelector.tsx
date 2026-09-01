import { useMemo } from 'react';
import { usePersonalTiers, useSetCustomerPersonalTier } from '@/lib/queries';
import { DEFAULT_TIER_CONFIGS } from './PersonalTiersSettingsModal';
import type { PersonalTierKey, UUID } from '@/types/models';

interface Props {
  customerId: UUID;
  currentTierKey?: PersonalTierKey;
  compact?: boolean;
  disabled?: boolean;
}

const TIERS_LIST: Array<{ key: PersonalTierKey; char: string }> = [
  { key: 'A', char: 'أ' },
  { key: 'B', char: 'ب' },
  { key: 'C', char: 'ج' },
  { key: 'D', char: 'د' },
];

export function PersonalTierSelector({
  customerId,
  currentTierKey = 'D',
  compact = false,
  disabled = false,
}: Props) {
  const { data: tiers = [] } = usePersonalTiers();
  const setCustomerTier = useSetCustomerPersonalTier();

  const tierMap = useMemo(() => {
    const map = new Map<PersonalTierKey, { name: string; color: string }>();
    for (const item of TIERS_LIST) {
      const found = tiers.find((t) => t.tier_key === item.key);
      map.set(item.key, {
        name: found?.tier_name || DEFAULT_TIER_CONFIGS[item.key].name,
        color: found?.color || DEFAULT_TIER_CONFIGS[item.key].color,
      });
    }
    return map;
  }, [tiers]);

  const handleSelect = (e: React.MouseEvent, key: PersonalTierKey) => {
    e.stopPropagation(); // منع التنقل لصفحة العميل عند النقر على الزر داخل الجدول
    if (disabled || key === currentTierKey) return;
    setCustomerTier.mutate({ customerId, tierKey: key });
  };

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm ${
        compact ? 'gap-0.5' : 'gap-1'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {TIERS_LIST.map(({ key, char }) => {
        const isSelected = key === currentTierKey;
        const config = tierMap.get(key) ?? DEFAULT_TIER_CONFIGS[key];

        return (
          <button
            key={key}
            type="button"
            title={`${DEFAULT_TIER_CONFIGS[key].label}: ${config.name}`}
            disabled={disabled || setCustomerTier.isPending}
            onClick={(e) => handleSelect(e, key)}
            className={`font-bold transition-all duration-150 rounded ${
              compact ? 'h-5 w-5 text-[11px]' : 'h-6 w-6 text-xs'
            } flex items-center justify-center ${
              isSelected
                ? 'text-white shadow-xs scale-105 ring-1 ring-black/10'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
            style={{
              backgroundColor: isSelected ? config.color : 'transparent',
            }}
          >
            {char}
          </button>
        );
      })}
    </div>
  );
}
