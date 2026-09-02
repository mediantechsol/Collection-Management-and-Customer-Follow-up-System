/**
 * محلّل ملف "أرصدة العملاء" — إعادة بناء لـ parseBalancesSheet في النموذج
 * الأولي (legacy/frontend/collection-system.html:305) بعد فحص الملف الحقيقي.
 *
 * ما اتضح من الملف الفعلي (المصادر/ارصدة العملاء ايمن.xlsx):
 *   • ثلاثة أقسام، رؤوس أعمدتها في الصفوف 11 و652 و1042 — وليس 1/651/1041
 *     كما كان مكتوباً في توثيق النموذج الأولي (تلك أرقام صفوف العناوين).
 *   • رأس العمود الأول مكتوب "رقم العميل " بمسافة زائدة.
 *   • فوق كل رأس صف عنوان يحمل اسم العملة مكتوباً بالتطويل:
 *     "ارصـــدة العــملاء بالـــدولار الامـــريكــي".
 *   • عمود "ملاحظات" يحمل اسم العملة صراحة في كل صف: "ريال يمني" / "دولار
 *     امريكي" / "ريال سعودي".
 *
 * لذلك تُحدَّد العملة بثلاثة مصادر مرتَّبة بالثقة، لا بترتيب الأقسام وحده:
 *   1) عمود الملاحظات في الصف نفسه (الأقوى — يصمد لو أُعيد ترتيب الأقسام).
 *   2) عنوان القسم فوق صف الرؤوس.
 *   3) ترتيب الأقسام (يمني ثم دولار ثم سعودي) — احتياط أخير.
 */

import type { Currency } from '@/lib/logic/money';
import {
  cellNumber,
  cellText,
  isEmptyRow,
  normalizeArabic,
  normalizeCustomerNumber,
} from './normalize';

export const EXPECTED_COLUMNS = ['رقم العميل', 'اسم العميل', 'مدين', 'دائن', 'ملاحظات'] as const;

/** الترتيب الرسمي للأقسام في ملف العميل — يُستخدم كاحتياط أخير فقط. */
const SECTION_ORDER: Currency[] = ['YER', 'USD', 'SAR'];

/** كلمات دالة على العملة، مطبَّعة (بلا تطويل وبألف موحّدة). */
const CURRENCY_HINTS: Array<{ currency: Currency; patterns: string[] }> = [
  { currency: 'USD', patterns: ['دولار'] },
  { currency: 'SAR', patterns: ['سعودي', 'ريال سعودي'] },
  { currency: 'YER', patterns: ['يمني', 'ريال يمني'] },
];

export function detectCurrency(text: unknown): Currency | null {
  const n = normalizeArabic(text);
  if (!n) return null;
  for (const { currency, patterns } of CURRENCY_HINTS) {
    if (patterns.some((p) => n.includes(normalizeArabic(p)))) return currency;
  }
  return null;
}

export interface BalanceRow {
  customer_number: string;
  customer_name: string;
  currency: Currency;
  debit: number;
  credit: number;
  /** رقم الصف في الملف (1-based) — لعرضه في رسائل التحذير. */
  source_row: number;
}

export interface ParseResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  rows: BalanceRow[];
  counts: Record<Currency, number>;
  /** كيف حُدِّدت عملة كل قسم — يُعرض في المعاينة ليطمئن المستخدم. */
  sections: Array<{ headerRow: number; currency: Currency; source: 'ملاحظات' | 'عنوان القسم' | 'ترتيب الأقسام' }>;
}

type Grid = unknown[][];

/** يجد صفوف رؤوس الأعمدة: صف يبدأ بـ "رقم العميل" ثم "اسم العميل". */
export function findSectionHeaderRows(rows: Grid): number[] {
  const target0 = normalizeArabic('رقم العميل');
  const target1 = normalizeArabic('اسم العميل');
  const out: number[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const c0 = normalizeArabic(row[0]);
    const c1 = normalizeArabic(row[1]);
    // "رقم العمبل" الوارد فعلياً في شيت بيانات العملاء يُقبل أيضاً
    if ((c0 === target0 || c0 === normalizeArabic('رقم العمبل')) && c1 === target1) {
      out.push(r);
    }
  }
  return out;
}

/** يبحث عن اسم العملة في صفوف العناوين فوق رأس القسم (حتى 3 صفوف). */
function currencyFromSectionTitle(rows: Grid, headerIdx: number): Currency | null {
  for (let r = headerIdx - 1; r >= Math.max(0, headerIdx - 3); r--) {
    const row = rows[r] ?? [];
    for (const cell of row) {
      const c = detectCurrency(cell);
      if (c) return c;
    }
  }
  return null;
}

