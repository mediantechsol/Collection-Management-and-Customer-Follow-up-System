import type { ReactNode } from 'react';
import type { DueStatus } from '@/lib/logic/dates';
import { NOTIFICATION_META, type NotificationType } from '@/lib/logic/notifications';

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue';

export function Pill({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** شارة حالة الاستحقاق — العتبات تأتي من الإعدادات لا من الكود. */
export function DuePill({ status, overdueDays }: { status: DueStatus; overdueDays?: number }) {
  switch (status) {
    case 'overdue_severe':
      return <Pill tone="red">متعثّر {overdueDays ? `(${overdueDays} يوم)` : ''}</Pill>;
    case 'overdue':
      return <Pill tone="red">متأخر</Pill>;
    case 'due_soon':
      return <Pill tone="amber">قريب الاستحقاق</Pill>;
    case 'ok':
      return <Pill tone="green">ضمن المهلة</Pill>;
    default:
      return <Pill tone="gray">—</Pill>;
  }
}

/** شارة نوع التنبيه بلونه الخاص — نفس ألوان النموذج الأولي. */
export function NotificationPill({
  type,
  settings,
}: {
  type: NotificationType;
  settings: { daysBeforeDueAlert: number; noFollowupDaysLimit: number };
}) {
  const meta = NOTIFICATION_META[type];
  if (!meta) return <Pill tone="blue">{type}</Pill>;
  return (
    <span className="pill" style={{ background: meta.bg, color: meta.fg }}>
      {meta.label(settings)}
    </span>
  );
}

export function CategoryDot({ color }: { color?: string | null }) {
  if (!color) return null;
  return <span className="cat-dot" style={{ background: color }} />;
}
