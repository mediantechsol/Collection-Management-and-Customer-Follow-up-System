/**
 * محلّل ملف "متابعه العملاء.xlsm" — مستورد لم يكن موجوداً في النموذج الأولي
 * إطلاقاً، مع أنه الملف الذي يحمل بيانات العملاء الحقيقية وتواريخ استحقاقهم
 * ومسؤوليهم. بدونه لا يمكن ترحيل عمل العميل الحالي إلى النظام.
 *
 * بنية الملف الحقيقي كما فُحصت:
 *   شيت "بيانات العملاء": الرؤوس في الصف 1 —
 *     ["رقم العمبل" (خطأ إملائي في الملف), "اسم العميل", "الجوال 1",
 *      "الجوال 2", "الضامن/ الضمانة", "الحالة"]
 *   شيت "متابعة العملاء": الرؤوس في الصف 13، وفوقها في الصف 12 رؤوس مجموعات
 *     مدمجة. الأعمدة المهمة:
 *       تاريخ الاستحقاق | مسئول متابعة التحصيل | رقم العميل | اسم الزبون |
 *       مهلة إضافية بعد التواصل (يوم) 1، 2، 3  →  grace_1/2/3
 *       ملاحضة | ملاحظة2  →  note_1 / note_2
 *
 * يُدمج الشيتان على رقم العميل المطبَّع (شيت البيانات يكتبه "00001" وشيت
 * المتابعة يكتبه 1).
 */

import {
  cellDate,
  cellNumber,
  cellPhone,
  cellText,
  isEmptyRow,
  normalizeArabic,
  normalizeCustomerNumber,
} from './normalize';

export interface CustomerImportRow {
  customer_number: string;
  customer_name: string;
  mobile_1: string | null;
  mobile_2: string | null;
  guarantor: string | null;
  status_customer: string | null;
  assigned_name: string | null;
  category_name: string | null;
  due_date: string | null;
  grace_1: number;
  grace_2: number;
  grace_3: number;
  note_1: string | null;
  note_2: string | null;
}

export interface CustomersParseResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  rows: CustomerImportRow[];
  /** أسماء المسؤولين كما وردت في الملف — تُعرض للمطابقة مع المستخدمين. */
  assignees: string[];
  /** أسماء الفئات كما وردت في الملف — تُعرض للمطابقة مع الفئات المسجّلة. */
  categories: string[];
  stats: {
    fromProfiles: number;
    fromFollowups: number;
    merged: number;
    withDueDate: number;
    withCategory: number;
    withCollector: number;
  };
}

type Grid = unknown[][];

/** يبحث عن عمود برأس يحقق الشرط، ويُرجع -1 إن لم يوجد. */
function findCol(header: string[], predicate: (h: string) => boolean): number {
  return header.findIndex((h) => h !== '' && predicate(h));
}

const eq = (target: string) => (h: string) => h === normalizeArabic(target);
const has = (part: string) => (h: string) => h.includes(normalizeArabic(part));

/* ---------------------------------------------------------------- شيت بيانات العملاء */

/** يتعرف على عمود الفئة بأي صيغة متوقعة. */
const isCategory = (h: string) =>
  has('فئه العميل')(h) || eq('الفئه')(h) || has('فئات العملاء')(h) || eq('التصنيف')(h);

/** يتعرف على عمود مسؤول التحصيل بأي صيغة متوقعة. */
const isCollector = (h: string) =>
  eq('المسئول')(h) ||
  eq('المسؤول')(h) ||
  has('مسؤول المتابعه')(h) ||
  has('مسئول المتابعه')(h) ||
  has('مسؤول التحصيل')(h) ||
  has('مسئول التحصيل')(h) ||
  has('مسئول متابعه التحصيل')(h) ||
  has('مسؤول متابعه التحصيل')(h) ||
  eq('المحصل')(h);

interface ProfileRow {
  customer_number: string;
  customer_name: string;
  mobile_1: string | null;
  mobile_2: string | null;
  guarantor: string | null;
  status_customer: string | null;
  assigned_name: string | null;
  category_name: string | null;
}

