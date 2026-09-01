/**
 * كل استعلامات وطفرات البيانات عبر TanStack Query.
 *
 * بديل loadState()/saveState() في النموذج الأولي اللذين كانا يحمّلان "كل حالة
 * النظام" ككتلة واحدة ويحفظانها كاملة عند أي تغيير — نمط لا يصلح لقاعدة بيانات
 * مشتركة بين عدة مستخدمين. هنا كل شاشة تجلب ما تحتاجه فقط، والطفرات تُبطل
 * المفاتيح المتأثرة لتُعاد المزامنة.
 *
 * فلترة الصلاحيات لا تحدث هنا — RLS في قاعدة البيانات تُرجع أصلاً ما يحق
 * للمستخدم رؤيته فقط.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExchangeRates } from '@/lib/logic/money';
import type {
  ActivityLog,
  AnalyticsChartsData,
  AnalyticsFilters,
  AnalyticsKPIs,
  AppNotification,
  AppSettings,
  AppUser,
  Collection,
  CollectorTierSetting,
  CreateReminderInput,
  CustomReminder,
  Customer,
  CustomerCategory,
  CustomerOverview,
  CustomerPersonalAssignment,
  ExcelImport,
  Followup,
  Incentive,
  IncentivePayment,
  ImportBalancesResult,
  ImportCustomersResult,
  PersonalTierKey,
  Role,
  SystemBackupPayload,
  SystemBackupRecord,
  BackupType,
  BackupValidationResult,
  RestoreBackupResult,
  UserDirectoryEntry,
  UUID,
} from '@/types/models';

/** يحوّل خطأ PostgREST إلى رسالة عربية مفهومة بدل نص إنجليزي تقني. */
function raise(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) {
    throw new Error('لا تملك صلاحية تنفيذ هذه العملية');
  }
  if (error.code === '23505') throw new Error('السجل موجود مسبقاً (قيمة مكرّرة)');
  throw new Error(error.message);
}

export const qk = {
  settings: ['settings'] as const,
  categories: ['categories'] as const,
  directory: ['user_directory'] as const,
  users: ['users'] as const,
  customers: ['customers'] as const,
  customer: (id: UUID) => ['customers', id] as const,
  followups: (customerId?: UUID) => ['followups', customerId ?? 'all'] as const,
  notifications: ['notifications'] as const,
  collections: ['collections'] as const,
  incentives: ['incentives'] as const,
  incentivePayments: ['incentive_payments'] as const,
  imports: ['excel_imports'] as const,
  activity: ['activity_logs'] as const,
  analytics: {
    all: ['analytics'] as const,
    summary: (filters?: AnalyticsFilters) => ['analytics', 'summary', filters ?? {}] as const,
    charts: (filters?: AnalyticsFilters) => ['analytics', 'charts', filters ?? {}] as const,
  },
  personalTiers: ['personal_tiers'] as const,
  personalAssignments: ['personal_assignments'] as const,
  customReminders: ['custom_reminders'] as const,
  systemBackups: ['system_backups'] as const,
};

/* ============================================================ الإعدادات والمراجع */

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').limit(1).single();
      raise(error);
      return data as AppSettings;
    },
    staleTime: 5 * 60_000,
  });
}

/** أسعار الصرف بالشكل الذي تتوقعه دوال الحساب. */
export function ratesFrom(settings?: AppSettings): ExchangeRates {
  return { usd: settings?.exchange_rate_usd ?? 0, sar: settings?.exchange_rate_sar ?? 0 };
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, name_role');
      raise(error);
      return (data ?? []) as Role[];
    },
    staleTime: Infinity, // أربعة أدوار ثابتة لا تتغيّر أثناء الجلسة
  });
}

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_categories')
        .select('*')
        .order('category_name');
      raise(error);
      return (data ?? []) as CustomerCategory[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * دليل الأسماء — مقروء لكل مستخدم عبر العرض user_directory.
 * بدونه كان عمود "المسؤول" يظهر فارغاً لمسؤول التحصيل، لأن سياسة users
 * تمنعه من قراءة سطور غيره.
 */
export function useUserDirectory() {
  return useQuery({
    queryKey: qk.directory,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_directory').select('*').order('full_name');
      raise(error);
      return (data ?? []) as UserDirectoryEntry[];
    },
    staleTime: 5 * 60_000,
  });
}