export function parseBalancesSheet(rows: Grid): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed: BalanceRow[] = [];
  const counts: Record<Currency, number> = { YER: 0, USD: 0, SAR: 0 };
  const sections: ParseResult['sections'] = [];

  const headerRows = findSectionHeaderRows(rows);

  if (headerRows.length === 0) {
    errors.push(
      'لم يُعثر على أي صف رؤوس أعمدة. يجب أن يبدأ كل قسم بصف يحوي: ' +
        EXPECTED_COLUMNS.join(' | '),
    );
    return { ok: false, errors, warnings, rows: parsed, counts, sections };
  }

  if (headerRows.length !== SECTION_ORDER.length) {
    warnings.push(
      `عدد الأقسام في الملف ${headerRows.length} بدل ${SECTION_ORDER.length} المتوقعة — ` +
        'سيُستكمل الاستيراد بتحديد العملة من عمود "ملاحظات" وعناوين الأقسام.',
    );
  }

  headerRows.forEach((headerIdx, i) => {
    const headerRow = (rows[headerIdx] ?? []).map((h) => normalizeArabic(h));

    const idx = {
      number: headerRow.findIndex((h) => h === normalizeArabic('رقم العميل') || h === normalizeArabic('رقم العمبل')),
      name: headerRow.indexOf(normalizeArabic('اسم العميل')),
      debit: headerRow.indexOf(normalizeArabic('مدين')),
      credit: headerRow.indexOf(normalizeArabic('دائن')),
      notes: headerRow.indexOf(normalizeArabic('ملاحظات')),
    };

    const missing = (Object.keys(idx) as Array<keyof typeof idx>).filter((k) => idx[k] === -1);
    if (missing.length) {
      const labels: Record<string, string> = {
        number: 'رقم العميل', name: 'اسم العميل', debit: 'مدين', credit: 'دائن', notes: 'ملاحظات',
      };
      errors.push(
        `القسم الذي يبدأ بالصف ${headerIdx + 1}: أعمدة مفقودة — ` +
          missing.map((m) => labels[m]).join('، '),
      );
      return;
    }

    const endRow = i + 1 < headerRows.length ? headerRows[i + 1] : rows.length;

    // 1) فحص عنوان القسم
    const titleCurrency = currencyFromSectionTitle(rows, headerIdx);

    // 2) فحص مسبق لعمود الملاحظات داخل صفوف القسم لمعرفة عملة القسم المؤكدة
    let notesCurrency: Currency | null = null;
    for (let r = headerIdx + 1; r < endRow; r++) {
      const c = detectCurrency(rows[r]?.[idx.notes]);
      if (c) {
        notesCurrency = c;
        break;
      }
    }

    const fallbackCurrency = SECTION_ORDER[i] ?? 'YER';
    let effectiveCurrency = notesCurrency ?? titleCurrency ?? fallbackCurrency;
    let sectionSource: ParseResult['sections'][number]['source'] =
      notesCurrency ? 'ملاحظات' : titleCurrency ? 'عنوان القسم' : 'ترتيب الأقسام';

    if (notesCurrency && titleCurrency && notesCurrency !== titleCurrency) {
      warnings.push(
        `القسم الذي يبدأ بالصف ${headerIdx + 1}: عنوان القسم يشير إلى عملة ` +
          `مختلفة عن عمود الملاحظات — اعتُمد عمود الملاحظات.`,
      );
    }

    for (let r = headerIdx + 1; r < endRow; r++) {
      const row = rows[r];
      if (isEmptyRow(row)) continue;

      const customer_number = normalizeCustomerNumber(row![idx.number]);
      const customer_name = cellText(row![idx.name]);
      const debit = cellNumber(row![idx.debit]);
      const credit = cellNumber(row![idx.credit]);

      if (!customer_number || !customer_name) {
        // صف عنوان قسم أو فاصل: لا رقم ولا اسم ولا مبالغ — يُتجاوز بصمت
        if (!debit && !credit) continue;
        warnings.push(
          `صف ${r + 1}: يحوي مبالغ بدون رقم أو اسم عميل — تم تجاوزه`,
        );
        continue;
      }

      // العملة من عمود الملاحظات في هذا الصف تحديداً إن وُجدت، وإلا عملة القسم المؤكدة
      const rowCurrency = detectCurrency(row![idx.notes]);
      const currency = rowCurrency ?? effectiveCurrency;

      parsed.push({ customer_number, customer_name, currency, debit, credit, source_row: r + 1 });
      counts[currency]++;
    }

    sections.push({ headerRow: headerIdx + 1, currency: effectiveCurrency, source: sectionSource });
  });

  if (parsed.length === 0 && errors.length === 0) {
    errors.push('لم يُعثر على أي صف بيانات صالح في الملف');
  }

  // تكرار نفس (العميل + العملة) داخل الملف: يُجمَع في قاعدة البيانات، لكن
  // ننبّه المستخدم لأنه غالباً خطأ إدخال في الملف الأصلي.
  const seen = new Map<string, number>();
  for (const row of parsed) {
    const key = `${row.customer_number}|${row.currency}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  if (dupes.length) {
    warnings.push(
      `${dupes.length} عميل مكرّر بنفس العملة داخل الملف — ستُجمع مبالغهم عند الاستيراد ` +
        `(مثال: رقم ${dupes[0][0].split('|')[0]})`,
    );
  }

  return { ok: errors.length === 0, errors, warnings, rows: parsed, counts, sections };
}
