/**
 * أنواع كيانات النظام — مطابقة لجداول supabase/migrations/.
 *
 * ملاحظة: بمجرد ربط مشروع Supabase شغّل `npm run gen:types` لتوليد
 * src/types/database.ts آلياً من المخطط الفعلي، واستبدل هذه الأنواع به.
 * هذا الملف يبقيها متاحة الآن قبل وجود مشروع مرتبط.
 */

import type { Currency } from '@/lib/logic/money';
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

export interface AppSettings {
  id: boolean;
  exchange_rate_usd: number;
  exchange_rate_sar: number;
  no_followup_days_limit: number;
  days_before_due_alert: number;
  overdue_alert_days: number;
  shopping_status_label: string;
  promise_keyword: string;
  internal_email_domain: string;
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
}