/** خريطة معرّف ← اسم، لعرض أسماء المسؤولين في الجداول. */
export function useUserNames(): Map<string, string> {
  const { data } = useUserDirectory();
  return new Map((data ?? []).map((u) => [u.id, u.full_name]));
}

/* ============================================================ العملاء */

export function useCustomers() {
  return useQuery({
    queryKey: qk.customers,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_overview_view')
        .select('*')
        .order('customer_name');
      raise(error);
      return (data ?? []) as CustomerOverview[];
    },
  });
}

export function useCustomer(id: UUID | undefined) {
  return useQuery({
    queryKey: qk.customer(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_overview_view')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      raise(error);
      return data as CustomerOverview | null;
    },
  });
}

type CustomerInput = Partial<Omit<Customer, 'id'>> & { customer_name: string };

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: UUID; values: CustomerInput }) => {
      if (id) {
        const { error } = await supabase.from('customers').update(values).eq('id', id);
        raise(error);
        return id;
      }
      const { data, error } = await supabase.from('customers').insert(values).select('id').single();
      raise(error);
      return (data as { id: UUID }).id;
    },
    onSuccess: () => invalidateCustomerData(qc),
  });
}

export function useToggleCustomerActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: UUID; isActive: boolean }) => {
      const { error } = await supabase.from('customers').update({ is_active: isActive }).eq('id', id);
      raise(error);
    },
    onSuccess: () => invalidateCustomerData(qc),
  });
}

/** تاريخ الاستحقاق والمهل — جدول منفصل عن العميل، يحرّره المدير/المحاسب. */
export function useSaveDueDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      customer_id: UUID;
      due_date: string;
      grace_1: number;
      grace_2: number;
      grace_3: number;
    }) => {
      const { error } = await supabase
        .from('due_dates')
        .upsert(values, { onConflict: 'customer_id' });
      raise(error);
    },
    onSuccess: () => invalidateCustomerData(qc),
  });
}

function invalidateCustomerData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: qk.customers });
  qc.invalidateQueries({ queryKey: qk.activity });
  qc.invalidateQueries({ queryKey: qk.analytics.all });
}

/* ============================================================ المتابعات */

export function useFollowups(customerId?: UUID) {
  return useQuery({
    queryKey: qk.followups(customerId),
    queryFn: async () => {
      let q = supabase
        .from('followups')
        .select('*')
        .order('followup_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (customerId) q = q.eq('customer_id', customerId);
      else q = q.limit(200);

      const { data, error } = await q;
      raise(error);
      return (data ?? []) as Followup[];
    },
  });
}

export function useAddFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Omit<Followup, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('followups').insert(values);
      raise(error);

      // استدعاء الدالة التي تُحدِّث التنبيهات فوراً بعد إضافة المتابعة:
      // - تحذف تنبيه 'stale' إن كان موجوداً (لأن المتابعة تثبت عدم الإهمال)
      // - تُنشئ 'promise_today' إن كانت النتيجة تحتوي على كلمة الوعد وموعده اليوم
      // الدالة security definer وتعمل لكل الأدوار (مسؤول تحصيل، محاسب، مدير)
      const { error: notifyErr } = await supabase.rpc('notify_after_followup', {
        p_followup_id:   values.customer_id, // UUID مؤقت — الدالة لا تحتاجه فعلياً لكنه مطلوب كمعامل
        p_customer_id:   values.customer_id,
        p_followup_date: values.followup_date,
        p_next_date:     values.next_followup_date ?? null,
        p_result:        values.contact_result ?? null,
      });
      // نتجاهل الخطأ بصمت حتى لا يعيق حفظ المتابعة
      if (notifyErr) console.warn('[notify_after_followup]', notifyErr.message);
    },
    onSuccess: (_d, values) => {
      qc.invalidateQueries({ queryKey: qk.followups(values.customer_id) });
      qc.invalidateQueries({ queryKey: qk.followups() });
      qc.invalidateQueries({ queryKey: qk.notifications });
      invalidateCustomerData(qc);
    },
  });
}

/* ============================================================ التنبيهات */

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('notification_date', { ascending: false })
        .limit(1000);
      raise(error);
      return (data ?? []) as AppNotification[];
    },
  });
}

