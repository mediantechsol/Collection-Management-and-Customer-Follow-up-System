import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCreateCustomReminder } from '@/lib/queries';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { addDays, todayStr } from '@/lib/logic/dates';
import {
  IconAlertCircle,
  IconBuilding,
  IconCalendar,
  IconClock,
  IconFileText,
  IconHandshake,
  IconLightbulb,
  IconPhone,
  IconShield,
  IconTag,
  IconZap,
} from '@/components/ui/Icons';
import type { ReminderPriority, UUID } from '@/types/models';

interface Props {
  open: boolean;
  onClose: () => void;
  customerId?: UUID | null;
  customerName?: string | null;
  initialTitle?: string;
}

const TITLE_SUGGESTIONS = [
  { icon: IconPhone, label: 'اتصال هاتفي', value: 'اتصال هاتفي لمتابعة السداد' },
  { icon: IconBuilding, label: 'زيارة ميدانية', value: 'زيارة ميدانية لمقر العميل' },
  { icon: IconFileText, label: 'إرسال كشف حساب', value: 'إرسال كشف حساب ومطابقة بالواتساب' },
  { icon: IconHandshake, label: 'تأكيد وعد سداد', value: 'تأكيد الالتزام بالوعد واستلام الشيك' },
  { icon: IconShield, label: 'متابعة ضمانة', value: 'متابعة الضامن واستيفاء الضمانات' },
];

const PRESETS = [
  { label: 'غداً', days: 1, isQuick: true },
  { label: 'بعد 3 أيام', days: 3 },
  { label: 'بعد أسبوع', days: 7 },
  { label: 'بعد أسبوعين', days: 14 },
];

export function RemindMeModal({
  open,
  onClose,
  customerId,
  customerName,
  initialTitle = '',
}: Props) {
  const toast = useToast();
  const createReminder = useCreateCustomReminder();

  const today = todayStr();
  const [title, setTitle] = useState(initialTitle);
  const [dueDate, setDueDate] = useState(() => addDays(today, 1));
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<ReminderPriority>('normal');
  const [notes, setNotes] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(1);

  const handleSelectPreset = (days: number) => {
    setSelectedPreset(days);
    setDueDate(addDays(today, days));
  };

  const handleCustomDateChange = (date: string) => {
    setSelectedPreset('custom');
    setDueDate(date);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('عنوان التذكير مطلوب');
      return;
    }
    if (!dueDate) {
      toast.error('تاريخ التذكير مطلوب');
      return;
    }

    try {
      await createReminder.mutateAsync({
        customerId: customerId || null,
        title: trimmedTitle,
        notes: notes.trim() || null,
        dueDate,
        dueTime: dueTime || null,
        priority,
      });

      toast.show('تم ضبط التذكير بنجاح');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <IconClock className="h-5 w-5 text-amber-600" />
          <span>{customerName ? `إضافة تذكير — ${customerName}` : 'إضافة تذكير حر جديد'}</span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* المقترحات السريعة لعنوان التذكير */}
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 mb-1.5">
            <IconLightbulb className="h-3.5 w-3.5 text-amber-500" />
            <span>مقترحات سريعة لعنوان التذكير:</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TITLE_SUGGESTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setTitle(s.value)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  <Icon className="h-3.5 w-3.5 text-gray-500" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* حقل عنوان التذكير */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1">
            عنوان التذكير <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="مثال: اتصال لمتابعة وصول الحوالة البنكية…"
            className="input-pill w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        {/* المواعيد المسبقة السريعة */}
        <div>
          <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1.5">
            <IconCalendar className="h-3.5 w-3.5 text-gray-500" />
            <span>موعد التذكير السريع:</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESETS.map((p) => {
              const isSelected = selectedPreset === p.days;
              return (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => handleSelectPreset(p.days)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold text-center transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20 shadow-xs'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p.isQuick && <IconZap className="h-3 w-3 text-amber-500" />}
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* تاريخ ووقت مخصص */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              تاريخ محدد:
            </label>
            <input
              type="date"
              required
              className="input-pill w-full mono text-xs"
              value={dueDate}
              onChange={(e) => handleCustomDateChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              وقت التنبيه (اختياري):
            </label>
            <input
              type="time"
              className="input-pill w-full mono text-xs"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </div>
        </div>

        {/* درجة الأهمية */}
        <div>
          <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1.5">
            <IconTag className="h-3.5 w-3.5 text-gray-500" />
            <span>درجة الأهمية:</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPriority('normal')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                priority === 'normal'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1.5 ring-blue-400'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span>عادي</span>
            </button>
            <button
              type="button"
              onClick={() => setPriority('high')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                priority === 'high'
                  ? 'border-amber-500 bg-amber-50 text-amber-700 ring-1.5 ring-amber-400'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>هام</span>
            </button>
            <button
              type="button"
              onClick={() => setPriority('urgent')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                priority === 'urgent'
                  ? 'border-red-500 bg-red-50 text-red-700 ring-1.5 ring-red-400'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <IconAlertCircle className="h-3.5 w-3.5 text-red-600" />
              <span>عاجل</span>
            </button>
          </div>
        </div>

        {/* الملاحظات الإضافية */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">
            ملاحظات وتفاصيل إضافية (اختياري):
          </label>
          <textarea
            rows={2}
            placeholder="أدخل أي ملاحظات تساعدك عند حلول موعد التذكير…"
            className="input-pill w-full text-xs rounded-xl py-2 resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* أزرار الحفظ والإلغاء */}
        <div className="mt-2 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClose}
            disabled={createReminder.isPending}
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm gap-1.5"
            disabled={createReminder.isPending}
          >
            {createReminder.isPending ? 'جارٍ الحفظ…' : 'حفظ التذكير'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
