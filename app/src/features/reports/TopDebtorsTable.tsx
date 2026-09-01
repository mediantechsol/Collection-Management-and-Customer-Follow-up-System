import { useNavigate } from 'react-router-dom';
import { fmt } from '@/lib/logic/money';
import { CategoryDot, Pill } from '@/components/ui/Pill';
import { IconTrophy } from '@/components/ui/Icons';
import { DataTable, type Column } from '@/components/ui/DataTable';
import type { TopDebtorItem } from '@/types/models';

interface Props {
  debtors: TopDebtorItem[];
  loading?: boolean;
}

export function TopDebtorsTable({ debtors, loading }: Props) {
  const navigate = useNavigate();

  const columns: Column<TopDebtorItem>[] = [
    {
      key: 'rank',
      label: '#',
      render: (_row) => {
        const index = debtors.findIndex((d) => d.customer_id === _row.customer_id);
        const rank = index + 1;
        return (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              rank === 1
                ? 'bg-amber-100 text-amber-800'
                : rank === 2
                ? 'bg-slate-200 text-slate-700'
                : rank === 3
                ? 'bg-amber-50 text-amber-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {rank}
          </span>
        );
      },
    },
    {
      key: 'customer',
      label: 'العميل',
      render: (row) => (
        <div>
          <div className="font-semibold text-gray-900">{row.customer_name}</div>
          <div className="text-[11px] text-gray-400 mono">#{row.customer_number}</div>
        </div>
      ),
      hideOnCard: true,
    },
    {
      key: 'category',
      label: 'الفئة',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <CategoryDot color={row.category_color} />
          <span className="text-xs text-gray-700">{row.category_name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'collector',
      label: 'المسؤول',
      render: (row) => (
        <span className="text-xs text-gray-700">{row.assigned_user_name ?? '—'}</span>
      ),
    },
    {
      key: 'total_due',
      label: 'المديونية بالريال',
      render: (row) => (
        <span className="mono font-bold text-gray-900">{fmt(row.total_due_yer)} ر.ي</span>
      ),
    },
    {
      key: 'percentage',
      label: 'نسبة المديونية',
      render: (row) => (
        <div className="min-w-[120px]">
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="font-semibold text-gray-700 mono">{row.debt_percentage}%</span>
            <span className="text-gray-400">من الإجمالي</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${
                row.debt_percentage >= 20
                  ? 'bg-red-500'
                  : row.debt_percentage >= 10
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, row.debt_percentage))}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'الحالة',
      render: (row) => {
        if (row.status === 'settled') {
          return <Pill tone="green">مسدد</Pill>;
        }
        if (row.status === 'overdue') {
          return <Pill tone="red">متعثر</Pill>;
        }
        return <Pill tone="blue">منتظم</Pill>;
      },
    },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <IconTrophy className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-bold text-gray-900">
            قائمة أعلى 10 عملاء مديونية (التركيز الائتماني)
          </h2>
        </div>
        <span className="text-xs text-gray-500">
          مرتبة تنازلياً حسب حجم المديونية الكلية
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={debtors}
        keyOf={(r) => r.customer_id}
        cardTitle={(r) => (
          <div className="flex items-center justify-between">
            <span className="font-bold">{r.customer_name}</span>
            <span className="mono text-xs text-gray-500">#{r.customer_number}</span>
          </div>
        )}
        onRowClick={(r) => navigate(`/customers/${r.customer_id}`)}
        empty="لا يوجد عملاء مديونية في نطاق البحث الحالي"
        loading={loading}
      />
    </div>
  );
}