export function useGenerateNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_daily_notifications');
      raise(error);
      return (data ?? 0) as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useHandleNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: UUID) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('notifications')
        .update({
          status: 'تم التعامل',
          handled_by: userData.user?.id ?? null,
          handled_at: new Date().toISOString(),
        })
        .eq('id', id);
      raise(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

/** رفع حالة عميل للمدير — عبر RPC لأن الإدراج المباشر في notifications ممنوع. */
export function useEscalateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, note }: { customerId: UUID; note?: string }) => {
      const { error } = await supabase.rpc('escalate_customer', {
        p_customer_id: customerId,
        p_note: note ?? null,
      });
      raise(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.activity });
    },
  });
}

/* ============================================================ الدفعات المحصّلة */

export function useCollections() {
  return useQuery({
    queryKey: qk.collections,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('collected_date', { ascending: false })
        .limit(1000);
      raise(error);
      return (data ?? []) as Collection[];
    },
  });
}

export function useAddCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      values: Pick<Collection, 'customer_id' | 'user_id' | 'currency' | 'amount' | 'rate_used' | 'amount_yer' | 'collected_date' | 'note'>,
    ) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('collections')
        .insert({ ...values, source: 'manual', created_by: userData.user?.id ?? null });
      raise(error);
    },
    onSuccess: () => invalidateCollectionData(qc),
  });
}

/** اعتماد الدفعة — هو ما يُطلق توليد الحافز عبر trigger في قاعدة البيانات. */
export function useConfirmCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, confirmed }: { id: UUID; confirmed: boolean }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('collections')
        .update(
          confirmed
            ? { confirmed_at: new Date().toISOString(), confirmed_by: userData.user?.id ?? null }
            : { confirmed_at: null, confirmed_by: null },
        )
        .eq('id', id);
      raise(error);
    },
    onSuccess: () => invalidateCollectionData(qc),
  });
}

/** إسناد الدفعة لمحصِّل — الدفعات المشتقّة من الاستيراد قد تأتي بلا مسؤول. */
export function useAssignCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: UUID; userId: UUID | null }) => {
      const { error } = await supabase.from('collections').update({ user_id: userId }).eq('id', id);
      raise(error);
    },
    onSuccess: () => invalidateCollectionData(qc),
  });
}

function invalidateCollectionData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: qk.collections });
  qc.invalidateQueries({ queryKey: qk.incentives });
  qc.invalidateQueries({ queryKey: qk.activity });
  qc.invalidateQueries({ queryKey: qk.analytics.all });
}

/* ============================================================ الحوافز */

export function useIncentives() {
  return useQuery({
    queryKey: qk.incentives,
    queryFn: async () => {
      const { data, error } = await supabase.from('incentives').select('*');
      raise(error);
      return (data ?? []) as Incentive[];
    },
  });
}

export function useIncentivePayments() {
  return useQuery({
    queryKey: qk.incentivePayments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_payments')
        .select('*')
        .order('payment_date', { ascending: false });
      raise(error);
      return (data ?? []) as IncentivePayment[];
    },
  });
}

export function usePayIncentive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { user_id: UUID; amount: number; payment_date: string; notes?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('incentive_payments')
        .insert({ ...values, created_by: userData.user?.id ?? null });
      raise(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.incentivePayments });
      qc.invalidateQueries({ queryKey: qk.activity });
    },
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: UUID; values: Omit<CustomerCategory, 'id'> }) => {
      if (id) {
        const { error } = await supabase.from('customer_categories').update(values).eq('id', id);
        raise(error);
      } else {
        const { error } = await supabase.from('customer_categories').insert(values);
        raise(error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories });
      qc.invalidateQueries({ queryKey: qk.customers });
    },
  });
}

/* ============================================================ الاستيراد */

export function useExcelImports() {
  return useQuery({
    queryKey: qk.imports,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('excel_imports')
        .select('*')
        .order('import_date', { ascending: false })
        .limit(50);
      raise(error);
      return (data ?? []) as ExcelImport[];
    },
  });
}

export function useImportBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      fileName: string;
      rows: unknown[];
      deriveCollections: boolean;
    }) => {
      const { data, error } = await supabase.rpc('import_balances', {
        p_file_name: args.fileName,
        p_rows: args.rows,
        p_derive_collections: args.deriveCollections,
      });
      raise(error);
      return data as ImportBalancesResult;
    },
    onSuccess: (_d, _v) => {
      qc.invalidateQueries({ queryKey: qk.imports });
      invalidateCustomerData(qc);
      invalidateCollectionData(qc);
    },
  });
}