export function parseProfilesSheet(rows: Grid): { rows: ProfileRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: ProfileRow[] = [];

  // رأس الجدول: صف يحوي "اسم العميل" وعموداً يبدأ بـ "رقم" (الملف مكتوب فيه
  // "رقم العمبل" بخطأ إملائي، فلا يمكن المطابقة الحرفية)
  let headerIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const h = (rows[r] ?? []).map(normalizeArabic);
    if (h.some(has('اسم العميل')) && h.some((c) => c.startsWith('رقم'))) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) {
    warnings.push('شيت "بيانات العملاء": لم يُعثر على صف الرؤوس — تم تجاهل الشيت');
    return { rows: out, warnings };
  }

  const header = (rows[headerIdx] ?? []).map(normalizeArabic);
  const idx = {
    number: findCol(header, (h) => h.startsWith('رقم')),
    name: findCol(header, (h) => has('اسم العميل')(h) || has('اسم الزبون')(h) || eq('العميل')(h) || eq('الاسم')(h) || eq('الزبون')(h)),
    mobile1: findCol(header, (h) => has('جوال 1')(h) || h === normalizeArabic('الجوال')),
    mobile2: findCol(header, has('جوال 2')),
    guarantor: findCol(header, has('ضامن')),
    status: findCol(header, eq('الحالة')),
    category: findCol(header, isCategory),
    collector: findCol(header, isCollector),
  };

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isEmptyRow(row)) continue;

    const customer_number = normalizeCustomerNumber(row![idx.number]);
    if (!customer_number) continue;
    const nameVal = idx.name >= 0 ? cellText(row![idx.name]) : null;
    const customer_name = nameVal && nameVal !== '0' ? nameVal : `عميل ${customer_number}`;

    out.push({
      customer_number,
      customer_name,
      mobile_1: idx.mobile1 >= 0 ? cellPhone(row![idx.mobile1]) : null,
      mobile_2: idx.mobile2 >= 0 ? cellPhone(row![idx.mobile2]) : null,
      guarantor: idx.guarantor >= 0 ? cellText(row![idx.guarantor]) : null,
      status_customer: idx.status >= 0 ? cellText(row![idx.status]) : null,
      assigned_name: idx.collector >= 0 ? cellText(row![idx.collector]) : null,
      category_name: idx.category >= 0 ? cellText(row![idx.category]) : null,
    });
  }

  return { rows: out, warnings };
}

/* ---------------------------------------------------------------- شيت متابعة العملاء */

interface FollowupSheetRow {
  customer_number: string;
  customer_name: string | null;
  assigned_name: string | null;
  category_name: string | null;
  due_date: string | null;
  grace_1: number;
  grace_2: number;
  grace_3: number;
  note_1: string | null;
  note_2: string | null;
}

/**
 * المهلة أيام صحيحة موجبة.
 * ⚠️ الأعمدة في قاعدة البيانات integer، والـ RPC تحوّل بـ (…)::int — فخلية
 * واحدة فيها 2.5 كانت تُفشل ملف الاستيراد كاملاً برسالة Postgres مبهمة.
 * التقريب هنا يجعل الملف الحقيقي يمر، والقيم السالبة تُصفَّر لأنها لا تعني شيئاً.
 */
function graceDays(value: unknown): number {
  const n = Math.round(cellNumber(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseFollowupSheet(rows: Grid): { rows: FollowupSheetRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: FollowupSheetRow[] = [];

  // صف الرؤوس: يحوي "تاريخ الاستحقاق" و"رقم العميل" معاً
  let headerIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const h = (rows[r] ?? []).map(normalizeArabic);
    if (h.some(eq('تاريخ الاستحقاق')) && h.some(eq('رقم العميل'))) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) {
    warnings.push('شيت "متابعة العملاء": لم يُعثر على صف الرؤوس — تم تجاهل الشيت');
    return { rows: out, warnings };
  }

  const header = (rows[headerIdx] ?? []).map(normalizeArabic);
  const groupHeader = (rows[headerIdx - 1] ?? []).map(normalizeArabic);

  const idx = {
    number: findCol(header, (h) => eq('رقم العميل')(h) || h.startsWith('رقم')),
    // الشيت يسميه "اسم الزبون" أو "اسم العميل" أو "العميل"
    name: findCol(header, (h) => has('اسم الزبون')(h) || has('اسم العميل')(h) || eq('العميل')(h) || eq('الاسم')(h) || eq('الزبون')(h)),
    // "مسئول متابعة التحصيل" — الهمزة تُكتب بأشكال مختلفة، فنطابق بجميع الصيغ
    assigned: findCol(header, (h) => isCollector(h) || has('التحصيل')(h)),
    dueDate: findCol(header, (h) => has('الاستحقاق')(h)),
    category: findCol(header, isCategory),
  };

  // أعمدة المهل الثلاث: تحت رأس المجموعة "مهلة إضافية بعد التواصل (يوم)"
  // ورؤوسها الأرقام 1 و2 و3.
  let graceStart = findCol(groupHeader, has('مهله اضافيه'));
  if (graceStart === -1) {
    // احتياط: ثلاثة أعمدة متتالية رؤوسها 1، 2، 3
    for (let c = 0; c < header.length - 2; c++) {
      if (header[c] === '1' && header[c + 1] === '2' && header[c + 2] === '3') {
        graceStart = c;
        break;
      }
    }
  }
  if (graceStart === -1) {
    warnings.push('لم يُعثر على أعمدة "مهلة إضافية بعد التواصل" — ستُعتبر المهل أصفاراً');
  }

  // أعمدة الملاحظات: "ملاحضة"/"ملاجظة 1" ثم "ملاحظة2" (أخطاء إملائية في الملف)
  const noteCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.startsWith('ملاح') || h.startsWith('ملاج'))
    .map(({ i }) => i);

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isEmptyRow(row)) continue;

    const customer_number = normalizeCustomerNumber(row![idx.number]);
    if (!customer_number) continue;

    const name = idx.name >= 0 ? cellText(row![idx.name]) : null;
    // الملف الحقيقي فيه صفوف بأرقام عملاء واسم "0" — صفوف قالبية فارغة
    const customer_name = name && name !== '0' ? name : null;

    out.push({
      customer_number,
      customer_name,
      assigned_name: idx.assigned >= 0 ? cellText(row![idx.assigned]) : null,
      category_name: idx.category >= 0 ? cellText(row![idx.category]) : null,
      due_date: idx.dueDate >= 0 ? cellDate(row![idx.dueDate]) : null,
      grace_1: graceStart >= 0 ? graceDays(row![graceStart]) : 0,
      grace_2: graceStart >= 0 ? graceDays(row![graceStart + 1]) : 0,
      grace_3: graceStart >= 0 ? graceDays(row![graceStart + 2]) : 0,
      note_1: noteCols[0] !== undefined ? cellText(row![noteCols[0]]) : null,
      note_2: noteCols[1] !== undefined ? cellText(row![noteCols[1]]) : null,
    });
  }

  return { rows: out, warnings };
}

