import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCustomReminders,
  useDeleteCustomReminder,
  useSnoozeReminder,
  useToggleReminderStatus,
} from '@/lib/queries';
import {
  IconAlertCircle,
  IconCalendar,
  IconCheck,
  IconClock,
  IconMoon,
  IconPlus,
  IconTrash,
  IconUsers,
  IconZap,
} from '@/components/ui/Icons';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { todayStr, daysBetween } from '@/lib/logic/dates';
import { RemindMeModal } from './RemindMeModal';
import type { CustomReminder } from '@/types/models';

type TabKey = 'today' | 'overdue' | 'upcoming' | 'completed' | 'all';

export function CustomRemindersSection() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: reminders = [], isLoading } = useCustomReminders();
  const toggleStatus = useToggleReminderStatus();
  const snooze = useSnoozeReminder();
  const deleteReminder = useDeleteCustomReminder();

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const today = todayStr();

  const counts = useMemo(() => {
    const res = {
      today: 0,
      overdue: 0,
      upcoming: 0,
      completed: 0,
      all: reminders.length,
    };

    for (const r of reminders) {
      if (r.is_completed) {
        res.completed++;
      } else if (r.due_date === today) {
        res.today++;
      } else if (r.due_date < today) {
        res.overdue++;
      } else {
        res.upcoming++;
      }
    }

    return res;
  }, [reminders, today]);

  const filteredReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (activeTab === 'all') return true;
      if (activeTab === 'completed') return r.is_completed;
      if (r.is_completed) return false;
      if (activeTab === 'today') return r.due_date === today;
      if (activeTab === 'overdue') return r.due_date < today;
      if (activeTab === 'upcoming') return r.due_date > today;
      return true;
    });
  }, [reminders, activeTab, today]);

  const handleToggle = async (reminder: CustomReminder) => {
    try {
      await toggleStatus.mutateAsync({
        reminderId: reminder.id,
        isCompleted: !reminder.is_completed,
      });
      toast.show(
        reminder.is_completed ? 'تمت إعادة فتح التذكير' : 'تم إنجاز التذكير بنجاح',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleSnooze = async (reminderId: string, days: number) => {
    try {
      await snooze.mutateAsync({ reminderId, daysToAdd: days });
      toast.show(days === 1 ? 'تم تأجيل التذكير ليوم غد' : `تم تأجيل التذكير لـ ${days} أيام`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleDelete = async (reminderId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التذكير؟')) return;
    try {
      await deleteReminder.mutateAsync(reminderId);
      toast.show('تم حذف التذكير');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/30 p-4 shadow-sm">
      {/* رأس قسم التذكيرات */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
            <IconClock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">تذكيراتي المخصصة ومهامي</h3>
              {counts.today + counts.overdue > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                  {counts.today + counts.overdue} معلّق
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              مهام ومواعيد شخصية مستقلة عن جدول الاستحقاق المحاسبي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm text-xs"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? 'عرض التذكيرات' : 'طي القسم'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1.5 text-xs font-semibold shadow-xs"
            onClick={() => setModalOpen(true)}
          >
            <IconPlus className="h-3.5 w-3.5" />
            <span>إضافة تذكير حر</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* تبويبات الفرز والتصفية */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-b border-gray-100/80 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('today')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'today'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <IconZap className={`h-3.5 w-3.5 ${activeTab === 'today' ? 'text-amber-300' : 'text-amber-500'}`} />
              <span>المستحقة اليوم</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-bold mono ${
                  activeTab === 'today' ? 'bg-blue-800 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {counts.today}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overdue')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'overdue'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <IconAlertCircle className={`h-3.5 w-3.5 ${activeTab === 'overdue' ? 'text-white' : 'text-red-500'}`} />
              <span>المتأخرة</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-bold mono ${
                  activeTab === 'overdue' ? 'bg-red-800 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {counts.overdue}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upcoming')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'upcoming'
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <IconCalendar className="h-3.5 w-3.5 text-gray-400" />
              <span>القادمة</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-bold mono ${
                  activeTab === 'upcoming' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {counts.upcoming}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('completed')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'completed'
                  ? 'bg-green-600 text-white shadow-xs'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <IconCheck className={`h-3.5 w-3.5 ${activeTab === 'completed' ? 'text-white' : 'text-green-600'}`} />
              <span>المكتملة</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-bold mono ${
                  activeTab === 'completed' ? 'bg-green-800 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {counts.completed}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-navy-800 text-white shadow-xs'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <span>الكل</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-bold mono ${
                  activeTab === 'all' ? 'bg-navy-950 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {counts.all}
              </span>
            </button>
          </div>

          {/* قائمة بطاقات التذكيرات */}
          <div className="mt-3.5 space-y-2.5">
            {isLoading ? (
              <div className="py-6 text-center text-xs text-gray-500">جارٍ تحميل التذكيرات…</div>
            ) : filteredReminders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white/70 py-6 text-center text-xs text-gray-500">
                لا توجد تذكيرات في هذا التبويب حالياً
              </div>
            ) : (
              filteredReminders.map((r) => {
                const diff = daysBetween(today, r.due_date);
                const isOverdue = !r.is_completed && diff < 0;
                const isToday = !r.is_completed && diff === 0;

                return (
                  <div
                    key={r.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
                      r.is_completed
                        ? 'border-gray-200 bg-gray-50/60 opacity-75'
                        : isOverdue
                          ? 'border-red-200 bg-red-50/40'
                          : isToday
                            ? 'border-blue-200 bg-blue-50/40 shadow-xs'
                            : 'border-gray-200 bg-white shadow-xs'
                    }`}
                  >
                    {/* الجانب الأيمن: خانة الاختيار + العنوان + العميل */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleToggle(r)}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                          r.is_completed
                            ? 'border-green-600 bg-green-600 text-white'
                            : 'border-gray-300 bg-white hover:border-blue-500'
                        }`}
                        title={r.is_completed ? 'تعليم كغير منجز' : 'تعليم كمنجز'}
                      >
                        {r.is_completed && <IconCheck className="h-3.5 w-3.5 stroke-[3]" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-xs font-bold ${
                              r.is_completed
                                ? 'text-gray-500 line-through'
                                : 'text-gray-900'
                            }`}
                          >
                            {r.title}
                          </span>

                          {/* شارة الأولوية */}
                          {r.priority === 'urgent' && (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10px] font-bold bg-red-100 text-red-700">
                              <IconAlertCircle className="h-3 w-3" />
                              عاجل
                            </span>
                          )}
                          {r.priority === 'high' && (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10px] font-bold bg-amber-100 text-amber-700">
                              هام
                            </span>
                          )}

                          {/* شارة الاستحقاق */}
                          {isOverdue && (
                            <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] font-bold text-red-700 mono">
                              متأخر {Math.abs(diff)} يوم
                            </span>
                          )}
                          {isToday && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700">
                              اليوم
                            </span>
                          )}
                        </div>

                        {/* العميل المربوط والملاحظات */}
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                          {r.customer_name && (
                            <button
                              type="button"
                              onClick={() => r.customer_id && navigate(`/customers/${r.customer_id}`)}
                              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                            >
                              <IconUsers className="h-3 w-3" />
                              <span>{r.customer_name}</span>
                              {r.customer_number && <span className="mono">#{r.customer_number}</span>}
                            </button>
                          )}

                          <span className="mono">
                            {r.due_date} {r.due_time ? r.due_time.slice(0, 5) : ''}
                          </span>

                          {r.notes && (
                            <span className="truncate max-w-[280px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded text-[10.5px]">
                              {r.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* الجانب الأيسر: الإجراءات السريعة (تأجيل / حذف) */}
                    <div className="flex items-center gap-1.5">
                      {!r.is_completed && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSnooze(r.id, 1)}
                            className="btn btn-outline btn-sm py-1 px-2 text-[11px] gap-1 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                            title="تأجيل موعد التذكير ليوم غد"
                          >
                            <IconMoon className="h-3 w-3 text-amber-500" />
                            <span>تأجيل لغد</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSnooze(r.id, 3)}
                            className="btn btn-outline btn-sm py-1 px-2 text-[11px] text-gray-600 hover:bg-gray-100"
                            title="تأجيل 3 أيام"
                          >
                            +3 أيام
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="حذف التذكير"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <RemindMeModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