export function useImportCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { fileName: string; rows: unknown[] }) => {
      const { data, error } = await supabase.rpc('import_customers', {
        p_file_name: args.fileName,
        p_rows: args.rows,
      });
      raise(error);
      return data as ImportCustomersResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.imports });
      invalidateCustomerData(qc);
    },
  });
}

/* ============================================================ المستخدمون والسجل */

export function useUsers() {
  return useQuery({
    queryKey: qk.users,
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').order('full_name');
      raise(error);
      return (data ?? []) as AppUser[];
    },
  });
}

/** تعديل الصلاحيات — التعديل الوحيد المسموح مباشرة على جدول users (للمدير). */
export function useSaveUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: UUID;
      values: Partial<Pick<AppUser, 'full_name' | 'phone' | 'role_id' | 'allowed_screens' | 'allowed_category_ids' | 'screen_permissions'>>;
    }) => {
      const { error } = await supabase.from('users').update(values).eq('id', id);
      raise(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.directory });
    },
  });
}

/**
 * يستخرج رسالة الخطأ العربية من جسم رد الـ Edge Function.
 * error.context هو كائن Response لم يُقرأ بعد؛ يُرجع null إن تعذّر تحليله.
 */
async function readFunctionError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context;
  if (!(ctx instanceof Response)) return null;
  try {
    const body = await ctx.clone().json();
    const msg = (body as { error?: unknown })?.error;
    return typeof msg === 'string' && msg ? msg : null;
  } catch {
    return null;
  }
}

/**
 * العمليات التي تحتاج service_role — تمر عبر Edge Function حصراً.
 * لا يوجد أي مسار في الواجهة يستطيع إنشاء حساب أو تغيير كلمة مرور مباشرة.
 */
export function useAdminUserAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke('admin-users', { body: payload });
      if (error) {
        // FunctionsFetchError: لم يصل الطلب أصلاً — غالباً لأن الدالة غير منشورة
        // على المشروع. الرسالة الإنجليزية الخام لا تفيد الموظف بشيء.
        const m = error.message ?? '';
        if (/failed to send a request|failed to fetch|networkerror/i.test(m)) {
          throw new Error(
            'تعذّر الوصول إلى خدمة إدارة المستخدمين — راجع مدير النظام ' +
              '(يلزم نشر Edge Function باسم admin-users على المشروع)',
          );
        }
        // FunctionsHttpError: رسالة error.message هنا ثابتة وعديمة الفائدة
        // ("Edge Function returned a non-2xx status code")، والسبب الحقيقي
        // في جسم الرد داخل error.context. بدون قراءته كان المدير يرى نصاً
        // إنجليزياً واحداً مهما كان الخطأ (اسم مستخدم مكرّر، كلمة مرور قصيرة…).
        throw new Error((await readFunctionError(error)) ?? m);
      }
      if (data?.error) throw new Error(data.error as string);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.directory });
    },
  });
}

export function useActivityLogs(limit = 50) {
  return useQuery({
    queryKey: [...qk.activity, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      raise(error);
      return (data ?? []) as ActivityLog[];
    },
  });
}

export function useSettingsActivityLogs(limit = 50) {
  return useQuery({
    queryKey: [...qk.activity, 'settings', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('table_name', 'settings')
        .order('created_at', { ascending: false })
        .limit(limit);
      raise(error);
      return (data ?? []) as ActivityLog[];
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<AppSettings>) => {
      const { error } = await supabase.from('settings').update(values).eq('id', true);
      raise(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.settings });
      qc.invalidateQueries({ queryKey: qk.customers });
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.activity });
      qc.invalidateQueries({ queryKey: qk.analytics.all });
    },
  });
}

/* ============================================================ التقارير التحليلية */

export function useAnalyticsKPIs(filters?: AnalyticsFilters) {
  return useQuery({
    queryKey: qk.analytics.summary(filters),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_analytics_summary_kpis', {
        p_start_date: filters?.startDate || null,
        p_end_date: filters?.endDate || null,
        p_user_id: filters?.userId || null,
        p_category_id: filters?.categoryId || null,
        p_currency: filters?.currency && filters.currency !== 'ALL' ? filters.currency : null,
      });
      raise(error);
      return data as AnalyticsKPIs;
    },
  });
}

