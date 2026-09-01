import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/auth/AuthContext';
import {
  useCustomers,
  useGenerateNotifications,
  useHandleNotification,
  useNotifications,
  useSettings,
  useUserNames,
} from '@/lib/queries';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { NotificationPill, Pill } from '@/components/ui/Pill';
import { IconCheck, NOTIF_ICONS } from '@/components/ui/Icons';
import { errorMessage, useToast } from '@/components/ui/Toast';
import {
  NOTIFICATION_META,
  NOTIFICATION_TYPES,
  notificationReason,
  type NotificationType,
} from '@/lib/logic/notifications';
import { isAccountant, isAdmin } from '@/lib/permissions';
import { fmt } from '@/lib/logic/money';
import { daysBetween, todayStr } from '@/lib/logic/dates';
import { FollowupModal } from '@/features/followups/FollowupModal';
import { CustomRemindersSection } from '@/features/reminders/CustomRemindersSection';
import type { AppNotification } from '@/types/models';

/**
 * مركز التنبيهات — الأنواع الستة.
 *
 * التوليد يتم في قاعدة البيانات (generate_daily_notifications) عبر مهمة
 * pg_cron يومية. الزر هنا تشغيل فوري للمدير فقط، وليس المصدر الوحيد كما كان
 * في النموذج الأولي حيث لم تكن التنبيهات تظهر لأحد حتى يضغطه المدير يدوياً.
 */
