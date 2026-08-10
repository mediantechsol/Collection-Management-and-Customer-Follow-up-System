import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/auth/AuthContext';
import { useCategories, useCustomers, useSettings, useUserNames } from '@/lib/queries';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DuePill } from '@/components/ui/Pill';
import { FollowupModal } from './FollowupModal';
import { classifyDue } from '@/lib/logic/dates';
import { fmt } from '@/lib/logic/money';
import { screenAction, visibleFields } from '@/lib/permissions';
import type { CustomerOverview } from '@/types/models';

/**
 * شاشة متابعة العملاء — "قلب النظام" بتعبير العميل: جدول العمل اليومي مرتّباً
 * بالأقرب استحقاقاً، مع إمكانية تسجيل متابعة مباشرة من الصف.
 */
export function FollowupsScreen() {
  const profile = useProfile();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: categories = [] } = useCategories();
  const userNames = useUserNames();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [target, setTarget] = useState<CustomerOverview | null>(null);

  const canAddFollowup = screenAction(profile, 'followups', 'create');
  const fields = visibleFields(profile, 'followups');

  const thresholds = {
    daysBeforeDueAlert: settings?.days_before_due_alert ?? 3,
    overdueAlertDays: settings?.overdue_alert_days ?? 35,
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter((c) => c.is_active)
      .filter(
        (c) =>
          !q ||
          c.customer_name.toLowerCase().includes(q) ||
          c.customer_number.includes(q),
      )
      .filter((c) => !categoryId || c.customer_category_id === categoryId)
      .sort((a, b) => (a.remaining_days ?? 9999) - (b.remaining_days ?? 9999));
  }, [customers, search, categoryId]);

  // العمود يُبنى مرة واحدة ثم يُفلتر حسب صلاحيات إخفاء الأعمدة لهذا المستخدم
  const allColumns: Record<string, Column<CustomerOverview>> = {
    due_date: {
      key: 'due_date',
      label: 'تاريخ الاستحقاق',
      render: (c) => <span className="mono">{c.new_due_date ?? '—'}</span>,
    },
    customer_name: {
      key: 'customer_name',
      label: 'اسم العميل',
      render: (c) => <span className="font-semibold">{c.customer_name}</span>,
      hideOnCard: true,
    },
    mobile_1: {
      key: 'mobile_1',
      label: 'الجوال',
      render: (c) =>
        c.mobile_1 ? (
          <a href={`tel:${c.mobile_1}`} dir="ltr" className="mono text-blue-600">
            {c.mobile_1}
          </a>
        ) : (
          '—'
        ),
    },
    remaining: {
      key: 'remaining',
      label: 'المتبقي عليه',
      render: (c) => <span className="mono">{fmt(c.total_due_yer)}</span>,
    },
    status_pill: {
      key: 'status_pill',
      label: 'حالة الاستحقاق',
      render: (c) => (
        <DuePill
          status={classifyDue(c.remaining_days, thresholds)}
          overdueDays={c.remaining_days != null && c.remaining_days < 0 ? -c.remaining_days : undefined}
        />
      ),
    },
    assigned_user: {
      key: 'assigned_user',
      label: 'مسؤول المتابعة',
      render: (c) => (c.assigned_user_id ? userNames.get(c.assigned_user_id) ?? '—' : '—'),
    },
    next_appointment: {
      key: 'next_appointment',
      label: 'موعد المتابعة القادمة',
      render: (c) => <span className="mono">{c.last_next_followup_date ?? '—'}</span>,
    },
    last_followup_details: {
      key: 'last_followup_details',
      label: 'تفاصيل آخر متابعة',
      render: (c) => (
        <span className="text-xs text-gray-600">{c.last_followup_details ?? '—'}</span>
      ),
    },
  };

  const columns = fields.map((f) => allColumns[f.key]).filter(Boolean);

  return (
    <>
      <div className="toolbar">
        <input
          type="text"
          className="input-pill min-w-[180px] flex-1"
          placeholder="ابحث بالاسم أو رقم العميل…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input-pill"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">كل الفئات</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.category_name}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        keyOf={(c) => c.id}
        cardTitle={(c) => c.customer_name}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        loading={isLoading}
        empty="لا يوجد عملاء ضمن نطاق صلاحيتك"
        actions={(c) => (
          <>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => navigate(`/customers/${c.id}`)}
            >
              تفاصيل
            </button>
            {canAddFollowup && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setTarget(c)}>
                إضافة متابعة
              </button>
            )}
          </>
        )}
      />

      {target && (
        <FollowupModal
          open
          customerId={target.id}
          customerName={target.customer_name}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