export function useAnalyticsCharts(filters?: AnalyticsFilters) {
  return useQuery({
    queryKey: qk.analytics.charts(filters),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_analytics_charts_data', {
        p_start_date: filters?.startDate || null,
        p_end_date: filters?.endDate || null,
        p_user_id: filters?.userId || null,
        p_category_id: filters?.categoryId || null,
        p_currency: filters?.currency && filters.currency !== 'ALL' ? filters.currency : null,
      });
      raise(error);
      return data as AnalyticsChartsData;
    },
  });
}

/* ============================================================ التصنيف الشخصي للمحصل (V2) */

/** جلب أو تهيئة الفئات الأربع الافتراضية للمستخدم الحالي */
export function usePersonalTiers() {
  return useQuery({
    queryKey: qk.personalTiers,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_or_init_user_tiers');
      raise(error);
      return (data ?? []) as CollectorTierSetting[];
    },
    staleTime: 5 * 60_000,
  });
}

/** جلب جميع تعيينات العملاء للفئات الشخصية للمستخدم الحالي */
export function usePersonalAssignments() {
  return useQuery({
    queryKey: qk.personalAssignments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_personal_assignments')
        .select('*');
      raise(error);
      return (data ?? []) as CustomerPersonalAssignment[];
    },
  });
}

/** تعيين فئة العميل الشخصية بنقرة واحدة (Upsert) مع تحديث تفاؤلي فوري */
export function useSetCustomerPersonalTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      customerId,
      tierKey,
    }: {
      customerId: UUID;
      tierKey: PersonalTierKey;
    }) => {
      const { data, error } = await supabase.rpc('set_customer_personal_tier', {
        p_customer_id: customerId,
        p_tier_key: tierKey,
      });
      raise(error);
      return data as CustomerPersonalAssignment;
    },
    onMutate: async ({ customerId, tierKey }) => {
      await qc.cancelQueries({ queryKey: qk.personalAssignments });
      const previous = qc.getQueryData<CustomerPersonalAssignment[]>(qk.personalAssignments);

      qc.setQueryData<CustomerPersonalAssignment[]>(qk.personalAssignments, (old = []) => {
        const idx = old.findIndex((a) => a.customer_id === customerId);
        if (idx >= 0) {
          const updated = [...old];
          updated[idx] = { ...updated[idx], tier_key: tierKey, updated_at: new Date().toISOString() };
          return updated;
        }
        return [
          ...old,
          {
            id: 'temp-' + Date.now(),
            user_id: '',
            customer_id: customerId,
            tier_key: tierKey,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.personalAssignments, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.personalAssignments });
    },
  });
}

/** تحديث مسميات وألوان الفئات الشخصية */
export function useUpdateTierSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tiers: Array<{ id: UUID; tier_name: string; color: string }>) => {
      for (const tier of tiers) {
        const { error } = await supabase
          .from('collector_tier_settings')
          .update({
            tier_name: tier.tier_name,
            color: tier.color,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tier.id);
        raise(error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.personalTiers });
    },
  });
}

/* ============================================================ التذكيرات الحرة المخصصة "ذكرني" (V2) */

/** جلب جميع تذكيرات المستخدم الحالي مع بيانات العميل المربوط اختياريّاً */
export function useCustomReminders(filter?: {
  customerId?: UUID | null;
  status?: 'active' | 'completed' | 'all';
}) {
  return useQuery({
    queryKey: [...qk.customReminders, filter ?? {}],
    queryFn: async () => {
      let query = supabase
        .from('custom_reminders')
        .select(`
          *,
          customers (
            customer_name,
            customer_number
          )
        `)
        .order('due_date', { ascending: true })
        .order('created_at', { ascending: false });

      if (filter?.customerId) {
        query = query.eq('customer_id', filter.customerId);
      }
      if (filter?.status === 'active') {
        query = query.eq('is_completed', false);
      } else if (filter?.status === 'completed') {
        query = query.eq('is_completed', true);
      }

      const { data, error } = await query;
      raise(error);

      return (data ?? []).map((row: any) => ({
        ...row,
        customer_name: row.customers?.customer_name ?? null,
        customer_number: row.customers?.customer_number ?? null,
      })) as CustomReminder[];
    },
  });
}

/** إنشاء تذكير مخصص سريع عبر دالة RPC مع التحديث التفاؤلي */
export function useCreateCustomReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReminderInput) => {
      const { data, error } = await supabase.rpc('create_custom_reminder', {
        p_customer_id: input.customerId ?? null,
        p_title: input.title,
        p_notes: input.notes ?? null,
        p_due_date: input.dueDate,
        p_due_time: input.dueTime ?? null,
        p_priority: input.priority ?? 'normal',
      });
      raise(error);
      return data as CustomReminder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.customReminders });
    },
  });
}

