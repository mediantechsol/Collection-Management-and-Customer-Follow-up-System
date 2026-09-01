import type { ReactNode } from 'react';

export interface TooltipItem {
  label: string;
  value: string | number;
  color?: string;
}

interface Props {
  title?: string;
  items: TooltipItem[];
  extra?: ReactNode;
}

export function ChartTooltip({ title, items, extra }: Props) {
  return (
    <div className="rounded-xl border border-white/15 bg-navy-900/95 p-3 text-xs text-white shadow-2xl backdrop-blur-md transition-all duration-150">
      {title && <div className="mb-2 font-bold text-gray-200 border-b border-white/10 pb-1">{title}</div>}
      <div className="space-y-1.5">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              {it.color && (
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: it.color }}
                />
              )}
              <span className="text-gray-300">{it.label}:</span>
            </div>
            <span className="font-semibold text-white mono">{it.value}</span>
          </div>
        ))}
      </div>
      {extra && <div className="mt-2 border-t border-white/10 pt-1.5 text-[11px] text-gray-300">{extra}</div>}
    </div>
  );
}
