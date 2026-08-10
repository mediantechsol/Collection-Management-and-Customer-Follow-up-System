import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast, errorMessage } from '@/components/ui/Toast';
import { useAddFollowup } from '@/lib/queries';
import { useProfile } from '@/features/auth/AuthContext';
import { todayStr } from '@/lib/logic/dates';
import type { FollowupType, Seriousness, UUID } from '@/types/models';

const TYPES: FollowupType[] = ['اتصال', 'واتساب', 'زيارة', 'أخرى'];
const LEVELS: Seriousness[] = ['عالي', 'متوسط', 'منخفض'];

interface Props {
  customerId: UUID;
  customerName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * تسجيل متابعة — كل الحقول التي طلبها العميل صراحة في رؤيته:
 * التاريخ والوقت (تلقائياً)، النوع، النتيجة، الموعد القادم، مستوى الجدية،
 * والمبلغ المتوقع تحصيله.
 *
 * ملاحظة: "المبلغ المتوقع" ليس تحصيلاً فعلياً — التحصيل الفعلي يُسجَّل في
 * شاشة "الدفعات المحصّلة" وهو وحده ما يُولّد الحوافز.
 */
export function FollowupModal({ customerId, customerName, open, onClose }: Props) {
  const profile = useProfile();
  const toast = useToast();
  const addFollowup = useAddFollowup();

  const [form, setForm] = useState({
    followup_date: todayStr(),
    followup_time: new Date().toTimeString().slice(0, 5),
    type_followup: 'اتصال' as FollowupType,
    level_seriousness: 'متوسط' as Seriousness,
    contact_result: '',
    next_followup_date: '',
    expected_collection_amount: '',
    details: '',
    description_customer: '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    try {
      await addFollowup.mutateAsync({
        customer_id: customerId,
        user_id: profile.id,
        followup_date: form.followup_date || todayStr(),
        followup_time: form.followup_time || null,
        type_followup: form.type_followup,
        contact_result: form.contact_result.trim() || null,
        next_followup_date: form.next_followup_date || null,
        details: form.details.trim() || null,
        description_customer: form.description_customer.trim() || null,
        level_seriousness: form.level_seriousness,
        expected_collection_amount: Number(form.expected_collection_amount) || 0,
      });
      toast.show('تم حفظ المتابعة');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Modal
      open={open}
      title={`إضافة متابعة — ${customerName}`}
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
            disabled={addFollowup.isPending}
          >
            {addFollowup.isPending ? 'جارٍ الحفظ…' : 'حفظ المتابعة'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <div className="field">
          <label>تاريخ المتابعة</label>
          <input
            type="date"
            value={form.followup_date}
            onChange={(e) => set('followup_date', e.target.value)}
          />
        </div>
        <div className="field">
          <label>وقت المتابعة</label>
          <input
            type="time"
            value={form.followup_time}
            onChange={(e) => set('followup_time', e.target.value)}
          />
        </div>
        <div className="field">
          <label>نوع المتابعة</label>
          <select
            value={form.type_followup}
            onChange={(e) => set('type_followup', e.target.value as FollowupType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>مستوى جدية العميل</label>
          <select
            value={form.level_seriousness}
            onChange={(e) => set('level_seriousness', e.target.value as Seriousness)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>نتيجة التواصل</label>
        <input
          type="text"
          value={form.contact_result}
          onChange={(e) => set('contact_result', e.target.value)}
          placeholder="مثال: وعد بالسداد، لم يرد، سدّد جزئياً…"
        />
        <p className="mt-1 text-[11px] text-gray-500">
          كتابة كلمة «وعد» هنا مع تحديد موعد المتابعة القادمة تُطلق تنبيه «وعد بالسداد اليوم» في موعده.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <div className="field">
          <label>موعد المتابعة القادمة</label>
          <input
            type="date"
            value={form.next_followup_date}
            onChange={(e) => set('next_followup_date', e.target.value)}
          />
        </div>
        <div className="field">
          <label>المبلغ المتوقع تحصيله</label>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
            value={form.expected_collection_amount}
            onChange={(e) => set('expected_collection_amount', e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="field">
        <label>تفاصيل المتابعة</label>
        <textarea
          rows={3}
          value={form.details}
          onChange={(e) => set('details', e.target.value)}
        />
      </div>
    </Modal>
  );
}