/** تبديل حالة إنجاز التذكير (Toggle Completion) مع تحديث تفاؤلي فوري */
export function useToggleReminderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reminderId,
      isCompleted,
    }: {
      reminderId: UUID;
      isCompleted: boolean;
    }) => {
      const { data, error } = await supabase.rpc('toggle_reminder_status', {
        p_reminder_id: reminderId,
        p_is_completed: isCompleted,
      });
      raise(error);
      return data as CustomReminder;
    },
    onMutate: async ({ reminderId, isCompleted }) => {
      await qc.cancelQueries({ queryKey: qk.customReminders });
      const previous = qc.getQueryData<CustomReminder[]>(qk.customReminders);

      qc.setQueriesData<CustomReminder[]>({ queryKey: qk.customReminders }, (old = []) => {
        return old.map((r) =>
          r.id === reminderId
            ? {
                ...r,
                is_completed: isCompleted,
                completed_at: isCompleted ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
              }
            : r,
        );
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.customReminders, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.customReminders });
    },
  });
}

/** تأجيل موعد التذكير بعدد محدد من الأيام */
export function useSnoozeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reminderId,
      daysToAdd,
    }: {
      reminderId: UUID;
      daysToAdd: number;
    }) => {
      const { data, error } = await supabase.rpc('snooze_reminder', {
        p_reminder_id: reminderId,
        p_days_to_add: daysToAdd,
      });
      raise(error);
      return data as CustomReminder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.customReminders });
    },
  });
}

/** حذف تذكير مخصص */
export function useDeleteCustomReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reminderId: UUID) => {
      const { error } = await supabase
        .from('custom_reminders')
        .delete()
        .eq('id', reminderId);
      raise(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.customReminders });
    },
  });
}

/* ============================================================ النسخ الاحتياطي والاستعادة (V2) */

/** استرجاع سجل كافة النسخ الاحتياطية لمدير النظام */
export function useSystemBackups() {
  return useQuery({
    queryKey: qk.systemBackups,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_backups')
        .select('*')
        .order('created_at', { ascending: false });
      raise(error);
      return (data ?? []) as SystemBackupRecord[];
    },
  });
}

/** توليد وتصدير نسخة احتياطية شاملة مع التنزيل الفوري للمتصفح */
export function useGenerateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      backupType = 'manual',
      notes,
      autoDownload = true,
    }: {
      backupType?: BackupType;
      notes?: string;
      autoDownload?: boolean;
    } = {}) => {
      const { data, error } = await supabase.rpc('generate_system_backup_json', {
        p_backup_type: backupType,
        p_notes: notes ?? null,
      });
      raise(error);

      const payload = data as SystemBackupPayload;

      if (autoDownload && payload) {
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = payload.manifest?.file_name || `backup_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      return payload;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.systemBackups });
      qc.invalidateQueries({ queryKey: qk.activity });
    },
  });
}

/** حذف سجل نسخة احتياطية من قبل مدير النظام */
export function useDeleteBackupRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (backupId: UUID) => {
      const { data, error } = await supabase.rpc('delete_system_backup_record', {
        p_backup_id: backupId,
      });
      raise(error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.systemBackups });
      qc.invalidateQueries({ queryKey: qk.activity });
    },
  });
}

/** فحص وتدقيق حزمة النسخة الاحتياطية قبل الاستعادة */
export function useValidateBackupPayload() {
  return useMutation({
    mutationFn: async (payload: SystemBackupPayload) => {
      const { data, error } = await supabase.rpc('validate_system_backup_payload', {
        p_payload: payload,
      });
      raise(error);
      return data as BackupValidationResult;
    },
  });
}

/** استعادة شاملة وذرية للنظام من حزمة النسخة الاحتياطية */
export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      payload,
      createSafetySnapshot = true,
    }: {
      payload: SystemBackupPayload;
      createSafetySnapshot?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('restore_system_backup', {
        p_payload: payload,
        p_create_safety_snapshot: createSafetySnapshot,
      });
      raise(error);
      return data as RestoreBackupResult;
    },
    onSuccess: () => {
      // إبطال كافة استعلامات النظام لإعادة جلب البيانات المحدثة
      qc.invalidateQueries();
    },
  });
}




