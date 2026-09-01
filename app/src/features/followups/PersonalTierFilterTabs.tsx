import { useMemo } from 'react';
import { usePersonalTiers } from '@/lib/queries';
import { IconFilter } from '@/components/ui/Icons';
import { DEFAULT_TIER_CONFIGS } from './PersonalTiersSettingsModal';
import type { PersonalTierKey } from '@/types/models';

interface Props {
  selectedTier: PersonalTierKey | 'ALL';
  onSelectTier: (tier: PersonalTierKey | 'ALL') => void;
  counts: Record<PersonalTierKey | 'ALL', number>;
}

const TIER_KEYS: PersonalTierKey[] = ['A', 'B', 'C', 'D'];

export function PersonalTierFilterTabs({
  selectedTier,
  onSelectTier,
  counts,
}: Props) {
  const { data: tiers = [] } = usePersonalTiers();

  const tierMap = useMemo(() => {
    const map = new Map<PersonalTierKey, { name: string; color: string; label: string }>();
    for (const key of TIER_KEYS) {
      const found = tiers.find((t) => t.tier_key === key);
      map.set(key, {
        name: found?.tier_name || DEFAULT_TIER_CONFIGS[key].name,
        color: found?.color || DEFAULT_TIER_CONFIGS[key].color,
        label: DEFAULT_TIER_CONFIGS[key].label,
      });
    }
    return map;
  }, [tiers]);

  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white p-1.5 shadow-xs">
      <div className="hidden sm:flex items-center gap-1 px-2.5 text-xs font-semibold text-gray-500">
        <IconFilter className="h-3.5 w-3.5" />
        <span>تصنيفاتي:</span>
      </div>

      {/* تبويب الكل */}
      <button
        type="button"
        onClick={() => onSelectTier('ALL')}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
          selectedTier === 'ALL'
            ? 'bg-gray-900 text-white shadow-xs'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <span>الكل</span>
        <span
          className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-semibold mono ${
            selectedTier === 'ALL'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {counts.ALL}
        </span>
      </button>

      {/* تبويبات الفئات الأربع */}
      {TIER_KEYS.map((key) => {
        const config = tierMap.get(key) ?? DEFAULT_TIER_CONFIGS[key];
        const isSelected = selectedTier === key;
        const count = counts[key] ?? 0;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectTier(key)}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
              isSelected
                ? 'bg-blue-50 text-blue-700 ring-1.5 ring-blue-500/30 shadow-xs'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: config.color }}
            />
            <span className="truncate max-w-[140px]">{config.name}</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-semibold mono ${
                isSelected
                  ? 'bg-blue-200/70 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
