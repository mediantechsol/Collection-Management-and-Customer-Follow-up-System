/**
 * حسابات التواريخ — منقولة عن الدوال الصافية في النموذج الأولي
 * (legacy/frontend/collection-system.html:261-264) مع إصلاح خطأ حقيقي:
 *
 * ⚠️ النسخة الأصلية كانت تكتب:
 *     new Date(dateStr + "T00:00:00")  →  يُفسَّر كمنتصف ليل *بالتوقيت المحلي*
 *     ثم .toISOString().slice(0,10)    →  يحوّله إلى UTC
 *   في اليمن (UTC+3) هذا يعني أن addDays("2026-01-01", 0) يُرجع "2025-12-31".
 *   أي أن كل تاريخ استحقاق كان ينزاح يوماً كاملاً للخلف لدى كل مستخدم شرق
 *   غرينتش — وهو خطأ صامت يغيّر "الأيام المتبقية" ويطلق تنبيهات في اليوم الخطأ.
 *
 * الحل هنا: كل الحساب بـ UTC خالص. التواريخ في هذا النظام تواريخ تقويمية
 * (يوم/شهر/سنة) بلا وقت، فلا معنى للمنطقة الزمنية فيها أصلاً.
 */

const MS_PER_DAY = 86_400_000;

/** تحويل "YYYY-MM-DD" إلى طابع زمني UTC. يرمي خطأً على أي صيغة أخرى. */
function parseISODate(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error(`تاريخ غير صالح: ${dateStr}`);
  const [, y, mo, d] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d));
}

function toISODate(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** تاريخ اليوم بصيغة "YYYY-MM-DD" حسب التقويم المحلي للمستخدم. */
export function todayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** عدد الأيام من `from` إلى `to` (موجب = `to` في المستقبل). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to) - parseISODate(from)) / MS_PER_DAY);
}

/** إضافة (أو طرح) عدد أيام إلى تاريخ. */
export function addDays(dateStr: string, days: number): string {
  return toISODate(parseISODate(dateStr) + Math.trunc(Number(days) || 0) * MS_PER_DAY);
}

/**
 * تاريخ الاستحقاق الجديد = تاريخ الاستحقاق + مجموع المهل الثلاث.
 * قاعدة عمل أساسية — تقابل الأعمدة 23/24/25 في شيت العميل
 * ("مهلة إضافية بعد التواصل (يوم) 1، 2، 3").
 */
export function calcNewDueDate(
  dueDate: string,
  g1: number | null | undefined,
  g2: number | null | undefined,
  g3: number | null | undefined,
): string {
  const total = (Number(g1) || 0) + (Number(g2) || 0) + (Number(g3) || 0);
  return addDays(dueDate, total);
}

/** الأيام المتبقية = تاريخ الاستحقاق الجديد − اليوم (سالب = متأخر). */
export function calcRemainingDays(newDueDate: string, today: string = todayStr()): number {
  return daysBetween(today, newDueDate);
}

/** حالة الاستحقاق المعروضة كشارة في جداول المتابعة. */
export type DueStatus = 'overdue_severe' | 'overdue' | 'due_soon' | 'ok' | 'unknown';

/**
 * تصنيف حالة العميل حسب الأيام المتبقية.
 * العتبات قابلة للضبط من إعدادات النظام: النموذج الأولي كان يثبّت "3 أيام"
 * بينما مفتاح ألوان شيت العميل الحقيقي يقول "5 أيام أو أقل" و"مرور 35 يوم".
 */
export function classifyDue(
  remainingDays: number | null | undefined,
  opts: { daysBeforeDueAlert: number; overdueAlertDays: number },
): DueStatus {
  if (remainingDays === null || remainingDays === undefined) return 'unknown';
  if (remainingDays <= -opts.overdueAlertDays) return 'overdue_severe';
  if (remainingDays < 0) return 'overdue';
  if (remainingDays <= opts.daysBeforeDueAlert) return 'due_soon';
  return 'ok';
}