export function NotificationsScreen() {
  const profile = useProfile();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: notifications = [], isLoading } = useNotifications();
  const { data: customers = [] } = useCustomers();
  const { data: settings } = useSettings();
  const userNames = useUserNames();
  const generate = useGenerateNotifications();
  const handle = useHandleNotification();

  const [typeFilter, setTypeFilter] = useState<NotificationType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [followupTarget, setFollowupTarget] = useState<{
    customerId: string;
    customerName: string;
  } | null>(null);

  const canGenerate = isAdmin(profile) || isAccountant(profile);
  /**
   * مرآة سياسة notifications_update: الإدارة أو صاحب التنبيه فقط.
   * مسؤول التحصيل يرى التنبيهات الموجّهة للإدارة (user_id فارغ) عبر عملائه،
   * وكان زر "تعليم كمنجز" يظهر له ثم يفشل دائماً برسالة "لا تملك صلاحية".
   */
  const canHandle = (n: AppNotification) =>
    isAdmin(profile) || isAccountant(profile) || n.user_id === profile.id;
  const notifSettings = {
    daysBeforeDueAlert: settings?.days_before_due_alert ?? 3,
    noFollowupDaysLimit: settings?.no_followup_days_limit ?? 14,
  };

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const byDate = useMemo(
    () =>
      notifications
        .filter((n) => !from || n.notification_date >= from)
        .filter((n) => !to || n.notification_date <= to),
    [notifications, from, to],
  );

  const rows = useMemo(
    () => byDate.filter((n) => !typeFilter || n.notification_type === typeFilter),
    [byDate, typeFilter],
  );

  const today = todayStr();

  async function onGenerate() {
    try {
      const count = await generate.mutateAsync();
      toast.show(count > 0 ? `تم توليد ${count} تنبيه جديد` : 'لا توجد تنبيهات جديدة اليوم');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  /** شارة الأيام المتبقية / المتأخرة */
  function DaysChip({ dueDate }: { dueDate: string | null }) {
    if (!dueDate) return <span className="text-gray-400">—</span>;
    const diff = daysBetween(today, dueDate);
    const cls =
      diff < 0
        ? 'days-chip days-chip--danger'
        : diff <= (notifSettings.daysBeforeDueAlert ?? 3)
          ? 'days-chip days-chip--warn'
          : 'days-chip days-chip--ok';
    const label =
      diff < 0
        ? `متأخر ${Math.abs(diff)} يوم`
        : diff === 0
          ? 'اليوم'
          : `متبقي ${diff} يوم`;
    return <span className={cls}>{label}</span>;
  }

  const columns: Column<AppNotification>[] = [
    {
      key: 'type',
      label: 'النوع',
      render: (n) => <NotificationPill type={n.notification_type} settings={notifSettings} />,
    },
    {
      key: 'customer',
      label: 'العميل',
      render: (n) => {
        const c = customerMap.get(n.customer_id);
        return (
          <button
            type="button"
            className="text-right"
            onClick={() => navigate(`/customers/${n.customer_id}`)}
          >
            <span className="block font-semibold text-blue-600">
              {c?.customer_name ?? '—'}
            </span>
            {c?.customer_number && (
              <span className="block text-[11px] text-gray-500">
                #{c.customer_number}
              </span>
            )}
          </button>
        );
      },
      hideOnCard: true,
    },
    {
      key: 'due_date',
      label: 'تاريخ الاستحقاق',
      render: (n) => {
        const c = customerMap.get(n.customer_id);
        const dueDate = c?.new_due_date ?? c?.due_date ?? null;
        return (
          <div className="flex flex-col gap-1">
            <span className="mono text-[12px]">{dueDate ?? '—'}</span>
            <DaysChip dueDate={dueDate} />
          </div>
        );
      },
    },
    {
      key: 'amount',
      label: 'المبلغ المتبقي',
      align: 'end' as const,
      render: (n) => {
        const c = customerMap.get(n.customer_id);
        return (
          <span className="mono text-[13px] font-bold text-gray-900" dir="ltr">
            {c ? fmt(c.total_due_yer) : '—'}
            <span className="mr-1 text-[10px] font-normal text-gray-500">ر.ي</span>
          </span>
        );
      },
    },
    {
      key: 'collector',
      label: 'مسؤول المتابعة',
      render: (n) => {
        const c = customerMap.get(n.customer_id);
        const assignedId = c?.assigned_user_id;
        return assignedId ? (userNames.get(assignedId) ?? '—') : 'غير مكلّف';
      },
    },
    {
      key: 'reason',
      label: 'سبب التنبيه',
      render: (n) => (
        <span className="text-[12px] text-gray-600">
          {notificationReason(n.notification_type, notifSettings)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'الحالة',
      render: (n) =>
        n.status === 'تم التعامل' ? <Pill tone="green">تم التعامل</Pill> : <Pill tone="amber">جديد</Pill>,
    },
  ];

  return (
    <>
      <CustomRemindersSection />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {NOTIFICATION_TYPES.map((type) => {
          const meta = NOTIFICATION_META[type];
          const Icon = NOTIF_ICONS[meta.icon];
          const count = byDate.filter((n) => n.notification_type === type).length;
          const active = typeFilter === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(active ? '' : type)}
              className={`rounded-xl border bg-white p-3.5 text-right shadow-card transition-shadow hover:shadow-md ${
                active ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
              }`}
            >
              <div
                className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px]"
                style={{ background: meta.bg, color: meta.fg }}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="mb-1.5 min-h-8 text-xs font-semibold text-gray-700">
                {meta.label(notifSettings)}
              </div>
              <div className="text-[22px] font-bold tabular-nums text-gray-900">{count}</div>
              <div className="text-[11px] text-gray-500">تنبيه</div>
            </button>
          );
        })}
      </div>

      <div className="toolbar">
        {canGenerate && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onGenerate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? 'جارٍ التوليد…' : 'توليد تنبيهات اليوم'}
          </button>
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          من
          <input
            type="date"
            className="input-pill"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          إلى
          <input
            type="date"
            className="input-pill"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {(from || to || typeFilter) && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setFrom('');
              setTo('');
              setTypeFilter('');
            }}
          >
            إلغاء الفلترة
          </button>
        )}
      </div>

      {canGenerate && (
        <p className="mb-3 text-[11px] text-gray-500">
          التوليد يعمل آلياً كل صباح. القواعد الخمس الآلية تُطبَّق حسب عتبات الإعدادات، والنوع
          السادس «يحتاج مراجعة المدير» يرفعه مسؤول التحصيل من صفحة العميل.
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        keyOf={(n) => n.id}
        cardTitle={(n) => customerMap.get(n.customer_id)?.customer_name ?? '—'}
        loading={isLoading}
        empty="لا توجد تنبيهات ضمن هذا النطاق"
        actions={(n) => (
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                const c = customerMap.get(n.customer_id);
                setFollowupTarget({
                  customerId: n.customer_id,
                  customerName: c?.customer_name ?? '—',
                });
              }}
            >
              + إضافة متابعة
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => navigate(`/customers/${n.customer_id}`)}
            >
              تفاصيل
            </button>
            {n.status !== 'تم التعامل' && canHandle(n) && (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1"
                onClick={() =>
                  void handle
                    .mutateAsync(n.id)
                    .catch((e) => toast.error(errorMessage(e)))
                }
              >
                <IconCheck className="h-3.5 w-3.5" />
                <span>إنجاز</span>
              </button>
            )}
          </div>
        )}
      />

      {followupTarget && (
        <FollowupModal
          customerId={followupTarget.customerId}
          customerName={followupTarget.customerName}
          open
          onClose={() => setFollowupTarget(null)}
        />
      )}
    </>
  );
}
