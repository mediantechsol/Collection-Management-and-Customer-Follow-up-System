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
  AppNotification,
  AppSettings,
  AppUser,
  Collection,
  Customer,
  CustomerCategory,
  CustomerOverview,
  ExcelImport,
  Followup,
  Incentive,
  IncentivePayment,
  ImportBalancesResult,
  ImportCustomersResult,
  Role,
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
    },
    onSuccess: (_d, values) => {
      qc.invalidateQueries({ queryKey: qk.followups(values.customer_id) });
      qc.invalidateQueries({ queryKey: qk.followups() });
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
    },
  });
}
