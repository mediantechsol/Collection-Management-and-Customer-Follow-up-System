import { describe, it, expect } from 'vitest';
import {
  addDays,
  calcNewDueDate,
  calcRemainingDays,
  classifyDue,
  daysBetween,
  todayStr,
} from './dates';

describe('addDays', () => {
  it('يضيف الأيام بشكل صحيح', () => {
    expect(addDays('2026-01-01', 10)).toBe('2026-01-11');
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('يتخطى حدود الشهر والسنة والسنة الكبيسة', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 2028 كبيسة
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // 2026 ليست كبيسة
  });

  it('لا ينزاح يوماً في المناطق الزمنية الشرقية — الخطأ الذي كان في النموذج الأولي', () => {
    // النسخة القديمة كانت تُرجع 2025-12-31 لدى مستخدم في اليمن (UTC+3)
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
  });

  it('يرفض التواريخ غير الصالحة بدل إرجاع NaN بصمت', () => {
    expect(() => addDays('01/01/2026', 1)).toThrow();
    expect(() => addDays('', 1)).toThrow();
  });
});

describe('daysBetween', () => {
  it('يحسب الفرق بالاتجاهين', () => {
    expect(daysBetween('2026-01-01', '2026-01-11')).toBe(10);
    expect(daysBetween('2026-01-11', '2026-01-01')).toBe(-10);
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('لا يتأثر بالتوقيت الصيفي', () => {
    // فترة تحوي انتقال التوقيت الصيفي في نصف الكرة الشمالي
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });
});

describe('calcNewDueDate', () => {
  it('يجمع المهل الثلاث على تاريخ الاستحقاق', () => {
    expect(calcNewDueDate('2026-01-01', 5, 3, 2)).toBe('2026-01-11');
  });

  it('يتعامل مع المهل الفارغة كأصفار', () => {
    expect(calcNewDueDate('2026-01-01', 0, 0, 0)).toBe('2026-01-01');
    expect(calcNewDueDate('2026-01-01', null, undefined, 0)).toBe('2026-01-01');
  });
});

describe('calcRemainingDays', () => {
  it('موجب قبل الاستحقاق وسالب بعده وصفر في يومه', () => {
    expect(calcRemainingDays('2026-01-11', '2026-01-01')).toBe(10);
    expect(calcRemainingDays('2026-01-01', '2026-01-11')).toBe(-10);
    expect(calcRemainingDays('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('todayStr', () => {
  it('يُرجع تاريخ اليوم التقويمي المحلي لا تاريخ UTC', () => {
    // 23:30 محلياً — النسخة المعتمدة على toISOString كانت تُرجع اليوم التالي
    // للمستخدمين غرب غرينتش واليوم السابق لمن هم شرقها.
    const d = new Date(2026, 0, 1, 23, 30, 0);
    expect(todayStr(d)).toBe('2026-01-01');
  });
});

describe('classifyDue', () => {
  const opts = { daysBeforeDueAlert: 3, overdueAlertDays: 35 };

  it('يصنّف حسب العتبات القابلة للضبط', () => {
    expect(classifyDue(10, opts)).toBe('ok');
    expect(classifyDue(3, opts)).toBe('due_soon');
    expect(classifyDue(0, opts)).toBe('due_soon');
    expect(classifyDue(-1, opts)).toBe('overdue');
    expect(classifyDue(-35, opts)).toBe('overdue_severe');
    expect(classifyDue(-100, opts)).toBe('overdue_severe');
    expect(classifyDue(null, opts)).toBe('unknown');
  });

  it('يحترم عتبة الخمسة أيام المستخدمة في شيت العميل الحقيقي', () => {
    const five = { daysBeforeDueAlert: 5, overdueAlertDays: 35 };
    expect(classifyDue(5, five)).toBe('due_soon');
    expect(classifyDue(6, five)).toBe('ok');
  });
});
