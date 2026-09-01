import type { ReactNode } from 'react';
import { fmt } from '@/lib/logic/money';
import { IconChart, IconUsers, IconWallet, IconCalendarAlert } from '@/components/ui/Icons';
import type { AnalyticsKPIs } from '@/types/models';

interface Props {
  kpis?: AnalyticsKPIs;
  loading?: boolean;
}

interface StatProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: ReactNode;
  icon: ReactNode;
  iconBg: string;
  iconFg: string;
  badge?: ReactNode;
  progress?: number;
}

function KpiCard({
  title,
  value,
  unit,
  subtitle,
  icon,
  iconBg,
  iconFg,
  badge,
  progress,
}: StatProps) {
  return (
    <div className="stat-card relative flex flex-col justify-between overflow-hidden transition-all duration-200 hover:shadow-md hover:border-gray-300">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-gray-500">{title}</span>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: iconBg, color: iconFg }}
          >
            {icon}
          </div>
        </div>

        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="text-[20px] font-bold text-gray-900 mono">{value}</span>
          {unit && <span className="text-xs font-semibold text-gray-500">{unit}</span>}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11.5px] text-gray-500">
        {subtitle && <div>{subtitle}</div>}
        {badge && <div>{badge}</div>}
      </div>

      {progress !== undefined && (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              backgroundColor: iconFg,
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ReportsKpiCards({ kpis, loading }: Props) {
  if (loading || !kpis) {
    return (
      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="stat-card animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-20 rounded bg-gray-200" />
              <div className="h-8 w-8 rounded-lg bg-gray-200" />
            </div>
            <div className="mt-3 h-6 w-28 rounded bg-gray-200" />
            <div className="mt-3 h-3 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
      {/* 1. إجمالي المديونية الكلية */}
      <KpiCard
        title="إجمالي المديونية الكلية"
        value={fmt(kpis.total_debt_yer)}
        unit="ر.ي"
        subtitle="شامل العملات الأجنبية"
        icon={<IconWallet className="h-4 w-4" />}
        iconBg="#EFF6FF"
        iconFg="#1D4ED8"
      />

      {/* 2. المبالغ المحصلة في الفترة */}
      <KpiCard
        title="المبالغ المحصلة (الفترة)"
        value={fmt(kpis.total_collected_period_yer)}
        unit="ر.ي"
        subtitle="الدفعات في الفترة المحددة"
        icon={<IconChart className="h-4 w-4" />}
        iconBg="#ECFDF5"
        iconFg="#047857"
      />

      {/* 3. العملاء النشطون */}
      <KpiCard
        title="العملاء المنتظمون"
        value={kpis.active_customers_count}
        unit="عميل"
        subtitle={
          <span>
            مسددون:{' '}
            <strong className="text-gray-700 font-semibold mono">
              {kpis.settled_customers_count}
            </strong>
          </span>
        }
        icon={<IconUsers className="h-4 w-4" />}
        iconBg="#EEF2FF"
        iconFg="#4338CA"
        badge={
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-600">
            منتظم
          </span>
        }
      />

      {/* 4. العملاء المتعثرون */}
      <KpiCard
        title="العملاء المتعثرون"
        value={kpis.overdue_customers_count}
        unit="عميل"
        subtitle="تجاوزوا مواعيد الاستحقاق"
        icon={<IconCalendarAlert className="h-4 w-4" />}
        iconBg="#FEF2F2"
        iconFg="#B91C1C"
        badge={
          kpis.overdue_customers_count > 0 ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
              تتطلب متابعة
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-600">
              لا يوجد تعثر
            </span>
          )
        }
      />

      {/* 5. نسبة التحصيل العام */}
      <KpiCard
        title="مؤشر نسبة التحصيل"
        value={`${kpis.team_collection_rate}%`}
        subtitle="المحصل مقابل المطلوب"
        icon={<IconChart className="h-4 w-4" />}
        iconBg="#FAF5FF"
        iconFg="#7E22CE"
        progress={kpis.team_collection_rate}
      />
    </div>
  );
}
