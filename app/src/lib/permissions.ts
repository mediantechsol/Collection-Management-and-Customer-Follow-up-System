/**
 * نموذج الصلاحيات — منقول عن النموذج الأولي
 * (legacy/frontend/collection-system.html:529-632) وهو المنطق الأصعب والأهم
 * في هذا النظام، وقد نُقل كما هو لأنه سليم ومطابق لما طلبه صاحب المشروع.
 *
 * فوق الأدوار الأربعة، كل مستخدم له تخصيص إضافي:
 *   • allowed_screens        — أي شاشات يفتحها.
 *   • allowed_category_ids   — أي فئات عملاء يراها (فارغة = كل الفئات).
 *   • screen_permissions[شاشة].actions      — صلاحيات إجراء دقيقة تتجاوز افتراضي الدور.
 *   • screen_permissions[شاشة].hidden_fields — أعمدة تُخفى عن هذا المستخدم.
 *
 * ⚠️ هذا الملف طبقة *عرض* فقط. كل قاعدة هنا لها مقابل في سياسات RLS
 * (supabase/migrations/20260101000002_rls.sql). إخفاء زر في الواجهة ليس أمناً —
 * الأمان في قاعدة البيانات، وهذا الملف يمنع فقط عرض ما سيُرفض على أي حال.
 *
 * استثناء معروف: hidden_fields تجميلية بحتة — RLS تعمل على الصف لا العمود،
 * فالحقل المخفي يظل قابلاً للقراءة عبر الـ API. أي حقل حسّاس فعلاً يجب عزله
 * في جدول منفصل بسياسة خاصة، لا الاكتفاء بإخفائه هنا.
 */

