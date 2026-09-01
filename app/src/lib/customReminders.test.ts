import { describe, expect, it } from 'vitest';
import type { CustomReminder, ReminderPriority, CreateReminderInput } from '@/types/models';

describe('Custom Reminders (Remind Me) Logic & Models', () => {
  const TODAY = '2026-09-01';

  const mockReminders: CustomReminder[] = [
    {
      id: 'rem-1',
      user_id: 'user-1',
      customer_id: 'cust-1',
      customer_name: 'شركة الأفق للتجارة',
      customer_number: '1001',
      title: 'اتصال لمتابعة الشيك',
      notes: 'تم الاتصال صباحاً',
      due_date: '2026-09-01', // Today
      due_time: '10:30:00',
      priority: 'urgent',
      is_completed: false,
      completed_at: null,
      snoozed_until: null,
      created_at: '2026-08-30T10:00:00Z',
      updated_at: '2026-08-30T10:00:00Z',
    },
    {
      id: 'rem-2',
      user_id: 'user-1',
      customer_id: 'cust-2',
      customer_name: 'مؤسسة النور الحديثة',
      customer_number: '1002',
      title: 'زيارة ميدانية للمطابقة',
      notes: null,
      due_date: '2026-08-28', // Overdue
      priority: 'high',
      is_completed: false,
      completed_at: null,
      snoozed_until: null,
      created_at: '2026-08-25T10:00:00Z',
      updated_at: '2026-08-25T10:00:00Z',
    },
    {
      id: 'rem-3',
      user_id: 'user-1',
      customer_id: null,
      customer_name: null,
      customer_number: null,
      title: 'مراجعة إدارة الحسابات',
      notes: 'استلام سندات قبض جديدة',
      due_date: '2026-09-05', // Upcoming
      priority: 'normal',
      is_completed: false,
      completed_at: null,
      snoozed_until: null,
      created_at: '2026-08-31T10:00:00Z',
      updated_at: '2026-08-31T10:00:00Z',
    },
    {
      id: 'rem-4',
      user_id: 'user-1',
      customer_id: 'cust-1',
      customer_name: 'شركة الأفق للتجارة',
      customer_number: '1001',
      title: 'إرسال كشف حساب بالواتساب',
      notes: 'تم الإرسال',
      due_date: '2026-08-29',
      priority: 'low',
      is_completed: true, // Completed
      completed_at: '2026-08-29T14:00:00Z',
      snoozed_until: null,
      created_at: '2026-08-28T10:00:00Z',
      updated_at: '2026-08-29T14:00:00Z',
    },
  ];

  type ReminderStatusGroup = 'today' | 'overdue' | 'upcoming' | 'completed';

  const classifyReminder = (reminder: CustomReminder, referenceDate: string): ReminderStatusGroup => {
    if (reminder.is_completed) return 'completed';
    if (reminder.due_date === referenceDate) return 'today';
    if (reminder.due_date < referenceDate) return 'overdue';
    return 'upcoming';
  };

  it('correctly classifies reminder status categories', () => {
    expect(classifyReminder(mockReminders[0], TODAY)).toBe('today');
    expect(classifyReminder(mockReminders[1], TODAY)).toBe('overdue');
    expect(classifyReminder(mockReminders[2], TODAY)).toBe('upcoming');
    expect(classifyReminder(mockReminders[3], TODAY)).toBe('completed');
  });

  it('aggregates reminder counts by status group accurately', () => {
    const counts = {
      all: mockReminders.length,
      today: 0,
      overdue: 0,
      upcoming: 0,
      completed: 0,
    };

    for (const r of mockReminders) {
      const status = classifyReminder(r, TODAY);
      counts[status]++;
    }

    expect(counts.all).toBe(4);
    expect(counts.today).toBe(1);
    expect(counts.overdue).toBe(1);
    expect(counts.upcoming).toBe(1);
    expect(counts.completed).toBe(1);
  });

  it('calculates snooze date correctly when adding days', () => {
    const calculateSnoozeDate = (baseDateStr: string, daysToAdd: number): string => {
      const date = new Date(baseDateStr);
      date.setUTCDate(date.getUTCDate() + daysToAdd);
      return date.toISOString().split('T')[0];
    };

    expect(calculateSnoozeDate('2026-09-01', 1)).toBe('2026-09-02');
    expect(calculateSnoozeDate('2026-09-01', 3)).toBe('2026-09-04');
    expect(calculateSnoozeDate('2026-09-01', 7)).toBe('2026-09-08');
  });

  it('validates reminder input payload constraints', () => {
    const validateReminderInput = (input: Partial<CreateReminderInput>): { valid: boolean; error?: string } => {
      if (!input.title || !input.title.trim()) {
        return { valid: false, error: 'عنوان التذكير مطلوب' };
      }
      if (input.title.trim().length > 100) {
        return { valid: false, error: 'عنوان التذكير طويل جداً' };
      }
      if (!input.dueDate) {
        return { valid: false, error: 'تاريخ التذكير مطلوب' };
      }
      const validPriorities: ReminderPriority[] = ['low', 'normal', 'high', 'urgent'];
      if (input.priority && !validPriorities.includes(input.priority)) {
        return { valid: false, error: 'أولوية التذكير غير صالحة' };
      }
      return { valid: true };
    };

    expect(validateReminderInput({ title: '', dueDate: '2026-09-02' }).valid).toBe(false);
    expect(validateReminderInput({ title: '  ', dueDate: '2026-09-02' }).valid).toBe(false);
    expect(validateReminderInput({ title: 'متابعة سداد', dueDate: '' }).valid).toBe(false);
    expect(validateReminderInput({ title: 'متابعة سداد', dueDate: '2026-09-02', priority: 'urgent' }).valid).toBe(true);
    expect(validateReminderInput({ title: 'متابعة سداد', dueDate: '2026-09-02' }).valid).toBe(true);
  });

  it('filters reminders by customer ID accurately', () => {
    const filterByCustomer = (customerId: string | null) => {
      return mockReminders.filter((r) => r.customer_id === customerId);
    };

    expect(filterByCustomer('cust-1')).toHaveLength(2);
    expect(filterByCustomer('cust-2')).toHaveLength(1);
    expect(filterByCustomer(null)).toHaveLength(1);
  });
});
