/**
 * أنواع كيانات النظام — مطابقة لجداول supabase/migrations/.
 *
 * ملاحظة: بمجرد ربط مشروع Supabase شغّل `npm run gen:types` لتوليد
 * src/types/database.ts آلياً من المخطط الفعلي، واستبدل هذه الأنواع به.
 * هذا الملف يبقيها متاحة الآن قبل وجود مشروع مرتبط.
 */

import type { Currency } from '@/lib/logic/money';
export type { Currency };
import type { RoleName, ScreenKey, ScreenPermissions } from '@/lib/permissions';
import type { NotificationType } from '@/lib/logic/notifications';

export type UUID = string;
export type ISODate = string;      // YYYY-MM-DD
export type ISODateTime = string;

export type UserStatus = 'نشط' | 'موقوف';
export type FollowupType = 'اتصال' | 'واتساب' | 'زيارة' | 'أخرى';
export type Seriousness = 'عالي' | 'متوسط' | 'منخفض';
export type NotificationStatus = 'جديد' | 'تم التعامل';
export type ImportStatus = 'نجاح' | 'تحذير' | 'فشل';
export type CollectionSource = 'import' | 'manual';

export interface Role {
  id: UUID;
  name_role: RoleName;
}

export interface AppUser {
  id: UUID;
  full_name: string;
  username: string;
  phone: string | null;
  role_id: UUID;
  status: UserStatus;
  allowed_screens: ScreenKey[];
  allowed_category_ids: UUID[];
  screen_permissions: ScreenPermissions;
  created_at: ISODateTime;
}

/** سطر من العرض user_directory — متاح لكل مستخدم لعرض أسماء المسؤولين. */
export interface UserDirectoryEntry {
  id: UUID;
  full_name: string;
  username: string;
  status: UserStatus;
  name_role: RoleName;
}

export interface CustomerCategory {
  id: UUID;
  category_name: string;
  color: string;
  incentive_rate: number;
  is_active: boolean;
}

export interface Customer {
  id: UUID;
  customer_number: string;
  customer_name: string;
  mobile_1: string | null;
  mobile_2: string | null;
  guarantor: string | null;
  status_customer: string | null;
  customer_category_id: UUID | null;
  description: string | null;
  assigned_user_id: UUID | null;
  is_active: boolean;
}

/**
 * سطر من العرض customer_overview_view — يجمع العميل وفئته وأرصدته واستحقاقه
 * وآخر متابعة في استعلام واحد، بدل استدعاءات N+1 التي كانت في النموذج الأولي.
 */
export interface CustomerOverview extends Customer {
  category_name: string | null;
  category_color: string | null;
  incentive_rate: number | null;
  usd: number;
  sar: number;
  yer: number;
  total_due_yer: number;
  due_date: ISODate | null;
  grace_1: number | null;
  grace_2: number | null;
  grace_3: number | null;
  new_due_date: ISODate | null;
  remaining_days: number | null;
  last_followup_date: ISODate | null;
  last_next_followup_date: ISODate | null;
  last_followup_details: string | null;
  last_contact_result: string | null;
}

export interface Balance {
  id: UUID;
  customer_id: UUID;
  currency: Currency;
  debit: number;
  credit: number;
  updated_at: ISODateTime;
}

export interface DueDate {
  id: UUID;
  customer_id: UUID;
  due_date: ISODate;
  grace_1: number;
  grace_2: number;
  grace_3: number;
  note_1: string | null;
  note_2: string | null;
}

export interface Followup {
  id: UUID;
  customer_id: UUID;
  user_id: UUID;
  followup_date: ISODate;
  followup_time: string | null;
  type_followup: FollowupType;
  contact_result: string | null;
  next_followup_date: ISODate | null;
  details: string | null;
  description_customer: string | null;
  level_seriousness: Seriousness | null;
  expected_collection_amount: number;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at: ISODateTime;
}

