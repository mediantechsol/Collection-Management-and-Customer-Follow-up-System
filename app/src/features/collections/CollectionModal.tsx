import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { ratesFrom, useAddCollection, useSettings } from '@/lib/queries';
import { todayStr } from '@/lib/logic/dates';
import { CURRENCIES, CURRENCY_LABELS, fmt, rateFor, round2, type Currency } from '@/lib/logic/money';
import type { CustomerOverview } from '@/types/models';

interface Props {
  customer: CustomerOverview;
  open: boolean;
  onClose: () => void;
}

/**
 * تسجيل دفعة محصّلة يدوياً.
 *
 * الدفعات تُسجَّل غير معتمدة، ولا يُولَّد الحافز إلا بعد اعتماد المحاسب لها
 * من شاشة الدفعات — وهذا ما اتُّفق عليه: التحصيل يُشتق آلياً من الاستيراد
 * ويُدخل يدوياً عند التحصيل النقدي المباشر، والاعتماد في الحالتين محاسبي.
 *
 * سعر الصرف يُثبَّت وقت التسجيل (rate_used) ولا يتغيّر بعدها، وإلا تغيّرت
 * قيمة حوافز سابقة كلما عُدِّل سعر الصرف في الإعدادات.
 */
export function CollectionModal({ customer, open, onClose }: Props) {
  const toast = useToast();
  const { data: settings } = useSettings();
  const addCollection = useAddCollection();
  const rates = ratesFrom(settings);

  const [currency, setCurrency] = useState<Currency>('YER');
  const [amount, setAmount] = useState('');
  const [collectedDate, setCollectedDate] = useState(todayStr());
  const [note, setNote] = useState('');

  const rate = rateFor(currency, rates);
  const amountNumber = Number(amount) || 0;
  const amountYer = round2(amountNumber * rate);
  // سعر الصرف يُثبَّت في الصف ولا يُعاد حسابه أبداً، فحفظه بصفر (قبل وصول
  // الإعدادات أو إن لم يُضبط سعر العملة) يعني دفعة قيمتها صفر بالريال وحافزاً
  // صفرياً إلى الأبد — والقاعدة تقبل الصف بلا اعتراض. لذلك يُمنع الحفظ هنا.
  const rateMissing = rate <= 0;

  async function save() {
    if (amountNumber <= 0) {
      toast.error('أدخل مبلغاً أكبر من صفر');
      return;
    }
    if (rateMissing) {
      toast.error(
        settings
          ? `سعر صرف ${CURRENCY_LABELS[currency]} غير مضبوط في الإعدادات — لا يمكن تسجيل الدفعة بقيمة صفر`
          : 'لم تُحمَّل الإعدادات بعد — انتظر لحظة ثم أعد المحاولة',
      );
      return;
    }
    try {
      await addCollection.mutateAsync({
        customer_id: customer.id,
        user_id: customer.assigned_user_id,
        currency,
        amount: amountNumber,
        rate_used: rate,
        amount_yer: amountYer,
        collected_date: collectedDate,
        note: note.trim() || null,
      });
      toast.show('تم تسجيل الدفعة — بانتظار اعتماد المحاسب');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Modal
      open={open}
      title={`تسجيل دفعة محصّلة — ${customer.customer_name}`}
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
            disabled={addCollection.isPending || rateMissing}
          >
            {addCollection.isPending ? 'جارٍ الحفظ…' : 'حفظ الدفعة'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <div className="field">
          <label>العملة</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المبلغ</label>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="field">
          <label>تاريخ التحصيل</label>
          <input
            type="date"
            value={collectedDate}
            onChange={(e) => setCollectedDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label>المحصِّل</label>
          <input
            type="text"
            value={customer.assigned_user_id ? 'مسؤول العميل المعيَّن' : 'غير معيَّن'}
            disabled
          />
        </div>
      </div>

      <div className="field">
        <label>ملاحظة</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {rateMissing && (
        <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-500">
          {settings
            ? `سعر صرف ${CURRENCY_LABELS[currency]} غير مضبوط في الإعدادات — اضبطه أولاً، وإلا سُجّلت الدفعة بقيمة صفر بالريال ولن يُحتسب عليها أي حافز.`
            : 'جارٍ تحميل أسعار الصرف…'}
        </div>
      )}

      <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        القيمة بالريال اليمني: <span className="mono text-blue-700">{fmt(amountYer)}</span>
        {currency !== 'YER' && <> (سعر الصرف المثبَّت: {fmt(rate)})</>}
        <br />
        الحافز يُحتسب بعد اعتماد المحاسب للدفعة، بنسبة فئة العميل
        {customer.incentive_rate != null && <> ({customer.incentive_rate}%)</>}.
      </div>
    </Modal>
  );
}
