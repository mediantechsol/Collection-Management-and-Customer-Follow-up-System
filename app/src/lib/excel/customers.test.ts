/**
 * اختبارات محلّل بيانات العملاء — تغطي التعرف على أعمدة الفئة والمسؤول
 * بصيغها المتعددة، واستخراج القيم، والدمج بين الشيتين.
 */

import { describe, it, expect } from 'vitest';
import {
  parseProfilesSheet,
  parseFollowupSheet,
  parseCustomersWorkbook,
} from './customers';
import { matchNormalized } from './normalize';

/* ---------------------------------------------------------------- قوالب بيانات تجريبية */

/** شيت بيانات عملاء يحوي أعمدة فئة ومسؤول. */
function profilesWithCategoryAndCollector(): unknown[][] {
  return [
    ['رقم العميل', 'اسم العميل', 'الجوال 1', 'الجوال 2', 'الضامن/ الضمانة', 'الحالة', 'فئة العميل', 'مسؤول التحصيل'],
    ['00001', 'أحمد علي', '711111111', null, null, 'نشط', 'فئة أ', 'محمد'],
    ['00002', 'خالد سعيد', '722222222', null, null, 'نشط', 'فئة ب', 'ايمن'],
    ['00003', 'سامي حسين', '733333333', null, null, 'موقوف', null, 'محمد'],
  ];
}

/** شيت بيانات عملاء بصيغة بديلة لأعمدة الفئة والمسؤول. */
function profilesWithAlternateHeaders(): unknown[][] {
  return [
    ['رقم العمبل', 'اسم العميل', 'الجوال', 'التصنيف', 'المحصل'],
    ['1', 'عبدالله أحمد', '744444444', 'تجاري', 'سعيد'],
    ['2', 'فهد محمد', '755555555', 'حكومي', 'سعيد'],
  ];
}

/** شيت بيانات عملاء بدون أعمدة فئة أو مسؤول (التوافق مع الوضع القديم). */
function profilesWithoutCategoryOrCollector(): unknown[][] {
  return [
    ['رقم العميل', 'اسم العميل', 'الجوال 1', 'الحالة'],
    ['1', 'عميل بسيط', '766666666', 'نشط'],
  ];
}

/** شيت متابعة عملاء يحوي عمود فئة. */
function followupWithCategory(): unknown[][] {
  // صف فارغ قبل الرؤوس (كما في الملف الحقيقي — الرؤوس في الصف 13 تقريباً)
  const blank = () => [null, null, null, null, null, null, null, null, null, null, null, null];
  return [
    ...Array.from({ length: 11 }, blank),
    // صف رؤوس المجموعات (merged headers)
    [null, null, null, null, null, null, null, null, null, 'مهله اضافيه بعد التواصل (يوم)', null, null],
    // صف الرؤوس
    ['تاريخ الاستحقاق', 'مسئول متابعة التحصيل', 'رقم العميل', 'اسم الزبون', 'فئة العميل', null, null, null, null, 1, 2, 3],
    // بيانات
    [new Date(2026, 0, 15), 'ايمن', 1, 'أحمد علي', 'فئة أ', null, null, null, null, 5, 10, 15],
    [new Date(2026, 1, 20), 'محمد', 2, 'خالد سعيد', 'فئة ب', null, null, null, null, 3, 0, 0],
    [new Date(2026, 2, 10), 'ايمن', 3, 'سامي حسين', null, null, null, null, null, 0, 0, 0],
  ];
}

/** شيت متابعة عملاء بدون عمود فئة (التوافق مع الملف الحقيقي القديم). */
function followupWithoutCategory(): unknown[][] {
  const blank = () => [null, null, null, null, null, null, null, null, null, null];
  return [
    ...Array.from({ length: 11 }, blank),
    [null, null, null, null, null, null, null, 'مهله اضافيه بعد التواصل (يوم)', null, null],
    ['تاريخ الاستحقاق', 'مسئول متابعة التحصيل', 'رقم العميل', 'اسم الزبون', null, null, null, 1, 2, 3],
    [new Date(2026, 0, 15), 'ايمن', 1, 'أحمد علي', null, null, null, 5, 10, 15],
  ];
}

