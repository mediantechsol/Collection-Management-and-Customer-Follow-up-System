/**
 * أنواع التنبيهات الستة — التعريف الوحيد لها في الواجهة.
 *
 * ⚠️ قرار معماري مقصود: منطق *توليد* التنبيهات لا يوجد هنا إطلاقاً، بل في
 * دالة قاعدة البيانات public.generate_daily_notifications() فقط. في النموذج
 * الأولي كان المنطق في JS، ثم نُسخ إلى SQL، وأي نسختين للقاعدة نفسها تتباعدان
 * حتماً مع الوقت. هذا الملف يحمل *العرض* فقط (المفتاح ← تسمية ولون وأيقونة)،
 * والتوليد يُستدعى عبر RPC.
 *
 * المفاتيح ثابتة إنجليزية بدل النص العربي الذي كان مخزّناً في النموذج الأولي،
 * لأن نص "قبل الاستحقاق بـ 3 أيام" كان يحوي العتبة داخله فيستحيل جعلها
 * قابلة للضبط دون تعديل بيانات مخزَّنة.
 */

export const NOTIFICATION_TYPES = [
  'before_due',
  'due_today',
  'shopping_now',
  'promise_today',
  'stale',
  'escalated',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationMeta {
  /** التسمية العربية المعروضة. تقبل العتبة لأنها قابلة للضبط من الإعدادات. */
  label: (settings: { daysBeforeDueAlert: number; noFollowupDaysLimit: number }) => string;
  fg: string;
  bg: string;
  icon: IconName;
  /** هل يُولَّد آلياً أم يرفعه المستخدم يدوياً؟ */
  automatic: boolean;
}

export type IconName =
  | 'calendar'
  | 'calendarAlert'
  | 'userCheck'
  | 'handshake'
  | 'clock'
  | 'eye';

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  before_due: {
    label: (s) => `قبل الاستحقاق بـ ${s.daysBeforeDueAlert} أيام`,
    fg: '#E23F6B',
    bg: '#FDEAF1',
    icon: 'calendar',
    automatic: true,
  },
  due_today: {
    label: () => 'يوم الاستحقاق',
    fg: '#E23F3F',
    bg: '#FDEAEA',
    icon: 'calendarAlert',
    automatic: true,
  },
  shopping_now: {
    label: () => 'يسوق الآن',
    fg: '#EF8C3C',
    bg: '#FDEEE0',
    icon: 'userCheck',
    automatic: true,
  },
  promise_today: {
    label: () => 'وعد بالسداد اليوم',
    fg: '#3E7BFA',
    bg: '#EAF1FE',
    icon: 'handshake',
    automatic: true,
  },
  stale: {
    label: (s) => `لم تتم متابعته منذ ${s.noFollowupDaysLimit} يوماً`,
    fg: '#DFA22E',
    bg: '#FCF3DE',
    icon: 'clock',
    automatic: true,
  },
  escalated: {
    label: () => 'يحتاج مراجعة المدير',
    fg: '#8B5CF6',
    bg: '#F1ECFE',
    icon: 'eye',
    automatic: false,
  },
};

export function isNotificationType(v: string): v is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

/** نص سبب / تفاصيل التنبيه لعرضه في عمود «السبب» بالجدول. */
export function notificationReason(
  type: NotificationType,
  settings: { daysBeforeDueAlert: number; noFollowupDaysLimit: number },
): string {
  switch (type) {
    case 'before_due':
      return `موعد الاستحقاق بعد ${settings.daysBeforeDueAlert} أيام`;
    case 'due_today':
      return 'موعد الاستحقاق اليوم';
    case 'shopping_now':
      return 'العميل يسوّق الآن';
    case 'promise_today':
      return 'وعد بالسداد في تاريخ اليوم';
    case 'stale':
      return `مرور ${settings.noFollowupDaysLimit} يوماً بلا متابعة`;
    case 'escalated':
      return 'يحتاج مراجعة المدير';
    default:
      return type;
  }
}
