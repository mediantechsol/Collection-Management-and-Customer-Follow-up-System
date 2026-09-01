import { useState } from 'react';
import { fmt } from '@/lib/logic/money';
import { IconTrendingUp } from '@/components/ui/Icons';
import type { MonthlyTrendItem } from '@/types/models';

interface Props {
  data: MonthlyTrendItem[];
  loading?: boolean;
}

export function MonthlyCollectionTrendChart({ data, loading }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="card flex h-[340px] flex-col justify-between p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
        <div className="h-44 w-full animate-pulse rounded bg-gray-100" />
        <div className="flex justify-between">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-3 w-12 rounded bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  const maxCollected = Math.max(...data.map((d) => d.collected_yer), 1000);
  const maxRate = Math.max(...data.map((d) => d.collection_rate), 10);
  const avgRate =
    data.length > 0
      ? Math.round((data.reduce((s, d) => s + d.collection_rate, 0) / data.length) * 10) / 10
      : 0;

  const chartW = 500;
  const chartH = 160;
  const padX = 35;
  const padY = 20;

  const points = data.map((item, idx) => {
    const x =
      data.length > 1
        ? padX + (idx / (data.length - 1)) * (chartW - 2 * padX)
        : chartW / 2;
    const yRatio = Math.min(1, Math.max(0, item.collection_rate / (maxRate * 1.2 || 100)));
    const y = chartH - padY - yRatio * (chartH - 2 * padY);
    return { x, y, item, idx };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath =
    points.length > 0
      ? `M ${points[0].x} ${chartH - padY} L ${polylinePoints} L ${points[points.length - 1].x} ${chartH - padY} Z`
      : '';

  const activeItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="card flex flex-col justify-between p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <IconTrendingUp className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-gray-900">تطور نسب ومبالغ التحصيل الشهري</h3>
            <span className="text-[11px] text-gray-400">
              متوسط نسبة التحصيل:{' '}
              <strong className="font-semibold text-blue-600 mono">{avgRate}%</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
            <span className="text-gray-600 font-medium">مبالغ التحصيل</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            <span className="text-gray-600 font-medium">نسبة التحصيل %</span>
          </div>
        </div>
      </div>

      <div className="relative my-4">
        {/* SVG الرسم البياني */}
        <div className="w-full">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full overflow-visible"
            style={{ height: '175px' }}
          >
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* خطوط الشبكة الأفقية */}
            <line
              x1={padX}
              y1={padY}
              x2={chartW - padX}
              y2={padY}
              stroke="#F1F5F9"
              strokeDasharray="4 4"
            />
            <line
              x1={padX}
              y1={chartH / 2}
              x2={chartW - padX}
              y2={chartH / 2}
              stroke="#F1F5F9"
              strokeDasharray="4 4"
            />
            <line
              x1={padX}
              y1={chartH - padY}
              x2={chartW - padX}
              y2={chartH - padY}
              stroke="#E2E8F0"
            />

            {/* أعمدة المبالغ المحصلة */}
            {data.map((item, idx) => {
              const p = points[idx];
              const barW = Math.max(16, (chartW - 2 * padX) / (data.length * 2.8));
              const heightRatio = item.collected_yer / maxCollected;
              const barH = heightRatio * (chartH - 2 * padY);
              const barX = p.x - barW / 2;
              const barY = chartH - padY - barH;
              const isHovered = hoveredIdx === idx;

              return (
                <g key={item.month} className="cursor-pointer">
                  <rect
                    x={barX}
                    y={barY}
                    width={barW}
                    height={Math.max(2, barH)}
                    rx="4"
                    fill={isHovered ? '#2563EB' : '#93C5FD'}
                    className="transition-colors duration-150"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                </g>
              );
            })}

            {/* مساحة التدرج والمضلع الخطي */}
            {areaPath && <path d={areaPath} fill="url(#trendGradient)" />}
            {polylinePoints && (
              <polyline
                fill="none"
                stroke="#4F46E5"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePoints}
              />
            )}

            {/* نقاط التفاعل */}
            {points.map((p) => {
              const isHovered = hoveredIdx === p.idx;
              return (
                <g key={p.item.month} className="cursor-pointer">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 6 : 4}
                    fill="#FFFFFF"
                    stroke="#4F46E5"
                    strokeWidth={isHovered ? '3' : '2'}
                    className="transition-all duration-150"
                    onMouseEnter={() => setHoveredIdx(p.idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                  {isHovered && (
                    <text
                      x={p.x}
                      y={p.y - 10}
                      textAnchor="middle"
                      className="fill-indigo-700 font-bold text-[10.5px] mono"
                    >
                      {p.item.collection_rate}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* محور الشهور الأفقي X-Axis */}
        <div className="mt-1 flex justify-between px-6 text-[11px] text-gray-500">
          {data.map((item, idx) => (
            <span
              key={item.month}
              onClick={() => setHoveredIdx(idx)}
              className={`cursor-pointer transition-colors ${
                hoveredIdx === idx ? 'font-bold text-blue-600' : 'hover:text-gray-900'
              }`}
            >
              {item.month_label.split(' ')[0]}
            </span>
          ))}
        </div>
      </div>

      {/* لوحة التفاصيل الثابتة لمنع أي اهتزاز في الارتفاع */}
      <div className="min-h-[48px] rounded-lg border border-gray-100 bg-gray-50/70 p-2 text-xs flex items-center justify-between">
        {activeItem ? (
          <>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">{activeItem.month_label}:</span>
              <span className="text-blue-600 mono font-semibold">
                محصل: {fmt(activeItem.collected_yer)} ر.ي
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">النسبة:</span>
              <span className="rounded bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700 mono">
                {activeItem.collection_rate}%
              </span>
            </div>
          </>
        ) : (
          <span className="w-full text-center text-gray-400 text-[11.5px]">
            مرر مؤشر الماوس فوق أي شهر للاطلاع على تفاصيل التحصيل
          </span>
        )}
      </div>
    </div>
  );
}