/* ---------------------------------------------------------------- الدمج */

export function parseCustomersWorkbook(input: {
  profiles?: Grid;
  followups?: Grid;
}): CustomersParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const profileResult = input.profiles ? parseProfilesSheet(input.profiles) : { rows: [], warnings: [] };
  const followResult = input.followups ? parseFollowupSheet(input.followups) : { rows: [], warnings: [] };
  warnings.push(...profileResult.warnings, ...followResult.warnings);

  const merged = new Map<string, CustomerImportRow>();

  for (const p of profileResult.rows) {
    merged.set(p.customer_number, {
      ...p,
      assigned_name: p.assigned_name ?? null,
      category_name: p.category_name ?? null,
      due_date: null,
      grace_1: 0,
      grace_2: 0,
      grace_3: 0,
      note_1: null,
      note_2: null,
    });
  }

  let mergedCount = 0;
  for (const f of followResult.rows) {
    const existing = merged.get(f.customer_number);
    if (existing) {
      mergedCount++;
      existing.assigned_name = f.assigned_name ?? existing.assigned_name;
      existing.category_name = f.category_name ?? existing.category_name;
      existing.due_date = f.due_date ?? existing.due_date;
      existing.grace_1 = f.grace_1;
      existing.grace_2 = f.grace_2;
      existing.grace_3 = f.grace_3;
      existing.note_1 = f.note_1 ?? existing.note_1;
      existing.note_2 = f.note_2 ?? existing.note_2;
      continue;
    }
    // عميل موجود في شيت المتابعة فقط:
    // إذا كان له اسم، أو كان له بيانات متابعة فعلية (تاريخ استحقاق، مسؤول، فئة، ملاحظة)، يُستورد ولا يُسقط
    const hasData = !!(f.customer_name || f.due_date || f.assigned_name || f.category_name || f.note_1 || f.note_2);
    if (!hasData) continue;

    merged.set(f.customer_number, {
      customer_number: f.customer_number,
      customer_name: f.customer_name ?? `عميل ${f.customer_number}`,
      mobile_1: null,
      mobile_2: null,
      guarantor: null,
      status_customer: null,
      assigned_name: f.assigned_name,
      category_name: f.category_name,
      due_date: f.due_date,
      grace_1: f.grace_1,
      grace_2: f.grace_2,
      grace_3: f.grace_3,
      note_1: f.note_1,
      note_2: f.note_2,
    });
  }

  const rows = [...merged.values()];
  if (rows.length === 0) {
    errors.push(
      'لم يُعثر على أي عميل صالح. تأكد أن الملف يحوي شيت "بيانات العملاء" أو "متابعة العملاء".',
    );
  }

  const assignees = [...new Set(rows.map((r) => r.assigned_name).filter((a): a is string => !!a))].sort();
  const categories = [...new Set(rows.map((r) => r.category_name).filter((a): a is string => !!a))].sort();
  const withDueDate = rows.filter((r) => r.due_date).length;
  const withCategory = rows.filter((r) => r.category_name).length;
  const withCollector = rows.filter((r) => r.assigned_name).length;

  if (withDueDate === 0 && rows.length > 0) {
    warnings.push('لا يوجد أي تاريخ استحقاق في الملف — لن تُنشأ سجلات استحقاق ولن تعمل التنبيهات');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rows,
    assignees,
    categories,
    stats: {
      fromProfiles: profileResult.rows.length,
      fromFollowups: followResult.rows.length,
      merged: mergedCount,
      withDueDate,
      withCategory,
      withCollector,
    },
  };
}