/* ================================================================ اختبارات parseProfilesSheet */

describe('parseProfilesSheet — التعرف على أعمدة الفئة والمسؤول', () => {
  it('يستخرج category_name و assigned_name عند وجود الأعمدة', () => {
    const { rows, warnings } = parseProfilesSheet(profilesWithCategoryAndCollector());

    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(3);

    expect(rows[0].category_name).toBe('فئة أ');
    expect(rows[0].assigned_name).toBe('محمد');

    expect(rows[1].category_name).toBe('فئة ب');
    expect(rows[1].assigned_name).toBe('ايمن');

    // عميل بدون فئة
    expect(rows[2].category_name).toBeNull();
    expect(rows[2].assigned_name).toBe('محمد');
  });

  it('يتعرف على الأسماء البديلة: «التصنيف» و«المحصل»', () => {
    const { rows } = parseProfilesSheet(profilesWithAlternateHeaders());

    expect(rows).toHaveLength(2);
    expect(rows[0].category_name).toBe('تجاري');
    expect(rows[0].assigned_name).toBe('سعيد');
    expect(rows[1].category_name).toBe('حكومي');
  });

  it('يُرجع null عند غياب أعمدة الفئة والمسؤول (التوافق الخلفي)', () => {
    const { rows } = parseProfilesSheet(profilesWithoutCategoryOrCollector());

    expect(rows).toHaveLength(1);
    expect(rows[0].category_name).toBeNull();
    expect(rows[0].assigned_name).toBeNull();
  });
});

/* ================================================================ اختبارات parseFollowupSheet */

describe('parseFollowupSheet — التعرف على عمود الفئة', () => {
  it('يستخرج category_name عند وجود عمود فئة', () => {
    const { rows } = parseFollowupSheet(followupWithCategory());

    expect(rows).toHaveLength(3);
    expect(rows[0].category_name).toBe('فئة أ');
    expect(rows[1].category_name).toBe('فئة ب');
    expect(rows[2].category_name).toBeNull();
  });

  it('يُرجع null للفئة عند غياب العمود (التوافق الخلفي)', () => {
    const { rows } = parseFollowupSheet(followupWithoutCategory());

    expect(rows).toHaveLength(1);
    expect(rows[0].category_name).toBeNull();
    expect(rows[0].assigned_name).toBe('ايمن');
  });
});

/* ================================================================ اختبارات parseCustomersWorkbook */

