import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/auth/AuthContext';
import {
  useAssignCollection,
  useCollections,
  useConfirmCollection,
  useCustomers,
  useUserDirectory,
  useUserNames,
} from '@/lib/queries';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pill } from '@/components/ui/Pill';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { fmt } from '@/lib/logic/money';
import { screenAction, visibleFields } from '@/lib/permissions';
import type { Collection } from '@/types/models';

/**
 * شاشة الدفعات المحصّلة — لم تكن موجودة في النموذج الأولي إطلاقاً، وهي الحلقة
 * المفقودة التي كانت تجعل شاشة الحوافز فارغة دائماً.
 *
 * مصدر الدفعات:
 *   • "استيراد": مشتقّة آلياً من زيادة الجانب الدائن بين استيرادين متتاليين
 *     لملف الأرصدة — أي من واقع المحاسبة نفسها.
 *   • "يدوي": يسجّلها المحاسب عند التحصيل النقدي المباشر.
 * في الحالتين لا يُحتسب الحافز إلا بعد الاعتماد.
 */
export function CollectionsScreen() {
  const profile = useProfile();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: collections = [], isLoading } = useCollections();
  const { data: customers = [] } = useCustomers();
  const { data: directory = [] } = useUserDirectory();
  const userNames = useUserNames();
  const confirmCollection = useConfirmCollection();
  const assignCollection = useAssignCollection();

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('pending');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'import' | 'manual'>('all');

  const canConfirm = screenAction(profile, 'collections', 'confirm');
  const fields = visibleFields(profile, 'collections');

  const customerNames = useMemo(
    () => new Map(customers.map((c) => [c.id, c.customer_name])),
    [customers],
  );

  const collectors = directory.filter(
    (u) => u.name_role === 'مسؤول التحصيل' || u.name_role === 'مستخدم مخصص',
  );

  const rows = useMemo(
    () =>
      collections
        .filter((c) =>
          statusFilter === 'all'
            ? true
            : statusFilter === 'pending'
              ? !c.confirmed_at
              : !!c.confirmed_at,
        )
        .filter((c) => sourceFilter === 'all' || c.source === sourceFilter),
    [collections, statusFilter, sourceFilter],
  );

  const totals = useMemo(() => {
    const pending = collections.filter((c) => !c.confirmed_at);
    const confirmed = collections.filter((c) => c.confirmed_at);
    return {
      pendingCount: pending.length,
      pendingSum: pending.reduce((s, c) => s + c.amount_yer, 0),
      confirmedSum: confirmed.reduce((s, c) => s + c.amount_yer, 0),
    };
  }, [collections]);

  async function onConfirm(c: Collection) {
    if (!c.user_id && !c.confirmed_at) {
      toast.error('عيّن محصِّلاً للدفعة أولاً — بدونه لن يُحتسب أي حافز');
      return;
    }
    try {
      await confirmCollection.mutateAsync({ id: c.id, confirmed: !c.confirmed_at });
      toast.show(c.confirmed_at ? 'تم إلغاء الاعتماد' : 'تم اعتماد الدفعة واحتساب الحافز');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const allColumns: Record<string, Column<Collection>> = {
    collected_date: {
      key: 'collected_date',
      label: 'تاريخ التحصيل',
      render: (c) => <span className="mono">{c.collected_date}</span>,
    },
    customer_name: {
      key: 'customer_name',
      label: 'العميل',
      render: (c) => (
        <button
          type="button"
          className="font-semibold text-blue-600"
          onClick={() => navigate(`/customers/${c.customer_id}`)}
        >
          {customerNames.get(c.customer_id) ?? '—'}
        </button>
      ),
      hideOnCard: true,
    },
    amount: {
      key: 'amount',
      label: 'المبلغ',
      render: (c) => (
        <span className="mono">
          {fmt(c.amount)} {c.currency}
        </span>
      ),
    },
    amount_yer: {
      key: 'amount_yer',
      label: 'بالريال',
      render: (c) => <span className="mono">{fmt(c.amount_yer)}</span>,
    },
    collector: {
      key: 'collector',
      label: 'المحصِّل',
      render: (c) =>
        c.confirmed_at ? (
          (c.user_id && userNames.get(c.user_id)) || '—'
        ) : canConfirm ? (
          <select
            className="rounded-md border border-gray-200 px-2 py-1 text-xs"
            value={c.user_id ?? ''}
            onChange={(e) =>
              void assignCollection
                .mutateAsync({ id: c.id, userId: e.target.value || null })
                .catch((err) => toast.error(errorMessage(err)))
            }
          >
            <option value="">غير معيَّن</option>
            {collectors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        ) : (
          (c.user_id && userNames.get(c.user_id)) || '—'
        ),
    },
    source: {
      key: 'source',
      label: 'المصدر',
      render: (c) =>
        c.source === 'import' ? <Pill tone="blue">استيراد</Pill> : <Pill tone="gray">يدوي</Pill>,
    },
    status: {
      key: 'status',
      label: 'حالة الاعتماد',
      render: (c) =>
        c.confirmed_at ? <Pill tone="green">معتمدة</Pill> : <Pill tone="amber">بانتظار الاعتماد</Pill>,
    },
  };

  const columns = fields.map((f) => allColumns[f.key]).filter(Boolean);

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="stat-card">
          <div className="mb-1.5 text-xs text-gray-600">بانتظار الاعتماد</div>
          <div className="text-[22px] font-bold tabular-nums text-amber-500">
            {totals.pendingCount}
          </div>
          <div className="mono mt-1 text-[11px] text-gray-500">{fmt(totals.pendingSum)} ريال</div>
        </div>
        <div className="stat-card">
          <div className="mb-1.5 text-xs text-gray-600">إجمالي المحصَّل المعتمد</div>
          <div className="mono text-[22px] font-bold text-green-500">{fmt(totals.confirmedSum)}</div>
          <div className="mt-1 text-[11px] text-gray-500">هو أساس احتساب الحوافز</div>
        </div>
        <div className="stat-card">
          <div className="mb-1.5 text-xs text-gray-600">إجمالي الدفعات</div>
          <div className="text-[22px] font-bold tabular-nums text-blue-700">{collections.length}</div>
          <div className="mt-1 text-[11px] text-gray-500">يدوية ومشتقّة من الاستيراد</div>
        </div>
      </div>

      <div className="toolbar">
        <select
          className="input-pill"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="pending">بانتظار الاعتماد</option>
          <option value="confirmed">المعتمدة</option>
          <option value="all">الكل</option>
        </select>
        <select
          className="input-pill"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
        >
          <option value="all">كل المصادر</option>
          <option value="import">مشتقّة من الاستيراد</option>
          <option value="manual">مُدخلة يدوياً</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        keyOf={(c) => c.id}
        cardTitle={(c) => customerNames.get(c.customer_id) ?? '—'}
        loading={isLoading}
        empty="لا توجد دفعات ضمن هذا الفلتر"
        actions={
          canConfirm
            ? (c) => (
                <button
                  type="button"
                  className={`btn btn-sm ${c.confirmed_at ? 'btn-outline' : 'btn-primary'}`}
                  onClick={() => void onConfirm(c)}
                  disabled={confirmCollection.isPending}
                >
                  {c.confirmed_at ? 'إلغاء الاعتماد' : 'اعتماد'}
                </button>
              )
            : undefined
        }
      />
    </>
  );
}
