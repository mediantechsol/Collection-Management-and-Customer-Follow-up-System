import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/auth/AuthContext';
import { useActivityLogs, useCustomers, useNotifications, useSettings, useUserNames } from '@/lib/queries';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { CategoryDot } from '@/components/ui/Pill';
import { ActivityLogTable } from '@/features/common/ActivityLogTable';
import { IconBell, IconCalendarAlert, IconChart, IconClock } from '@/components/ui/Icons';
import { classifyDue, daysBetween, todayStr } from '@/lib/logic/dates';
import { fmt } from '@/lib/logic/money';
import { isAccountant, isAdmin } from '@/lib/permissions';
import type { CustomerOverview } from '@/types/models';

export function DashboardScreen() {
  const profile = useProfile();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: notifications = [] } = useNotifications();
  const { data: logs = [] } = useActivityLogs(8);
  const userNames = useUserNames();

  const today = todayStr();
  const canSeeAudit = isAdmin(profile) || isAccountant(profile);

  const stats = useMemo(() => {
    const thresholds = {
      daysBeforeDueAlert: settings?.days_before_due_alert ?? 3,
      overdueAlertDays: settings?.overdue_alert_days ?? 35,
    };
    const noFollowupLimit = settings?.no_followup_days_limit ?? 14;

    const totalOutstanding = customers.reduce((s, c) => s + (c.total_due_yer ?? 0), 0);

    const overdue = customers.filter((c) => {
      const status = classifyDue(c.remaining_days, thresholds);
      return status === 'overdue' || status === 'overdue_severe';
    }).length;

    const todayNotifs = notifications.filter(
      (n) =>
        n.notification_date === today &&
        (canSeeAudit || n.user_id === profile.id),
    ).length;

    // "بدون متابعة حديثة": لا متابعة خلال المدة المحددة (أو لا متابعة إطلاقاً)
    const stale = customers.filter((c) => {
      if (!c.last_followup_date) return true;
      return daysBetween(c.last_followup_date, today) > noFollowupLimit;
    }).length;

    return { totalOutstanding, overdue, todayNotifs, stale, noFollowupLimit };
  }, [customers, notifications, settings, today, canSeeAudit, profile.id]);

  const topDebtors = useMemo(
    () => [...customers].sort((a, b) => (b.total_due_yer ?? 0) - (a.total_due_yer ?? 0)).slice(0, 6),
    [customers],
  );

  const columns: Column<CustomerOverview>[] = [
    { key: 'name', label: 'العميل', render: (c) => c.customer_name, hideOnCard: true },
    {
      key: 'category',
      label: 'الفئة',
      render: (c) =>
        c.category_name ? (
          <>
            <CategoryDot color={c.category_color} />
            {c.category_name}
          </>
        ) : (
          '—'
        ),
    },
    {
      key: 'assigned',
      label: 'المسؤول',
      render: (c) => (c.assigned_user_id ? userNames.get(c.assigned_user_id) ?? '—' : '—'),
    },
    {
      key: 'total',
      label: 'المستحق بالريال',
      render: (c) => <span className="mono">{fmt(c.total_due_yer)}</span>,
    },
  ];

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          icon={<IconChart className="h-4 w-4" />}
          iconBg="var(--tw-color-blue-50, #EAF2FE)"
          iconFg="#2447B8"
          label="إجمالي المستحق (بالريال)"
          value={fmt(stats.totalOutstanding)}
          sub={`${customers.length} عميل ضمن نطاق صلاحيتك`}
        />
        <StatCard
          icon={<IconCalendarAlert className="h-4 w-4" />}
          iconBg="#FDEAEA"
          iconFg="#E23F3F"
          label="عملاء متأخرون"
          value={String(stats.overdue)}
          sub="تجاوزوا تاريخ الاستحقاق الجديد"
          danger
        />
        <StatCard
          icon={<IconBell className="h-4 w-4" />}
          iconBg="#EAF1FE"
          iconFg="#3E7BFA"
          label="تنبيهات اليوم"
          value={String(stats.todayNotifs)}
          sub="اضغط التنبيهات للتفاصيل"
        />
        <StatCard
          icon={<IconClock className="h-4 w-4" />}
          iconBg="#FCF3DE"
          iconFg="#DFA22E"
          label="بدون متابعة حديثة"
          value={String(stats.stale)}
          sub={`تجاوزوا ${stats.noFollowupLimit} يوماً بدون متابعة`}
        />
      </div>

      <h2 className="section-title">أعلى العملاء مديونية</h2>
      <DataTable
        columns={columns}
        rows={topDebtors}
        keyOf={(c) => c.id}
        cardTitle={(c) => c.customer_name}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        loading={isLoading}
        empty="لا يوجد عملاء ضمن نطاق صلاحيتك"
      />

      {canSeeAudit && (
        <>
          <h2 className="section-title">آخر العمليات</h2>
          <ActivityLogTable logs={logs} />
        </>
      )}
    </>
  );
}

function StatCard({
  icon,
  iconBg,
  iconFg,
  label,
  value,
  sub,
  danger = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconFg: string;
  label: string;
  value: string;
  sub: string;
  danger?: boolean;
}) {
  return (
    <div className="stat-card">
      <div
        className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: iconBg, color: iconFg }}
      >
        {icon}
      </div>
      <div className="mb-1.5 text-xs text-gray-600">{label}</div>
      <div
        className={`text-[22px] font-bold tabular-nums md:text-[26px] ${
          danger ? 'text-red-500' : 'text-blue-700'
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-gray-500">{sub}</div>
    </div>
  );
}
