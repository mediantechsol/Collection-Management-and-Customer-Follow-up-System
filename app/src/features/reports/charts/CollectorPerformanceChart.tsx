import { useState } from 'react';
import { fmt } from '@/lib/logic/money';
import { IconUserGroup } from '@/components/ui/Icons';
import type { CollectorPerformanceItem } from '@/types/models';

interface Props {
  data: CollectorPerformanceItem[];
  loading?: boolean;
}

export function CollectorPerformanceChart({ data, loading }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="card flex h-[340px] flex-col justify-between p-5">
        <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.total_due_yer, d.total_collected_yer)),
    1000,
  );

  const activeItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="card flex flex-col justify-between p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <IconUserGroup className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-gray-900">مقارنة أداء مسؤولي التحصيل</h3>
            <span className="text-[11px] text-gray-400">
              المبالغ المستحقة مقابل المبالغ المحصلة فعلياً
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
            <span className="text-gray-600 font-medium">المستحق</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            <span className="text-gray-600 font-medium">المحصل</span>
          </div>
        </div>
      </div>

      <div className="my-3 flex-1 space-y-3.5 overflow-y-auto max-h-[220px] pe-1">
        {data.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-gray-400">
            لا توجد بيانات محصلين في النطاق المحدد
          </div>
        ) : (
          data.map((item, idx) => {
            const duePercent = (item.total_due_yer / maxVal) * 100;
            const colPercent = (item.total_collected_yer / maxVal) * 100;
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={item.user_id}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`cursor-pointer rounded-lg p-2.5 transition-colors ${
                  isHovered ? 'bg-gray-100 ring-1 ring-gray-200' : 'hover:bg-gray-50'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-800">{item.collector_name}</span>
                    <span className="text-[11px] text-gray-400">
                      ({item.customer_count} عميل)
                    </span>
                  </div>

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold mono ${
                      item.collection_rate >= 50
                        ? 'bg-emerald-50 text-emerald-700'
                        : item.collection_rate >= 25
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    إنجاز {item.collection_rate}%
                  </span>
                </div>

                {/* أشرطة المقارنة الأفقية */}
                <div className="space-y-1">
                  {/* شريط المستحق */}
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${Math.max(2, duePercent)}%` }}
                      />
                    </div>
                    <span className="w-24 text-left text-[10.5px] text-gray-500 mono font-semibold">
                      {fmt(item.total_due_yer)} ر.ي
                    </span>
                  </div>

                  {/* شريط المحصل */}
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.max(2, colPercent)}%` }}
                      />
                    </div>
                    <span className="w-24 text-left text-[10.5px] text-emerald-600 mono font-bold">
                      {fmt(item.total_collected_yer)} ر.ي
                    </span>
                  </div>
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
              <span className="font-bold text-gray-800">{activeItem.collector_name}:</span>
              <span className="text-gray-500">
                مستحق: <strong className="text-gray-700 mono">{fmt(activeItem.total_due_yer)}</strong> |{' '}
                محصل: <strong className="text-emerald-700 mono">{fmt(activeItem.total_collected_yer)}</strong>
              </span>
            </div>
            <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 mono">
              إنجاز {activeItem.collection_rate}%
            </span>
          </>
        ) : (
          <span className="w-full text-center text-gray-400 text-[11.5px]">
            مرر مؤشر الماوس فوق أي محصل للاطلاع على تفاصيل الأداء
          </span>
        )}
      </div>
    </div>
  );
}