describe('parseCustomersWorkbook — الدمج مع الفئات والمسؤولين', () => {
  it('يستخرج قائمة الفئات الفريدة', () => {
    const result = parseCustomersWorkbook({
      profiles: profilesWithCategoryAndCollector(),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).toEqual(['فئة أ', 'فئة ب']);
    expect(result.stats.withCategory).toBe(2);
    expect(result.stats.withCollector).toBe(3);
  });

  it('يدمج الفئة من الشيتين — شيت المتابعة يأخذ الأولوية', () => {
    const result = parseCustomersWorkbook({
      profiles: profilesWithCategoryAndCollector(),
      followups: followupWithCategory(),
    });

    expect(result.ok).toBe(true);
    // العميل 1: فئة أ في الشيتين — تبقى فئة أ
    const cust1 = result.rows.find((r) => r.customer_number === '1');
    expect(cust1?.category_name).toBe('فئة أ');

    // العميل 2: فئة ب في الشيتين — تبقى فئة ب
    const cust2 = result.rows.find((r) => r.customer_number === '2');
    expect(cust2?.category_name).toBe('فئة ب');

    // العميل 3: فئة null في المتابعة → يبقى القيمة من البيانات (null)
    const cust3 = result.rows.find((r) => r.customer_number === '3');
    expect(cust3?.category_name).toBeNull();
  });

  it('يعمل بدون أعمدة فئة أو مسؤول (التوافق الخلفي)', () => {
    const result = parseCustomersWorkbook({
      profiles: profilesWithoutCategoryOrCollector(),
      followups: followupWithoutCategory(),
    });

    expect(result.ok).toBe(true);
    expect(result.categories).toEqual([]);
    expect(result.stats.withCategory).toBe(0);
  });

  it('يحتفظ بالمسؤول من شيت البيانات إن لم يوجد في المتابعة', () => {
    const result = parseCustomersWorkbook({
      profiles: profilesWithCategoryAndCollector(),
    });

    expect(result.assignees).toContain('محمد');
    expect(result.assignees).toContain('ايمن');
    expect(result.stats.withCollector).toBe(3);
  });
});

/* ================================================================ اختبارات matchNormalized */

describe('matchNormalized', () => {
  const users = [
    { id: '1', full_name: 'أيمن محمد' },
    { id: '2', full_name: 'محمد صالح' },
    { id: '3', full_name: 'عبدالله أحمد' },
  ];

  it('يطابق الأسماء رغم اختلاف الهمزات', () => {
    const match = matchNormalized('ايمن محمد', users, (u) => u.full_name);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('1');
  });

  it('يطابق الأسماء رغم اختلاف التاء المربوطة والهاء', () => {
    const match = matchNormalized('عبدالله احمد', users, (u) => u.full_name);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('3');
  });

  it('يُرجع null عند عدم المطابقة', () => {
    const match = matchNormalized('اسم غير موجود', users, (u) => u.full_name);
    expect(match).toBeNull();
  });

  it('يطابق أسماء الفئات رغم اختلاف أشكال الألف', () => {
    const categories = [
      { name: 'فئة أ', id: 'cat-1' },
      { name: 'تجاري', id: 'cat-2' },
    ];
    const match = matchNormalized('فئه ا', categories, (c) => c.name);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('cat-1');
  });
});

/* ================================================================ اختبارات رؤوس الأعمدة بصيغها المختلفة */

describe('التعرف على رؤوس الأعمدة بصيغها المختلفة', () => {
  const variations = [
    { header: 'فئة العميل', shouldDetectCategory: true },
    { header: 'الفئة', shouldDetectCategory: true },
    { header: 'فئات العملاء', shouldDetectCategory: true },
    { header: 'التصنيف', shouldDetectCategory: true },
    { header: 'المسؤول', shouldDetectCollector: true },
    { header: 'المسئول', shouldDetectCollector: true },
    { header: 'مسؤول التحصيل', shouldDetectCollector: true },
    { header: 'مسئول متابعة التحصيل', shouldDetectCollector: true },
    { header: 'المحصل', shouldDetectCollector: true },
    { header: 'مسؤول المتابعة', shouldDetectCollector: true },
  ];

  for (const { header, shouldDetectCategory, shouldDetectCollector } of variations) {
    if (shouldDetectCategory) {
      it(`يكتشف عمود الفئة بالاسم «${header}»`, () => {
        const sheet = [
          ['رقم العميل', 'اسم العميل', header],
          ['1', 'عميل تجريبي', 'فئة اختبار'],
        ];
        const { rows } = parseProfilesSheet(sheet);
        expect(rows).toHaveLength(1);
        expect(rows[0].category_name).toBe('فئة اختبار');
      });
    }
    if (shouldDetectCollector) {
      it(`يكتشف عمود المسؤول بالاسم «${header}»`, () => {
        const sheet = [
          ['رقم العميل', 'اسم العميل', header],
          ['1', 'عميل تجريبي', 'محمد أحمد'],
        ];
        const { rows } = parseProfilesSheet(sheet);
        expect(rows).toHaveLength(1);
        expect(rows[0].assigned_name).toBe('محمد أحمد');
      });
    }
  }
});
