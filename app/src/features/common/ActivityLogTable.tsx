import { useUserNames } from '@/lib/queries';
import type { ActivityLog } from '@/types/models';

/**
 * سجل التدقيق — العميل طلبه صراحة ("توثيق كل حركة تعديل: من قام بها ومتى").
 * البيانات هنا تُكتب من triggers داخل قاعدة البيانات ولا يمكن للواجهة تزويرها.
 */

const TABLE_LABELS: Record<string, string> = {
  customers: 'عميل',
  followups: 'متابعة',
  users: 'مستخدم',
  customer_categories: 'فئة عملاء',
  excel_imports: 'استيراد Excel',
  incentive_payments: 'صرف حافز',
  collections: 'دفعة محصّلة',
  due_dates: 'تاريخ استحقاق',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  import: 'استيراد',
  escalate: 'رفع للمدير',
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
};

export function ActivityLogTable({ logs }: { logs: ActivityLog[] }) {
  const userNames = useUserNames();

  if (logs.length === 0) {
    return (
      <div className="table-wrap">
        <div className="empty-state">لا توجد عمليات مسجّلة بعد</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>النوع</th>
              <th>العملية</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="font-semibold">
                  {l.user_id ? userNames.get(l.user_id) ?? '—' : 'النظام'}
                </td>
                <td>{TABLE_LABELS[l.table_name] ?? l.table_name}</td>
                <td>
                  <span className="pill pill-blue">{ACTION_LABELS[l.action_type] ?? l.action_type}</span>
                </td>
                <td className="mono whitespace-nowrap text-xs">
                  {new Date(l.created_at).toLocaleString('ar-EG')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
