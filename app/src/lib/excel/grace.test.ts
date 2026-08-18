import { describe, expect, it } from 'vitest';
import { parseFollowupSheet } from './customers';

/**
 * انحدار: أعمدة المهل integer في قاعدة البيانات، والـ RPC تحوّلها بـ (…)::int.
 * خلية واحدة فيها 2.5 كانت تُفشل ملف الاستيراد كاملاً برسالة Postgres مبهمة
 * "invalid input syntax for type integer".
 */
describe('المهل الإضافية', () => {
  const sheet = (g1: unknown, g2: unknown, g3: unknown): unknown[][] => [
    [null, null, null, null, 'مهلة إضافية بعد التواصل (يوم)', null, null],
    ['تاريخ الاستحقاق', 'مسئول متابعة التحصيل', 'رقم العميل', 'اسم الزبون', '1', '2', '3'],
    ['2026-01-01', 'أحمد', '00007', 'زبون', g1, g2, g3],
  ];

  it('تُقرأ كأعداد صحيحة', () => {
    const { rows } = parseFollowupSheet(sheet(3, 5, 7));
    expect(rows[0]).toMatchObject({ customer_number: '7', grace_1: 3, grace_2: 5, grace_3: 7 });
  });

  it('تُقرَّب القيم العشرية بدل تمريرها كما هي', () => {
    const { rows } = parseFollowupSheet(sheet(2.5, 1.4, '3.6'));
    expect(rows[0].grace_1).toBe(3);
    expect(rows[0].grace_2).toBe(1);
    expect(rows[0].grace_3).toBe(4);
    for (const v of [rows[0].grace_1, rows[0].grace_2, rows[0].grace_3]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('تُصفَّر القيم السالبة والفارغة', () => {
    const { rows } = parseFollowupSheet(sheet(-4, null, ''));
    expect(rows[0]).toMatchObject({ grace_1: 0, grace_2: 0, grace_3: 0 });
  });
});
