import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { useCategories, useSaveCustomer, useSaveDueDate, useUserDirectory } from '@/lib/queries';
import { calcNewDueDate } from '@/lib/logic/dates';
import type { CustomerOverview } from '@/types/models';

interface Props {
  existing: CustomerOverview | null;
  open: boolean;
  onClose: () => void;
}

/**
 * إضافة/تعديل عميل — يشمل تاريخ الاستحقاق والمهل الثلاث، وهي في جدول منفصل
 * (due_dates) لكن لا معنى لفصلها عن المستخدم في الواجهة.
 *
 * "تاريخ الاستحقاق الجديد" لا يُدخَل يدوياً أبداً: يُحسب من التاريخ + المهل،
 * وهي قاعدة العمل الأساسية في هذا النظام.
 */
export function CustomerModal({ existing, open, onClose }: Props) {
  const toast = useToast();
  const { data: categories = [] } = useCategories();
  const { data: directory = [] } = useUserDirectory();
  const saveCustomer = useSaveCustomer();
  const saveDueDate = useSaveDueDate();

  const isEdit = !!existing;
  const collectors = directory.filter(
    (u) => u.name_role === 'مسؤول التحصيل' || u.name_role === 'مستخدم مخصص',
  );

  const [form, setForm] = useState({
    customer_number: existing?.customer_number ?? '',
    customer_name: existing?.customer_name ?? '',
    mobile_1: existing?.mobile_1 ?? '',
    mobile_2: existing?.mobile_2 ?? '',
    guarantor: existing?.guarantor ?? '',
    status_customer: existing?.status_customer ?? '',
    customer_category_id: existing?.customer_category_id ?? '',
    assigned_user_id: existing?.assigned_user_id ?? '',
    description: existing?.description ?? '',
    due_date: existing?.due_date ?? '',
    grace_1: String(existing?.grace_1 ?? 0),
    grace_2: String(existing?.grace_2 ?? 0),
    grace_3: String(existing?.grace_3 ?? 0),
  });

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const previewNewDue = form.due_date
    ? (() => {
        try {
          return calcNewDueDate(
            form.due_date,
            Number(form.grace_1),
            Number(form.grace_2),
            Number(form.grace_3),
          );
        } catch {
          return null;
        }
      })()
    : null;

  const busy = saveCustomer.isPending || saveDueDate.isPending;

  async function save() {
    if (!form.customer_name.trim()) {
      toast.error('اسم العميل مطلوب');
      return;
    }
    if (!isEdit && !form.customer_number.trim()) {
      toast.error('رقم العميل مطلوب');
      return;
    }

    try {
      const id = await saveCustomer.mutateAsync({
        id: existing?.id,
        values: {
          ...(isEdit ? {} : { customer_number: form.customer_number.trim() }),
          customer_name: form.customer_name.trim(),
          mobile_1: form.mobile_1.trim() || null,
          mobile_2: form.mobile_2.trim() || null,
          guarantor: form.guarantor.trim() || null,
          status_customer: form.status_customer.trim() || null,
          customer_category_id: form.customer_category_id || null,
          assigned_user_id: form.assigned_user_id || null,
          description: form.description.trim() || null,
        },
      });

      if (form.due_date) {
        await saveDueDate.mutateAsync({
          customer_id: id,
          due_date: form.due_date,
          grace_1: Number(form.grace_1) || 0,
          grace_2: Number(form.grace_2) || 0,
          grace_3: Number(form.grace_3) || 0,
        });
      }

      toast.show('تم الحفظ');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Modal
      open={open}
      wide
      title={isEdit ? 'تعديل بيانات العميل' : 'عميل جديد'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <div className="field">
          <label>رقم العميل</label>
          <input
            type="text"
            dir="ltr"
            className="text-left"
            value={form.customer_number}
            onChange={(e) => set('customer_number', e.target.value)}
            disabled={isEdit}
          />
          {isEdit && (
            <p className="mt-1 text-[11px] text-gray-500">
              رقم العميل هو مفتاح الربط مع ملفات Excel، ولا يُعدَّل بعد الإنشاء.
            </p>
          )}
        </div>
        <div className="field">
          <label>اسم العميل</label>
          <input
            type="text"
            value={form.customer_name}
            onChange={(e) => set('customer_name', e.target.value)}
          />
        </div>
        <div className="field">
          <label>الجوال 1</label>
          <input
            type="tel"
            dir="ltr"
            className="text-left"
            value={form.mobile_1}
            onChange={(e) => set('mobile_1', e.target.value)}
          />
        </div>
        <div className="field">
          <label>الجوال 2</label>
          <input
            type="tel"
            dir="ltr"
            className="text-left"
            value={form.mobile_2}
            onChange={(e) => set('mobile_2', e.target.value)}
          />
        </div>
        <div className="field">
          <label>الضامن / الضمانة</label>
          <input
            type="text"
            value={form.guarantor}
            onChange={(e) => set('guarantor', e.target.value)}
          />
        </div>
        <div className="field">
          <label>الحالة</label>
          <input
            type="text"
            value={form.status_customer}
            onChange={(e) => set('status_customer', e.target.value)}
            placeholder="مثال: يسوق الآن"
          />
        </div>
        <div className="field">
          <label>فئة العميل</label>
          <select
            value={form.customer_category_id}
            onChange={(e) => set('customer_category_id', e.target.value)}
          >
            <option value="">بدون فئة</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.category_name} ({c.incentive_rate}%)
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>مسؤول المتابعة</label>
          <select
            value={form.assigned_user_id}
            onChange={(e) => set('assigned_user_id', e.target.value)}
          >
            <option value="">بدون تعيين</option>
            {collectors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>وصف العميل</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      <h3 className="mb-2 mt-4 border-t border-gray-100 pt-3.5 text-[13px] font-bold">
        الاستحقاق والمهل
      </h3>
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
        <div className="field">
          <label>تاريخ الاستحقاق</label>
          <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </div>
        {(['grace_1', 'grace_2', 'grace_3'] as const).map((k, i) => (
          <div className="field" key={k}>
            <label>مهلة {i + 1} (يوم)</label>
            <input
              type="number"
              min={0}
              dir="ltr"
              className="text-left"
              value={form[k]}
              onChange={(e) => set(k, e.target.value)}
            />
          </div>
        ))}
      </div>
      {previewNewDue && (
        <p className="text-xs text-gray-600">
          تاريخ الاستحقاق الجديد المحسوب: <span className="mono text-blue-700">{previewNewDue}</span>
        </p>
      )}
    </Modal>
  );
}