export const ROLE_NAMES = ['مدير النظام', 'المحاسب', 'مسؤول التحصيل', 'مستخدم مخصص'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const SCREENS = [
  'dashboard',
  'followups',
  'customers',
  'notifications',
  'collections',
  'import',
  'performance',
  'users',
  'settings',
] as const;
export type ScreenKey = (typeof SCREENS)[number];

export const SCREEN_LABELS: Record<ScreenKey, string> = {
  dashboard: 'لوحة المدير',
  followups: 'متابعة العملاء',
  customers: 'العملاء',
  notifications: 'التنبيهات',
  collections: 'الدفعات المحصّلة',
  import: 'استيراد Excel',
  performance: 'الأداء والحوافز',
  users: 'المستخدمون والصلاحيات',
  settings: 'الإعدادات المركزية',
};

export interface ScreenPermission {
  actions?: Record<string, boolean>;
  hidden_fields?: string[];
}
export type ScreenPermissions = Partial<Record<ScreenKey, ScreenPermission>>;

export interface UserProfile {
  id: string;
  full_name: string;
  username: string;
  phone: string | null;
  role_id: string;
  role_name: RoleName;
  status: 'نشط' | 'موقوف';
  allowed_screens: ScreenKey[];
  allowed_category_ids: string[];
  screen_permissions: ScreenPermissions;
}

/* ---------------------------------------------------------------- الأدوار */

export const isAdmin = (u: UserProfile) => u.role_name === 'مدير النظام';
export const isAccountant = (u: UserProfile) => u.role_name === 'المحاسب';
export const isCollector = (u: UserProfile) => u.role_name === 'مسؤول التحصيل';

/* ---------------------------------------------------------------- الشاشات */

/**
 * الشاشات المسموحة، مصفّاة من أي قيمة لا تقابل شاشة حقيقية.
 *
 * ⚠️ العمود allowed_screens من نوع text[] بلا قيد على قيمه، فقد يحوي مفتاحاً
 * قديماً أو مكتوباً بخطأ. تمرير مثل هذه القيمة كوجهة تنقّل كان ينتج إعادة
 * توجيه لا نهائية تُجمّد التطبيق بالكامل، لذلك التصفية هنا لا في مكان الاستخدام.
 */
export function allowedScreens(u: UserProfile): ScreenKey[] {
  if (!Array.isArray(u.allowed_screens)) return [];
  const list = u.allowed_screens.filter((s): s is ScreenKey =>
    (SCREENS as readonly string[]).includes(s),
  );
  // مدير النظام يملك صلاحية شاشة الإعدادات المركزية دائماً
  if (isAdmin(u) && !list.includes('settings')) {
    list.push('settings');
  }
  return list;
}

export function hasScreenAccess(u: UserProfile, screen: ScreenKey): boolean {
  if (screen === 'settings') return isAdmin(u);
  return allowedScreens(u).includes(screen);
}

/**
 * أول شاشة متاحة — تُستخدم كوجهة افتراضية بعد الدخول أو عند رفض شاشة.
 * تُرجع null للمستخدم الذي لا يملك أي شاشة (وهي الحالة الافتراضية لكل حساب
 * جديد قبل أن يضبط له المدير صلاحياته). المستدعي مُلزَم بمعالجة هذه الحالة
 * برسالة صريحة، لا بإعادة توجيه إلى شاشة مرفوضة.
 */
export function defaultScreen(u: UserProfile): ScreenKey | null {
  if (hasScreenAccess(u, 'dashboard')) return 'dashboard';
  return allowedScreens(u)[0] ?? null;
}

export function allowedCategoryIds(u: UserProfile): string[] {
  return Array.isArray(u.allowed_category_ids) ? u.allowed_category_ids : [];
}

/* ---------------------------------------------------------------- الإجراءات والحقول */

export interface CatalogEntry {
  key: string;
  label: string;
}

/** الأعمدة القابلة للإخفاء لكل شاشة (تُعرض في شاشة الصلاحيات). */
export const FIELD_CATALOG: Partial<Record<ScreenKey, CatalogEntry[]>> = {
  customers: [
    { key: 'customer_number', label: 'رقم العميل' },
    { key: 'customer_name', label: 'اسم العميل' },
    { key: 'mobile_1', label: 'الجوال 1' },
    { key: 'mobile_2', label: 'الجوال 2' },
    { key: 'total_due', label: 'المستحق بالريال' },
    { key: 'debt_ratio', label: 'نسبة المديونية' },
    { key: 'category', label: 'الفئة' },
    { key: 'guarantor', label: 'الضامن / الضمانة' },
    { key: 'status_customer', label: 'الحالة' },
    { key: 'assigned_user', label: 'المسؤول' },
  ],
  followups: [
    { key: 'due_date', label: 'تاريخ الاستحقاق' },
    { key: 'customer_name', label: 'اسم العميل' },
    { key: 'mobile_1', label: 'الجوال' },
    { key: 'remaining', label: 'المتبقي عليه' },
    { key: 'status_pill', label: 'حالة الاستحقاق' },
    { key: 'assigned_user', label: 'مسؤول المتابعة' },
    { key: 'next_appointment', label: 'موعد المتابعة القادمة' },
    { key: 'last_followup_details', label: 'تفاصيل آخر متابعة' },
  ],
  collections: [
    { key: 'collected_date', label: 'تاريخ التحصيل' },
    { key: 'customer_name', label: 'العميل' },
    { key: 'amount', label: 'المبلغ' },
    { key: 'amount_yer', label: 'المبلغ بالريال' },
    { key: 'collector', label: 'المحصِّل' },
    { key: 'source', label: 'المصدر' },
    { key: 'status', label: 'حالة الاعتماد' },
  ],
  users: [
    { key: 'full_name', label: 'الاسم' },
    { key: 'username', label: 'اسم المستخدم' },
    { key: 'role', label: 'الدور' },
    { key: 'screens', label: 'الشاشات المسموحة' },
    { key: 'categories', label: 'فئات العملاء المسموحة' },
    { key: 'status', label: 'الحالة' },
  ],
};

/** الإجراءات القابلة للمنح/المنع لكل شاشة. */
export const ACTION_CATALOG: Partial<Record<ScreenKey, CatalogEntry[]>> = {
  customers: [
    { key: 'create', label: 'إضافة عميل جديد' },
    { key: 'edit', label: 'تعديل بيانات العميل' },
    { key: 'deactivate', label: 'إيقاف/تنشيط العميل' },
  ],
  followups: [{ key: 'create', label: 'إضافة متابعة' }],
  collections: [
    { key: 'create', label: 'تسجيل دفعة محصّلة' },
    { key: 'confirm', label: 'اعتماد الدفعات' },
  ],
  users: [
    { key: 'create', label: 'إضافة مستخدم' },
    { key: 'edit', label: 'تعديل صلاحيات مستخدم' },
    { key: 'deactivate', label: 'إيقاف/تنشيط مستخدم' },
  ],
  performance: [
    { key: 'create', label: 'إضافة فئة عملاء' },
    { key: 'pay', label: 'صرف حافز' },
  ],
  settings: [
    { key: 'edit', label: 'تعديل الإعدادات العامة والتنبيهات' },
  ],
};

/**
 * صلاحية الإجراء الافتراضية حسب الدور — تُستخدم إذا لم يوجد تخصيص صريح.
 * منقولة كما هي عن roleDefaultAction في النموذج الأولي، مع إضافة شاشة الدفعات.
 */
export function roleDefaultAction(role: RoleName, screen: ScreenKey, action: string): boolean {
  if (role === 'مدير النظام') return true;

  if (screen === 'customers') {
    if (action === 'create' || action === 'edit') return role === 'المحاسب';
    if (action === 'deactivate') return false;
  }
  // أي مستخدم يرى العميل يستطيع تسجيل متابعة عليه افتراضياً
  if (screen === 'followups' && action === 'create') return true;
  // الدفعات والاعتماد شأن محاسبي بحت
  if (screen === 'collections') return role === 'المحاسب';
  if (screen === 'users') return false;
  if (screen === 'performance') return false;
  if (screen === 'settings') return false;

  return false;
}

/** هل يملك المستخدم هذا الإجراء على هذه الشاشة؟ (التخصيص الصريح يتقدّم على الدور) */
export function screenAction(u: UserProfile, screen: ScreenKey, action: string): boolean {
  const sp = u.screen_permissions?.[screen];
  if (sp?.actions && Object.prototype.hasOwnProperty.call(sp.actions, action)) {
    return !!sp.actions[action];
  }
  return roleDefaultAction(u.role_name, screen, action);
}

export function isFieldHidden(u: UserProfile, screen: ScreenKey, field: string): boolean {
  const sp = u.screen_permissions?.[screen];
  return !!sp?.hidden_fields?.includes(field);
}

/** أعمدة الجدول الظاهرة لهذا المستخدم في هذه الشاشة. */
export function visibleFields(u: UserProfile, screen: ScreenKey): CatalogEntry[] {
  return (FIELD_CATALOG[screen] ?? []).filter((f) => !isFieldHidden(u, screen, f.key));
}

/* ---------------------------------------------------------------- نسخ الصلاحيات */

/** حزمة الصلاحيات القابلة للنسخ بين المستخدمين — بدون بيانات الاعتماد الشخصية. */
export interface PermissionsBundle {
  role_id: string;
  allowed_screens: ScreenKey[];
  allowed_category_ids: string[];
  screen_permissions: ScreenPermissions;
}

/**
 * استخلاص حزمة الصلاحيات من مستخدم — نسخة عميقة لتجنب مشاركة المراجع.
 * لا تتضمن الحزمة أي بيانات شخصية (اسم، هاتف، كلمة مرور).
 */
export function extractPermissionsBundle(user: {
  role_id: string;
  allowed_screens: ScreenKey[];
  allowed_category_ids: string[];
  screen_permissions: ScreenPermissions;
}): PermissionsBundle {
  return {
    role_id: user.role_id,
    allowed_screens: [...user.allowed_screens],
    allowed_category_ids: [...user.allowed_category_ids],
    screen_permissions: structuredClone(user.screen_permissions),
  };
}

/* ---------------------------------------------------------------- العملاء */

export interface CustomerScope {
  assigned_user_id: string | null;
  customer_category_id: string | null;
}

/**
 * هل يرى هذا المستخدم هذا العميل؟ — مرآة دقيقة لدالة قاعدة البيانات
 * public.can_see_customer(). تُستخدم للتحقق قبل فتح شاشة التفاصيل فقط؛
 * الفلترة الفعلية للقوائم تحدث في قاعدة البيانات عبر RLS.
 */
export function canSeeCustomer(u: UserProfile, c: CustomerScope): boolean {
  if (u.status !== 'نشط') return false;

  const roleOk = isAdmin(u) || isAccountant(u) || c.assigned_user_id === u.id;
  if (!roleOk) return false;

  const cats = allowedCategoryIds(u);
  if (cats.length === 0) return true;
  return !!c.customer_category_id && cats.includes(c.customer_category_id);
}

/** إدارة المستخدمين والإعدادات محصورة بالمدير دائماً. */
export const canManageUsers = (u: UserProfile) => isAdmin(u);
export const canManageSettings = (u: UserProfile) => isAdmin(u);
export const canImport = (u: UserProfile) => isAdmin(u) || isAccountant(u);
