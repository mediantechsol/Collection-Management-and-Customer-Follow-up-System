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
import { NOTIF_ICONS } from '@/components/ui/Icons';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { NOTIFICATION_META, NOTIFICATION_TYPES, type NotificationType } from '@/lib/logic/notifications';
import { isAccountant, isAdmin } from '@/lib/permissions';
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

  const customerNames = useMemo(
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

  async function onGenerate() {
    try {
      const count = await generate.mutateAsync();
      toast.show(count > 0 ? `تم توليد ${count} تنبيه جديد` : 'لا توجد تنبيهات جديدة اليوم');
    } catch (e) {
      toast.error(errorMessage(e));
    }
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
      render: (n) => (
        <button
          type="button"
          className="font-semibold text-blue-600"
          onClick={() => navigate(`/customers/${n.customer_id}`)}
        >
          {customerNames.get(n.customer_id)?.customer_name ?? '—'}
        </button>
      ),
      hideOnCard: true,
    },
    {
      key: 'category',
      label: 'فئة العميل',
      render: (n) => customerNames.get(n.customer_id)?.category_name ?? '—',
    },
    {
      key: 'date',
      label: 'التاريخ',
      render: (n) => <span className="mono">{n.notification_date}</span>,
    },
    {
      key: 'target',
      label: 'المستهدف',
      render: (n) => (n.user_id ? userNames.get(n.user_id) ?? '—' : 'الإدارة'),
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
        cardTitle={(n) => customerNames.get(n.customer_id)?.customer_name ?? '—'}
        loading={isLoading}
        empty="لا توجد تنبيهات ضمن هذا النطاق"
        actions={(n) =>
          n.status !== 'تم التعامل' && canHandle(n) ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() =>
                void handle
                  .mutateAsync(n.id)
                  .catch((e) => toast.error(errorMessage(e)))
              }
            >
              تعليم كمنجز
            </button>
          ) : null
        }
      />
    </>
  );
}