export interface AppNotification {
  id: UUID;
  customer_id: UUID;
  user_id: UUID | null;
  notification_type: NotificationType;
  notification_date: ISODate;
  status: NotificationStatus;
  created_by: UUID | null;
  handled_by: UUID | null;
  handled_at: ISODateTime | null;
}

/** الدفعة المحصّلة فعلياً — الجدول الذي لم يكن موجوداً في النموذج الأولي. */
export interface Collection {
  id: UUID;
  customer_id: UUID;
  user_id: UUID | null;
  currency: Currency;
  amount: number;
  rate_used: number;
  amount_yer: number;
  collected_date: ISODate;
  source: CollectionSource;
  import_id: UUID | null;
  note: string | null;
  created_by: UUID | null;
  confirmed_by: UUID | null;
  confirmed_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface Incentive {
  id: UUID;
  collection_id: UUID | null;
  user_id: UUID;
  customer_id: UUID | null;
  collected_amount: number;
  incentive_rate: number;
  incentive_amount: number;
  period_month: ISODate;
}

export interface IncentivePayment {
  id: UUID;
  user_id: UUID;
  amount: number;
  payment_date: ISODate;
  notes: string | null;
  created_by: UUID | null;
}

export interface ExcelImport {
  id: UUID;
  file_name: string;
  file_type: 'balances' | 'customers';
  imported_by: UUID | null;
  import_date: ISODateTime;
  status: ImportStatus;
  rows_count: number;
  notes: string | null;
}

export interface ActivityLog {
  id: UUID;
  user_id: UUID | null;
  action_type: string;
  table_name: string;
  record_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: ISODateTime;
}

export interface CurrencyConfig {
  code: Currency;
  name: string;
  symbol: string;
  rate: number;
  is_base: boolean;
  is_active: boolean;
}

export interface AppSettings {
  id: boolean;
  company_name?: string;
  system_name?: string;
  language?: string;
  direction?: string;
  date_format?: string;
  exchange_rate_usd: number;
  exchange_rate_sar: number;
  no_followup_days_limit: number;
  days_before_due_alert: number;
  overdue_alert_days: number;
  shopping_status_label: string;
  promise_keyword: string;
  internal_email_domain: string;
  alert_due_soon_enabled?: boolean;
  alert_due_today_enabled?: boolean;
  alert_shopping_now_enabled?: boolean;
  alert_promise_enabled?: boolean;
  alert_stale_enabled?: boolean;
  alert_escalated_enabled?: boolean;
  currencies_config?: CurrencyConfig[];
}

/* ---------------------------------------------------------------- نتائج الـ RPC */

export interface ImportBalancesResult {
  import_id: UUID;
  rows: number;
  new_customers: number;
  collections: number;
}

export interface ImportCustomersResult {
  import_id: UUID;
  rows: number;
  new_customers: number;
  due_dates: number;
  unmatched_assignees: string[];
  new_categories?: number;
}

/* ---------------------------------------------------------------- نماذج التقارير التحليلية */

export interface AnalyticsFilters {
  startDate?: ISODate;
  endDate?: ISODate;
  userId?: UUID;
  categoryId?: UUID;
  currency?: Currency | 'ALL';
}

export interface AnalyticsKPIs {
  total_debt_yer: number;
  total_collected_period_yer: number;
  active_customers_count: number;
  overdue_customers_count: number;
  settled_customers_count: number;
  team_collection_rate: number;
}

export interface CurrencyDistributionItem {
  currency: Currency;
  currency_name: string;
  amount_original: number;
  amount_yer: number;
  percentage: number;
}

export interface CustomerStatusDistributionItem {
  status: 'active' | 'overdue' | 'settled';
  status_label: string;
  count: number;
  percentage: number;
}

export interface CollectorPerformanceItem {
  user_id: UUID;
  collector_name: string;
  total_due_yer: number;
  total_collected_yer: number;
  customer_count: number;
  collection_rate: number;
}

export interface MonthlyTrendItem {
  month: string;
  month_label: string;
  collected_yer: number;
  target_or_due_yer: number;
  collection_rate: number;
}

export interface CategoryDebtItem {
  category_id: UUID | null;
  category_name: string;
  category_color: string;
  total_debt_yer: number;
  customer_count: number;
  percentage: number;
}

export interface TopDebtorItem {
  customer_id: UUID;
  customer_name: string;
  customer_number: string;
  category_name: string | null;
  category_color: string | null;
  assigned_user_name: string | null;
  total_due_yer: number;
  debt_percentage: number;
  status: 'active' | 'overdue' | 'settled';
}

export interface AnalyticsChartsData {
  debt_by_currency: CurrencyDistributionItem[];
  customers_by_status: CustomerStatusDistributionItem[];
  collector_performance: CollectorPerformanceItem[];
  monthly_collection_trend: MonthlyTrendItem[];
  category_debt: CategoryDebtItem[];
  top_10_debtors: TopDebtorItem[];
}

/* ---------------------------------------------------------------- التصنيف الشخصي للمحصل (V2) */

export type PersonalTierKey = 'A' | 'B' | 'C' | 'D';

export interface CollectorTierSetting {
  id: UUID;
  user_id: UUID;
  tier_key: PersonalTierKey;
  tier_name: string;
  color: string;
  sort_order: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CustomerPersonalAssignment {
  id: UUID;
  user_id: UUID;
  customer_id: UUID;
  tier_key: PersonalTierKey;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/* ---------------------------------------------------------------- التذكيرات الحرة المخصصة "ذكرني" (V2) */

export type ReminderPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CustomReminder {
  id: UUID;
  user_id: UUID;
  customer_id?: UUID | null;
  customer_name?: string | null;
  customer_number?: string | null;
  title: string;
  notes?: string | null;
  due_date: ISODate;
  due_time?: string | null;
  priority: ReminderPriority;
  is_completed: boolean;
  completed_at?: ISODateTime | null;
  snoozed_until?: ISODate | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CreateReminderInput {
  customerId?: UUID | null;
  title: string;
  notes?: string | null;
  dueDate: ISODate;
  dueTime?: string | null;
  priority?: ReminderPriority;
}

/* ---------------------------------------------------------------- النسخ الاحتياطي والاستعادة (V2) */

export type BackupType = 'manual' | 'auto_scheduled' | 'safety_pre_restore';

export interface SystemBackupRecord {
  id: UUID;
  backup_name: string;
  file_name: string;
  file_size_bytes: number;
  storage_path?: string | null;
  backup_type: BackupType;
  checksum_sha256: string;
  table_counts: Record<string, number>;
  notes?: string | null;
  created_by?: UUID | null;
  created_at: ISODateTime;
}

export interface BackupPayloadManifest {
  format_version: string;
  app_version: string;
  backup_type: BackupType;
  backup_id: string;
  backup_name: string;
  file_name: string;
  checksum_sha256: string;
  created_at: string;
  created_by_username: string;
  created_by_user_id: string;
  notes?: string | null;
  table_counts: Record<string, number>;
}

export interface SystemBackupPayload {
  manifest: BackupPayloadManifest;
  tables: {
    settings: any[];
    customer_categories: any[];
    customers: any[];
    balances: any[];
    balance_history: any[];
    due_dates: any[];
    followups: any[];
    collections: any[];
    incentives: any[];
    incentive_payments: any[];
    notifications: any[];
    excel_imports: any[];
    collector_tier_settings: any[];
    customer_personal_assignments: any[];
    custom_reminders: any[];
  };
}

export interface BackupValidationResult {
  is_valid: boolean;
  manifest: BackupPayloadManifest;
  table_counts: Record<string, number>;
  current_database_counts: {
    customers: number;
    balances: number;
    followups: number;
    collections: number;
    custom_reminders: number;
  };
}

export interface RestoreBackupResult {
  success: boolean;
  message: string;
  restored_counts: Record<string, number>;
  safety_snapshot_id?: string;
}
