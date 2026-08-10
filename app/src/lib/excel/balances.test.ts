import { describe, it, expect } from 'vitest';
import { detectCurrency, findSectionHeaderRows, parseBalancesSheet } from './balances';
import { cellNumber, normalizeArabic, normalizeCustomerNumber } from './normalize';

/**
 * القوالب أدناه تحاكي حرفياً ما في الملف الحقيقي
 * (المصادر/ارصدة العملاء ايمن.xlsx): صفوف فارغة في الأعلى، صف عنوان بالتطويل،
 * رأس عمود بمسافة زائدة، وعمود ملاحظات يحمل اسم العملة في كل صف.
 */
function realisticSheet(): unknown[][] {
  const blank = () => [null, null, null, null, null];
  return [
    ...Array.from({ length: 9 }, blank),
    [null, 'ارصـــــــــــدة العــــمـــــــلاء بالـــريــــــــال اليــمـنــي', null, null, null],
    ['رقم العميل ', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'],
    [2, 'مكتب الدكتور خالد جلال', 38630, null, 'ريال يمني'],
    ['00003', 'محل الأمين', 5000, 1000, 'ريال يمني'],
    blank(),
    [null, 'ارصـــــــــــدة العــــمـــــــلاء بالـــــدولار الامـــــــريكـــــي', null, null, null],
    ['رقم العميل ', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'],
    [1, 'محمد صادق صالح الغفري', 4752.787, null, 'دولار امريكي'],
    [null, 'ارصـــــــــــدة العــــمـــــــلاء بالــــــــريـال الســــــعــــــودي', null, null, null],
    ['رقم العميل ', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'],
    [503, 'فهد عبده محمد حسين الحريشي', 0, 3000, 'ريال سعودي'],
  ];
}

describe('normalizeArabic', () => {
  it('يزيل التطويل ويوحّد الألف والياء والهاء', () => {
    expect(normalizeArabic('الامـــــــريكـــــي')).toBe('الامريكي');
    expect(normalizeArabic('أمريكي')).toBe('امريكي');
    expect(normalizeArabic('ملاحظة')).toBe('ملاحظه');
  });

  it('يزيل المسافة الزائدة في "رقم العميل "', () => {
    expect(normalizeArabic('رقم العميل ')).toBe('رقم العميل');
  });
});

describe('normalizeCustomerNumber', () => {
  it('يوحّد الصيغ المختلفة بين الشيتين', () => {
    // شيت "بيانات العملاء" يكتبه '00001' وشيت "متابعة العملاء" يكتبه 1
    expect(normalizeCustomerNumber('00001')).toBe('1');
    expect(normalizeCustomerNumber(1)).toBe('1');
    expect(normalizeCustomerNumber(' 23 ')).toBe('23');
    expect(normalizeCustomerNumber(1.0)).toBe('1');
    expect(normalizeCustomerNumber('0')).toBe('0');
  });

  it('يُرجع null للقيم الفارغة', () => {
    expect(normalizeCustomerNumber(null)).toBeNull();
    expect(normalizeCustomerNumber('')).toBeNull();
    expect(normalizeCustomerNumber('   ')).toBeNull();
  });
});

describe('cellNumber', () => {
  it('يقرأ الأرقام بصيغها المختلفة في الملفات اليدوية', () => {
    expect(cellNumber(38630)).toBe(38630);
    expect(cellNumber('38,630')).toBe(38630);
    expect(cellNumber('(5000)')).toBe(-5000);
    expect(cellNumber(null)).toBe(0);
    expect(cellNumber('')).toBe(0);
    expect(cellNumber('غير رقم')).toBe(0);
  });
});

describe('detectCurrency', () => {
  it('يتعرّف على العملة من نص الملاحظات', () => {
    expect(detectCurrency('ريال يمني')).toBe('YER');
    expect(detectCurrency('دولار امريكي')).toBe('USD');
    expect(detectCurrency('دولار أمريكي')).toBe('USD');
    expect(detectCurrency('ريال سعودي')).toBe('SAR');
  });

  it('يتعرّف عليها من عنوان القسم رغم التطويل', () => {
    expect(detectCurrency('ارصـــدة العــملاء بالـــدولار الامـــريكــي')).toBe('USD');
    expect(detectCurrency('ارصـــدة العــملاء بالــريـال الســعـودي')).toBe('SAR');
  });

  it('يُرجع null لنص لا يدل على عملة', () => {
    expect(detectCurrency('ملاحظة عامة')).toBeNull();
    expect(detectCurrency(null)).toBeNull();
  });
});

describe('findSectionHeaderRows', () => {
  it('يجد الأقسام الثلاثة رغم المسافة الزائدة في الرأس', () => {
    const rows = findSectionHeaderRows(realisticSheet());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe(10); // الصف 11 في Excel
  });
});

describe('parseBalancesSheet', () => {
  it('يقرأ الأقسام الثلاثة بعملاتها الصحيحة', () => {
    const r = parseBalancesSheet(realisticSheet());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(4);
    expect(r.counts).toEqual({ YER: 2, USD: 1, SAR: 1 });
  });

  it('يطبّع أرقام العملاء المصفَّرة', () => {
    const r = parseBalancesSheet(realisticSheet());
    expect(r.rows.map((x) => x.customer_number)).toEqual(['2', '3', '1', '503']);
  });

  it('يحدّد العملة من عمود الملاحظات لا من ترتيب الأقسام', () => {
    expect(r_sourceOf(parseBalancesSheet(realisticSheet()))).toEqual([
      'ملاحظات',
      'ملاحظات',
      'ملاحظات',
    ]);
  });

  it('يتجاوز صفوف عناوين الأقسام بصمت بلا تحذيرات وهمية', () => {
    const r = parseBalancesSheet(realisticSheet());
    expect(r.warnings.filter((w) => w.includes('تم تجاوزه'))).toEqual([]);
  });

  it('ينجح حتى لو انقلب ترتيب الأقسام، اعتماداً على الملاحظات', () => {
    const rows: unknown[][] = [
      ['رقم العميل ', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'],
      [1, 'عميل بالدولار', 100, 0, 'دولار امريكي'],
      ['رقم العميل ', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'],
      [2, 'عميل باليمني', 5000, 0, 'ريال يمني'],
      ['رقم العميل ', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'],
      [3, 'عميل بالسعودي', 300, 0, 'ريال سعودي'],
    ];
    const r = parseBalancesSheet(rows);
    expect(r.ok).toBe(true);
    expect(r.rows.map((x) => x.currency)).toEqual(['USD', 'YER', 'SAR']);
  });

  it('ينبّه على صف فيه مبالغ بدون هوية عميل بدل تجاهله بصمت', () => {
    const rows: unknown[][] = [
      ['رقم العميل ', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'],
      [null, null, 9999, 0, 'ريال يمني'],
      [1, 'عميل سليم', 100, 0, 'ريال يمني'],
    ];
    const r = parseBalancesSheet(rows);
    expect(r.rows).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('بدون رقم أو اسم عميل'))).toBe(true);
  });

  it('يفشل بوضوح عند غياب عمود مطلوب بدل استيراد بيانات ناقصة', () => {
    const rows: unknown[][] = [
      ['رقم العميل', 'اسم العميل', 'مدين', 'ملاحظات'], // "دائن" مفقود
      [1, 'عميل', 100, 'ريال يمني'],
    ];
    const r = parseBalancesSheet(rows);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('دائن');
  });

  it('يفشل بوضوح عند عدم وجود رؤوس أعمدة إطلاقاً', () => {
    const r = parseBalancesSheet([[null, null], ['نص عشوائي']]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('لم يُعثر على أي صف رؤوس');
  });

  it('ينبّه على تكرار العميل بنفس العملة داخل الملف', () => {
    const rows: unknown[][] = [
      ['رقم العميل', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'],
      [7, 'عميل مكرر', 100, 0, 'ريال يمني'],
      [7, 'عميل مكرر', 200, 0, 'ريال يمني'],
    ];
    const r = parseBalancesSheet(rows);
    expect(r.warnings.some((w) => w.includes('مكرّر'))).toBe(true);
  });
});

function r_sourceOf(r: ReturnType<typeof parseBalancesSheet>) {
  return r.sections.map((s) => s.source);
}
