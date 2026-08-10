import { useMemo, useState } from 'react';
import { useProfile } from '@/features/auth/AuthContext';
import {
  useCategories,
  useCustomers,
  useIncentivePayments,
  useIncentives,
  usePayIncentive,
  useSaveCategory,
  useUserDirectory,
} from '@/lib/queries';
import { Modal } from '@/components/ui/Modal';
import { CategoryDot, Pill } from '@/components/ui/Pill';
import { IconPlus } from '@/components/ui/Icons';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { todayStr } from '@/lib/logic/dates';
import { fmt } from '@/lib/logic/money';
import { screenAction } from '@/lib/permissions';
import type { CustomerCategory } from '@/types/models';

/**
 * الأداء والحوافز.
 *
 * في النموذج الأولي كان هذا الجدول يعرض أصفاراً دائماً لأن مصفوفتَي الحوافز
 * والمدفوعات تبدآن فارغتين ولا توجد أي شاشة تُنشئ سجل حافز. الآن الحوافز
 * تُولَّد آلياً من الدفعات المعتمدة، والمصروف يُسجَّل من هنا.
 */
export function PerformanceScreen() {
  const profile = useProfile();
  const toast = useToast();

  const { data: categories = [] } = useCategories();
  const { data: customers = [] } = useCustomers();
  const { data: incentives = [] } = useIncentives();
  const { data: payments = [] } = useIncentivePayments();
  const { data: directory = [] } = useUserDirectory();

  const [categoryModal, setCategoryModal] = useState<{ open: boolean; existing: CustomerCategory | null }>(
    { open: false, existing: null },
  );
  const [payTarget, setPayTarget] = useState<{ id: string; name: string; remaining: number } | null>(
    null,
  );

  const canManageCategories = screenAction(profile, 'performance', 'create');
  const canPay = screenAction(profile, 'performance', 'pay');

  const customerCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      if (!c.customer_category_id) continue;
      map.set(c.customer_category_id, (map.get(c.customer_category_id) ?? 0) + 1);
    }
    return map;
  }, [customers]);

  const employees = useMemo(() => {
    // كل من له حافز أو دفعة، بالإضافة لكل مسؤولي التحصيل حتى لو بأصفار
    const ids = new Set<string>([
      ...directory
        .filter((u) => u.name_role === 'مسؤول التحصيل' || u.name_role === 'مستخدم مخصص')
        .map((u) => u.id),
      ...incentives.map((i) => i.user_id),
      ...payments.map((p) => p.user_id),
    ]);

    return [...ids]
      .map((id) => {
        const due = incentives
          .filter((i) => i.user_id === id)
          .reduce((s, i) => s + i.incentive_amount, 0);
        const paid = payments.filter((p) => p.user_id === id).reduce((s, p) => s + p.amount, 0);
        const collected = incentives
          .filter((i) => i.user_id === id)
          .reduce((s, i) => s + i.collected_amount, 0);
        return {
          id,
          name: directory.find((u) => u.id === id)?.full_name ?? '—',
          collected,
          due,
          paid,
          remaining: due - paid,
        };
      })
      .sort((a, b) => b.due - a.due);
  }, [directory, incentives, payments]);

  const totals = useMemo(
    () => ({
      due: employees.reduce((s, e) => s + e.due, 0),
      paid: employees.reduce((s, e) => s + e.paid, 0),
      remaining: employees.reduce((s, e) => s + e.remaining, 0),
    }),
    [employees],
  );

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="stat-card">
          <div className="mb-1.5 text-xs text-gray-600">إجمالي الحوافز المستحقة</div>
          <div className="mono text-[22px] font-bold text-blue-700">{fmt(totals.due)}</div>
        </div>
        <div className="stat-card">
          <div className="mb-1.5 text-xs text-gray-600">المصروف</div>
          <div className="mono text-[22px] font-bold text-green-500">{fmt(totals.paid)}</div>
        </div>
        <div className="stat-card">
          <div className="mb-1.5 text-xs text-gray-600">المتبقي للصرف</div>
          <div className="mono text-[22px] font-bold text-amber-500">{fmt(totals.remaining)}</div>
        </div>
      </div>

      <h2 className="section-title">فئات العملاء ونِسَب الحوافز</h2>
      {canManageCategories && (
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCategoryModal({ open: true, existing: null })}
          >
            <IconPlus />
            فئة جديدة
          </button>
        </div>
      )}
      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>الفئة</th>
                <th>نسبة الحافز</th>
                <th>عدد العملاء</th>
                <th>الحالة</th>
                {canManageCategories && <th />}
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <CategoryDot color={c.color} />
                    {c.category_name}
                  </td>
                  <td className="mono">{c.incentive_rate}%</td>
                  <td>{customerCountByCategory.get(c.id) ?? 0}</td>
                  <td>
                    {c.is_active ? <Pill tone="green">نشطة</Pill> : <Pill tone="gray">موقوفة</Pill>}
                  </td>
                  {canManageCategories && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setCategoryModal({ open: true, existing: c })}
                      >
                        تعديل
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    لا توجد فئات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">حوافز الموظفين</h2>
      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>المحصَّل المعتمد</th>
                <th>الحافز المستحق</th>
                <th>المصروف</th>
                <th>المتبقي</th>
                {canPay && <th />}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="font-semibold">{e.name}</td>
                  <td className="mono">{fmt(e.collected)}</td>
                  <td className="mono">{fmt(e.due)}</td>
                  <td className="mono">{fmt(e.paid)}</td>
                  <td className="mono">{fmt(e.remaining)}</td>
                  {canPay && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={e.remaining <= 0}
                        onClick={() => setPayTarget({ id: e.id, name: e.name, remaining: e.remaining })}
                      >
                        صرف حافز
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    لا يوجد موظفو تحصيل بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {incentives.length === 0 && (
        <p className="mt-2 text-[11px] text-gray-500">
          لا توجد حوافز بعد. الحافز يُولَّد آلياً عند اعتماد دفعة محصّلة في شاشة «الدفعات المحصّلة»،
          بنسبة فئة العميل.
        </p>
      )}

      <h2 className="section-title">سجل صرف الحوافز</h2>
      <div className="table-wrap">
        {payments.length === 0 ? (
          <div className="empty-state">لا توجد مصروفات مسجّلة</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>المبلغ</th>
                  <th>التاريخ</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{directory.find((u) => u.id === p.user_id)?.full_name ?? '—'}</td>
                    <td className="mono">{fmt(p.amount)}</td>
                    <td className="mono">{p.payment_date}</td>
                    <td className="text-xs text-gray-600">{p.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {categoryModal.open && (
        <CategoryModal
          existing={categoryModal.existing}
          onClose={() => setCategoryModal({ open: false, existing: null })}
        />
      )}
      {payTarget && (
        <PayIncentiveModal
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onError={(m) => toast.error(m)}
        />
      )}
    </>
  );
}

function CategoryModal({
  existing,
  onClose,
}: {
  existing: CustomerCategory | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const saveCategory = useSaveCategory();
  const [form, setForm] = useState({
    category_name: existing?.category_name ?? '',
    color: existing?.color ?? '#2563EB',
    incentive_rate: String(existing?.incentive_rate ?? 0),
    is_active: existing?.is_active ?? true,
  });

  async function save() {
    if (!form.category_name.trim()) {
      toast.error('اسم الفئة مطلوب');
      return;
    }
    const rate = Number(form.incentive_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error('نسبة الحافز يجب أن تكون بين 0 و100');
      return;
    }
    try {
      await saveCategory.mutateAsync({
        id: existing?.id,
        values: {
          category_name: form.category_name.trim(),
          color: form.color,
          incentive_rate: rate,
          is_active: form.is_active,
        },
      });
      toast.show('تم الحفظ');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Modal
      open
      title={existing ? 'تعديل الفئة' : 'فئة عملاء جديدة'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={saveCategory.isPending}
          >
            حفظ
          </button>
        </>
      }
    >
      <div className="field">
        <label>اسم الفئة</label>
        <input
          type="text"
          value={form.category_name}
          onChange={(e) => setForm((f) => ({ ...f, category_name: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-3">
        <div className="field">
          <label>نسبة الحافز %</label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={100}
            dir="ltr"
            className="text-left"
            value={form.incentive_rate}
            onChange={(e) => setForm((f) => ({ ...f, incentive_rate: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>اللون</label>
          <input
            type="color"
            className="h-9"
            value={form.color}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        فئة نشطة
      </label>
      <p className="mt-3 text-[11px] text-gray-500">
        تغيير النسبة يؤثر على الحوافز المستقبلية فقط — الحوافز المُحتسبة سابقاً تحتفظ بنسبتها وقت
        الاعتماد.
      </p>
    </Modal>
  );
}

function PayIncentiveModal({
  target,
  onClose,
  onError,
}: {
  target: { id: string; name: string; remaining: number };
  onClose: () => void;
  onError: (m: string) => void;
}) {
  const toast = useToast();
  const payIncentive = usePayIncentive();
  const [amount, setAmount] = useState(String(target.remaining.toFixed(2)));
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [notes, setNotes] = useState('');

  async function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      onError('أدخل مبلغاً أكبر من صفر');
      return;
    }
    try {
      await payIncentive.mutateAsync({
        user_id: target.id,
        amount: value,
        payment_date: paymentDate,
        notes: notes.trim() || undefined,
      });
      toast.show('تم تسجيل صرف الحافز');
      onClose();
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <Modal
      open
      title={`صرف حافز — ${target.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={payIncentive.isPending}
          >
            تسجيل الصرف
          </button>
        </>
      }
    >
      <div className="field">
        <label>المبلغ (المتبقي: {fmt(target.remaining)})</label>
        <input
          type="text"
          inputMode="decimal"
          dir="ltr"
          className="text-left"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="field">
        <label>تاريخ الصرف</label>
        <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
      </div>
      <div className="field">
        <label>ملاحظات</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
