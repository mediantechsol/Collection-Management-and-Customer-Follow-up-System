import { useState } from 'react';
import { fmt } from '@/lib/logic/money';
import { CategoryDot } from '@/components/ui/Pill';
import { IconCash } from '@/components/ui/Icons';
import type { CategoryDebtItem } from '@/types/models';

interface Props {
  data: CategoryDebtItem[];
  loading?: boolean;
}

export function CategoryDebtChart({ data, loading }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="card flex h-[340px] flex-col justify-between p-5">
        <div className="h-5 w-44 animate-pulse rounded bg-gray-200" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.total_debt_yer), 1000);
  const activeItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="card flex flex-col justify-between p-5">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <IconCash className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-bold text-gray-900">إجمالي المديونيات حسب الفئة</h3>
        </div>
        <span className="text-xs text-gray-500 font-medium">المبالغ والأوزان النسبية</span>
      </div>

      <div className="my-3 flex-1 space-y-3.5 overflow-y-auto max-h-[220px] pe-1">
        {data.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-gray-400">
            لا توجد فئات عملاء مسجلة
          </div>
        ) : (
          data.map((item, idx) => {
            const widthRatio = (item.total_debt_yer / maxVal) * 100;
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={item.category_id ?? `cat-${idx}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`cursor-pointer rounded-lg p-2.5 transition-colors ${
                  isHovered ? 'bg-gray-100 ring-1 ring-gray-200' : 'hover:bg-gray-50'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CategoryDot color={item.category_color} />
                    <span className="text-xs font-bold text-gray-800">{item.category_name}</span>
                    <span className="text-[11px] text-gray-400">({item.customer_count} عميل)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-900 mono">
                      {fmt(item.total_debt_yer)} ر.ي
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-bold text-gray-600 mono">
                      {item.percentage}%
                    </span>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(2, widthRatio)}%`,
                      backgroundColor: item.category_color || '#3B82F6',
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* لوحة التفاصيل الثابتة لمنع أي اهتزاز في الارتفاع */}
      <div className="min-h-[48px] rounded-lg border border-gray-100 bg-gray-50/70 p-2 text-xs flex items-center justify-between">
        {activeItem ? (
          <>
            <div className="flex items-center gap-2">
              <CategoryDot color={activeItem.category_color} />
              <span className="font-bold text-gray-800">{activeItem.category_name}:</span>
              <span className="text-gray-600 mono">{fmt(activeItem.total_debt_yer)} ر.ي</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">مساهمة الدين:</span>
              <span className="rounded bg-white px-1.5 py-0.5 font-bold text-gray-700 shadow-sm mono">{activeItem.percentage}%</span>
            </div>
          </>
        ) : (
          <span className="w-full text-center text-gray-400 text-[11.5px]">
            مرر مؤشر الماوس فوق أي فئة للاطلاع على التفاصيل
          </span>
        )}
      </div>
    </div>
  );
}
