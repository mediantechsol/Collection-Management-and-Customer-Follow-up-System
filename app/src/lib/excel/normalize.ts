/**
 * أدوات تطبيع القيم القادمة من ملفات Excel الحقيقية.
 *
 * ملفات العميل كُتبت يدوياً على مدى سنوات، وفيها فعلياً:
 *   • مسافات زائدة في رؤوس الأعمدة: "رقم العميل " (بمسافة في آخرها).
 *   • تطويل (ـــ) داخل عناوين الأقسام: "ارصـــــــــــدة العــــمـــــــلاء".
 *   • أخطاء إملائية في الرؤوس: "رقم العمبل"، "ملاحضة"، "ملاجظة 1".
 *   • أشكال مختلفة للألف والياء والهاء: "دولار امريكي" مقابل "أمريكي".
 *   • أرقام عملاء مصفَّرة نصياً ("00001") في شيت، ورقمية (1) في شيت آخر.
 *   • أرقام جوال مخزّنة كأرقام لا كنصوص (711111111 → قد تفقد الصفر البادئ).
 *
 * أي محلّل يقارن النصوص كما هي سيفشل على الملف الحقيقي، لذلك كل مقارنة نصية
 * في هذا النظام تمر عبر normalizeArabic().
 */

/** إزالة التطويل والتشكيل وتوحيد أشكال الحروف والمسافات. */
export function normalizeArabic(value: unknown): string {
  return String(value ?? '')
    .replace(/[ـ]/g, '')                 // تطويل ـ
    .replace(/[ً-ْٰ]/g, '')    // تشكيل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/‏|‎/g, '')            // محارف اتجاه غير مرئية
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * يطابق اسماً عربياً مع قائمة أسماء مرجعية بعد تطبيع الطرفين.
 * يُرجع العنصر المطابق الأصلي أو null إن لم يوجد.
 */
export function matchNormalized<T>(
  input: string,
  candidates: T[],
  accessor: (item: T) => string,
): T | null {
  const norm = normalizeArabic(input);
  return candidates.find((c) => normalizeArabic(accessor(c)) === norm) ?? null;
}

/** نص خلية بعد التنظيف، أو null إن كانت فارغة فعلياً. */
export function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

/**
 * رقم من خلية قد تكون نصاً فيه فواصل آلاف أو أقواس للسالب أو رمز عملة.
 * أي قيمة غير قابلة للتحويل تُعامل كصفر (لا كخطأ) — هذا سلوك مقصود لأعمدة
 * المدين/الدائن حيث الخلية الفارغة تعني صفراً في ملف العميل.
 */
export function cellNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let s = String(value).trim().replace(/[,\s٬]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // أرقام عربية-هندية
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[^\d.\-]/g, '');

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/**
 * رقم العميل مطبَّعاً — يجب أن يطابق تماماً دالة قاعدة البيانات
 * public.normalize_customer_number()، وإلا فشل ربط الملفين ببعضهما.
 *   "00001" → "1"   |   1 → "1"   |   1.0 → "1"   |   " 23 " → "23"
 */
export function normalizeCustomerNumber(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  let s = typeof value === 'number' ? String(value) : String(value).trim();
  if (s === '') return null;

  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/\.0+$/, '');          // 1.0 القادم من Excel كرقم عشري
  s = s.replace(/^0+(?=\d)/, '');      // أصفار بادئة: 00001 → 1

  return s === '' ? null : s;
}

/** رقم جوال كنص — Excel يخزّنه رقماً فيفقد الصفر البادئ أحياناً. */
export function cellPhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(typeof value === 'number' ? Math.trunc(value) : value)
    .replace(/[^\d+]/g, '')
    .trim();
  return s === '' ? null : s;
}

/**
 * تاريخ من خلية قد تكون Date (عند القراءة بـ cellDates) أو رقماً تسلسلياً
 * من Excel أو نصاً. يُرجع "YYYY-MM-DD" أو null.
 */
export function cellDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // xlsx يبني التواريخ بالتوقيت المحلي؛ نأخذ مكوّنات التقويم المحلي
    // مباشرة بدل toISOString حتى لا ينزاح اليوم في المناطق الشرقية.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof value === 'number') {
    // الرقم التسلسلي في Excel: 1 = 1900-01-01، مع خطأ 1900 الكبيسة المعروف
    if (value <= 0) return null;
    const ms = Math.round((value - 25569) * 86_400_000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

/** هل الصف فارغ تماماً؟ */
export function isEmptyRow(row: unknown[] | undefined): boolean {
  if (!row) return true;
  return row.every((c) => c === null || c === undefined || String(c).trim() === '');
}
