import { useState } from 'react';
import { IconTarget } from '@/components/ui/Icons';
import type { CustomerStatusDistributionItem } from '@/types/models';

interface Props {
  data: CustomerStatusDistributionItem[];
  loading?: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; label: string }> = {
  active: { bg: '#10B981', label: 'عملاء منتظمون (نشط)' },
  overdue: { bg: '#EF4444', label: 'عملاء متعثرون' },
  settled: { bg: '#64748B', label: 'عملاء مسددون' },
};

export function CustomerStatusDistributionChart({ data, loading }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="card flex h-[340px] flex-col items-center justify-center p-5">
        <div className="h-36 w-36 animate-pulse rounded-full border-8 border-gray-200" />
        <div className="mt-4 h-4 w-28 rounded bg-gray-200 animate-pulse" />
      </div>
    );
  }

  const totalCount = data.reduce((s, it) => s + (it.count || 0), 0);

  let cumulativePercent = 0;
  const slices = data
    .filter((d) => d.count > 0 || d.percentage > 0)
    .map((item, idx) => {
      const p = totalCount > 0 ? item.count / totalCount : 1 / data.length;
      const startPercent = cumulativePercent;
      cumulativePercent += p;
      const endPercent = cumulativePercent;

      const outerR = hoveredIdx === idx ? 75 : 72;
      const innerR = 46;
      const cx = 100;
      const cy = 100;

      const path = makeDonutPath(startPercent, endPercent, outerR, innerR, cx, cy);
      return {
        ...item,
        path,
        startPercent,
        endPercent,
        color: STATUS_COLORS[item.status] ?? { bg: '#64748B', label: item.status_label },
      };
    });

  const activeItem = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div className="card flex flex-col justify-between p-5">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <IconTarget className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-bold text-gray-900">توزيع العملاء حسب الحالة</h3>
        </div>
        <span className="text-xs text-gray-500 font-medium">نشط / متعثر / مسدد</span>
      </div>

      <div className="my-3 flex flex-col items-center justify-center sm:flex-row sm:gap-6">
        {/* الدائرة البيانية SVG */}
        <div className="relative flex h-[180px] w-[180px] shrink-0 items-center justify-center">
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90 transform">
            {slices.length === 0 ? (
              <circle cx="100" cy="100" r="70" fill="none" stroke="#F1F5F9" strokeWidth="26" />
            ) : (
              slices.map((slice, idx) => (
                <path
                  key={slice.status}
                  d={slice.path}
                  fill={slice.color.bg}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  className="cursor-pointer transition-all duration-150 hover:opacity-90"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              ))
            )}
          </svg>

          {/* المركز */}
          <div className="pointer-events-none absolute flex flex-col items-center justify-center text-center">
            {activeItem ? (
              <>
                <span className="text-xs font-bold text-gray-500">{activeItem.status_label}</span>
                <span className="text-base font-bold text-gray-900 mono">{activeItem.percentage}%</span>
              </>
            ) : (
              <>
                <span className="text-[11px] text-gray-400 font-medium">إجمالي العملاء</span>
                <span className="text-lg font-bold text-gray-800 mono">{totalCount}</span>
                <span className="text-[10px] text-gray-400">عميل</span>
              </>
            )}
          </div>
        </div>

        {/* وسيلة الإيضاح */}
        <div className="mt-3 flex flex-1 flex-col justify-center gap-2 sm:mt-0">
          {data.map((item, idx) => {
            const meta = STATUS_COLORS[item.status] ?? { bg: '#64748B', label: item.status_label };
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={item.status}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`flex cursor-pointer items-center justify-between rounded-lg p-2 transition-colors ${
                  isHovered ? 'bg-gray-100 ring-1 ring-gray-200' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: meta.bg }}
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-800">{meta.label}</div>
                    <div className="text-[11px] text-gray-400 mono">
                      {item.count} عميل
                    </div>
                  </div>
                </div>
                <div className="text-left">
                  <span className="text-xs font-bold text-gray-900 mono">{item.percentage}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* لوحة التفاصيل الثابتة لمنع أي اهتزاز في الارتفاع */}
      <div className="min-h-[48px] rounded-lg border border-gray-100 bg-gray-50/70 p-2 text-xs flex items-center justify-between">
        {activeItem ? (
          <>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: activeItem.color.bg }} />
              <span className="font-bold text-gray-800">{activeItem.status_label}:</span>
              <span className="text-gray-600 mono">{activeItem.count} عميل</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">النسبة المئوية:</span>
              <span className="rounded bg-white px-1.5 py-0.5 font-bold text-gray-700 shadow-sm mono">{activeItem.percentage}%</span>
            </div>
          </>
        ) : (
          <span className="w-full text-center text-gray-400 text-[11.5px]">
            مرر مؤشر الماوس فوق أي شريحة حالة لعرض التفاصيل
          </span>
        )}
      </div>
    </div>
  );
}

function getCoordinatesForPercent(percent: number, radius: number, cx = 100, cy = 100) {
  const x = cx + radius * Math.cos(2 * Math.PI * percent);
  const y = cy + radius * Math.sin(2 * Math.PI * percent);
  return [x, y];
}

function makeDonutPath(startPercent: number, endPercent: number, outerR: number, innerR: number, cx = 100, cy = 100) {
  let adjustedEnd = endPercent;
  if (adjustedEnd - startPercent >= 0.9999) {
    adjustedEnd = startPercent + 0.9999;
  }
  const [startX, startY] = getCoordinatesForPercent(startPercent, outerR, cx, cy);
  const [endX, endY] = getCoordinatesForPercent(adjustedEnd, outerR, cx, cy);
  const [innerStartX, innerStartY] = getCoordinatesForPercent(startPercent, innerR, cx, cy);
  const [innerEndX, innerEndY] = getCoordinatesForPercent(adjustedEnd, innerR, cx, cy);

  const largeArcFlag = adjustedEnd - startPercent > 0.5 ? 1 : 0;

  return `M ${startX} ${startY}
          A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${endX} ${endY}
          L ${innerEndX} ${innerEndY}
          A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}
          Z`;
}
