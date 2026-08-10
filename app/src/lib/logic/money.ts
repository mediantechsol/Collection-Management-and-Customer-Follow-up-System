/**
 * حسابات المبالغ والعملات — منقولة عن الدوال الصافية في النموذج الأولي
 * (legacy/frontend/collection-system.html:265-267).
 *
 * النظام يتعامل مع ثلاث عملات (يمني/دولار/سعودي) كما في ملف "أرصدة العملاء"،
 * والإجمالي يُعرض دائماً بالريال اليمني.
 */

export const CURRENCIES = ['YER', 'USD', 'SAR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<Currency, string> = {
  YER: 'ريال يمني',
  USD: 'دولار أمريكي',
  SAR: 'ريال سعودي',
};

export interface ExchangeRates {
  usd: number;
  sar: number;
}

/** إجمالي المستحق بالريال = دولار×سعره + سعودي×سعره + يمني. */
export function calcTotalDueYER(
  usd: number | null | undefined,
  sar: number | null | undefined,
  yer: number | null | undefined,
  rateUsd: number | null | undefined,
  rateSar: number | null | undefined,
): number {
  return (
    (Number(usd) || 0) * (Number(rateUsd) || 0) +
    (Number(sar) || 0) * (Number(rateSar) || 0) +
    (Number(yer) || 0)
  );
}

/** تحويل مبلغ بعملة واحدة إلى الريال اليمني. */
export function toYER(amount: number, currency: Currency, rates: ExchangeRates): number {
  const rate = currency === 'USD' ? rates.usd : currency === 'SAR' ? rates.sar : 1;
  return (Number(amount) || 0) * (Number(rate) || 0);
}

/** سعر صرف العملة مقابل الريال اليمني (اليمني = 1). */
export function rateFor(currency: Currency, rates: ExchangeRates): number {
  return currency === 'USD' ? rates.usd : currency === 'SAR' ? rates.sar : 1;
}

/** مبلغ الحافز = المبلغ المحصَّل × نسبة الحافز ÷ 100. */
export function calcIncentiveAmount(amount: number | null | undefined, rate: number | null | undefined): number {
  return round2(((Number(amount) || 0) * (Number(rate) || 0)) / 100);
}

/**
 * المبلغ المتبقي على العميل = المستحق − الواصل − الموصل.
 * (يقابل عمود "المبلغ المتبقي عليه" في شيت العميل الحقيقي.)
 */
export function calcRemainingAmount(
  due: number | null | undefined,
  received: number | null | undefined,
  delivered: number | null | undefined,
): number {
  return (Number(due) || 0) - (Number(received) || 0) - (Number(delivered) || 0);
}

/**
 * نسبة المديونية = مستحق هذا العميل ÷ إجمالي المديونية.
 * موجودة في شيت العميل (عمود "نسبة المديونيه") ولم تكن في النموذج الأولي.
 */
export function calcDebtRatio(customerDue: number, totalDue: number): number {
  if (!totalDue) return 0;
  return customerDue / totalDue;
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** تنسيق رقمي موحّد بخانتين عشريتين وفواصل آلاف. */
export function fmt(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** تنسيق مختصر للأرقام الكبيرة في البطاقات (1.2م / 340ألف). */
export function fmtCompact(n: number | null | undefined): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}م`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}ألف`;
  return fmt(v);
}

export function fmtPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}
