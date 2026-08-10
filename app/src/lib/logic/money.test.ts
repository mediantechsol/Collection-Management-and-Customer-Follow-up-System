import { describe, it, expect } from 'vitest';
import {
  calcDebtRatio,
  calcIncentiveAmount,
  calcRemainingAmount,
  calcTotalDueYER,
  fmt,
  rateFor,
  toYER,
} from './money';

const RATES = { usd: 530, sar: 141 };

describe('calcTotalDueYER', () => {
  it('يحوّل العملات الثلاث إلى الريال اليمني', () => {
    expect(calcTotalDueYER(100, 200, 5000, 530, 141)).toBe(100 * 530 + 200 * 141 + 5000);
  });

  it('يعامل القيم الفارغة كأصفار', () => {
    expect(calcTotalDueYER(null, undefined, 5000, 530, 141)).toBe(5000);
    expect(calcTotalDueYER(0, 0, 0, 530, 141)).toBe(0);
  });

  it('يتعامل مع الأرصدة السالبة (العميل دافع زيادة)', () => {
    expect(calcTotalDueYER(-10, 0, 0, 530, 141)).toBe(-5300);
  });

  it('يطابق قيمة حقيقية من شيت العميل', () => {
    // من صف "محمد صادق صالح الغفري": 4752.787 دولار بسعر 535 = 2542741.045
    expect(calcTotalDueYER(4752.787, 0, 0, 535, 140)).toBeCloseTo(2542741.045, 3);
  });
});

describe('toYER / rateFor', () => {
  it('اليمني لا يُحوَّل', () => {
    expect(rateFor('YER', RATES)).toBe(1);
    expect(toYER(5000, 'YER', RATES)).toBe(5000);
  });

  it('الدولار والسعودي يُحوَّلان بسعرهما', () => {
    expect(toYER(10, 'USD', RATES)).toBe(5300);
    expect(toYER(100, 'SAR', RATES)).toBe(14100);
  });
});

describe('calcIncentiveAmount', () => {
  it('يحسب النسبة المئوية من المبلغ المحصَّل', () => {
    expect(calcIncentiveAmount(100000, 3)).toBe(3000);
    expect(calcIncentiveAmount(100000, 2.5)).toBe(2500);
  });

  it('نسبة صفرية أو مبلغ فارغ = صفر', () => {
    expect(calcIncentiveAmount(100000, 0)).toBe(0);
    expect(calcIncentiveAmount(null, 3)).toBe(0);
  });

  it('يقرّب لخانتين عشريتين', () => {
    expect(calcIncentiveAmount(1000.555, 3)).toBe(30.02);
  });
});

describe('calcRemainingAmount', () => {
  it('المستحق ناقص الواصل ناقص الموصل', () => {
    expect(calcRemainingAmount(100000, 30000, 20000)).toBe(50000);
    expect(calcRemainingAmount(100000, 0, 0)).toBe(100000);
  });

  it('يصير سالباً عند السداد الزائد — كما في صف "فهد" بشيت العميل', () => {
    expect(calcRemainingAmount(0, 420000, 0)).toBe(-420000);
  });
});

describe('calcDebtRatio', () => {
  it('نسبة العميل من إجمالي المديونية', () => {
    expect(calcDebtRatio(25, 100)).toBe(0.25);
  });

  it('لا يقسم على صفر', () => {
    expect(calcDebtRatio(25, 0)).toBe(0);
  });
});

describe('fmt', () => {
  it('يعرض خانتين عشريتين وفواصل آلاف', () => {
    expect(fmt(1234567.891)).toBe('1,234,567.89');
    expect(fmt(0)).toBe('0.00');
    expect(fmt(null)).toBe('0.00');
  });
});
