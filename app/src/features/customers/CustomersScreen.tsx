import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/auth/AuthContext';
import { useCategories, useCustomers, useToggleCustomerActive } from '@/lib/queries';
import { useUserNames } from '@/lib/queries';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { CategoryDot, Pill } from '@/components/ui/Pill';
import { IconPlus } from '@/components/ui/Icons';
import { CustomerModal } from './CustomerModal';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { calcDebtRatio, fmt, fmtPercent } from '@/lib/logic/money';
import { screenAction, visibleFields } from '@/lib/permissions';
import type { CustomerOverview } from '@/types/models';

export function CustomersScreen() {
  const profile = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: categories = [] } = useCategories();
  const userNames = useUserNames();
  const toggleActive = useToggleCustomerActive();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [modal, setModal] = useState<{ open: boolean; existing: CustomerOverview | null }>({
    open: false,
    existing: null,
  });

  const canCreate = screenAction(profile, 'customers', 'create');
  const canEdit = screenAction(profile, 'customers', 'edit');
  const canDeactivate = screenAction(profile, 'customers', 'deactivate');
  const fields = visibleFields(profile, 'customers');

  const totalDebt = useMemo(
    () => customers.reduce((s, c) => s + (c.total_due_yer ?? 0), 0),
    [customers],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter(
        (c) => !q || c.customer_name.toLowerCase().includes(q) || c.customer_number.includes(q),
      )
      .filter((c) => !categoryId || c.customer_category_id === categoryId);
  }, [customers, search, categoryId]);

  const allColumns: Record<string, Column<CustomerOverview>> = {
    customer_number: {
      key: 'customer_number',
      label: 'رقم العميل',
      render: (c) => <span className="mono">{c.customer_number}</span>,
    },
    customer_name: {
      key: 'customer_name',
      label: 'اسم العميل',
      render: (c) => <span className="font-semibold">{c.customer_name}</span>,
      hideOnCard: true,
    },
    mobile_1: {
      key: 'mobile_1',
      label: 'الجوال 1',
      render: (c) =>
        c.mobile_1 ? (
          <a href={`tel:${c.mobile_1}`} dir="ltr" className="mono text-blue-600">
            {c.mobile_1}
          </a>
        ) : (
          '—'
        ),
    },
    mobile_2: {
      key: 'mobile_2',
      label: 'الجوال 2',
      render: (c) => <span className="mono" dir="ltr">{c.mobile_2 ?? '—'}</span>,
    },
    total_due: {
      key: 'total_due',
      label: 'المستحق بالريال',
      render: (c) => <span className="mono">{fmt(c.total_due_yer)}</span>,
    },
    debt_ratio: {
      key: 'debt_ratio',
      label: 'نسبة المديونية',
      render: (c) => (
        <span className="mono">{fmtPercent(calcDebtRatio(c.total_due_yer ?? 0, totalDebt))}</span>
      ),
    },
    category: {
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
    guarantor: { key: 'guarantor', label: 'الضامن / الضمانة', render: (c) => c.guarantor ?? '—' },
    status_customer: {
      key: 'status_customer',
      label: 'الحالة',
      render: (c) =>
        c.is_active ? (
          <Pill tone="green">{c.status_customer || 'نشط'}</Pill>
        ) : (
          <Pill tone="gray">موقوف</Pill>
        ),
    },
    assigned_user: {
      key: 'assigned_user',
      label: 'المسؤول',
      render: (c) => (c.assigned_user_id ? userNames.get(c.assigned_user_id) ?? '—' : '—'),
    },
  };

  const columns = fields.map((f) => allColumns[f.key]).filter(Boolean);

  async function onToggle(c: CustomerOverview) {
    try {
      await toggleActive.mutateAsync({ id: c.id, isActive: !c.is_active });
      toast.show(c.is_active ? 'تم إيقاف العميل' : 'تم تنشيط العميل');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

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
        {canCreate && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModal({ open: true, existing: null })}
          >
            <IconPlus />
            عميل جديد
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-gray-500">
        {rows.length} عميل • إجمالي المديونية {fmt(totalDebt)} ريال
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        keyOf={(c) => c.id}
        cardTitle={(c) => c.customer_name}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        loading={isLoading}
        empty="لا يوجد عملاء"
        actions={
          canEdit || canDeactivate
            ? (c) => (
                <>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setModal({ open: true, existing: c })}
                    >
                      تعديل
                    </button>
                  )}
                  {canDeactivate && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => void onToggle(c)}
                    >
                      {c.is_active ? 'إيقاف' : 'تنشيط'}
                    </button>
                  )}
                </>
              )
            : undefined
        }
      />

      {modal.open && (
        <CustomerModal
          open
          existing={modal.existing}
          onClose={() => setModal({ open: false, existing: null })}
        />
      )}
    </>
  );
}
