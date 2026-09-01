-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name_role text NOT NULL UNIQUE CHECK (name_role = ANY (ARRAY['مدير النظام'::text, 'المحاسب'::text, 'مسؤول التحصيل'::text, 'مستخدم مخصص'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_screens (
  key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT app_screens_pkey PRIMARY KEY (key)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  full_name text NOT NULL,
  username text NOT NULL UNIQUE,
  phone text,
  role_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'نشط'::text CHECK (status = ANY (ARRAY['نشط'::text, 'موقوف'::text])),
  allowed_screens ARRAY NOT NULL DEFAULT ARRAY['dashboard'::text, 'followups'::text, 'customers'::text, 'notifications'::text, 'collections'::text, 'import'::text, 'performance'::text, 'users'::text],
  allowed_category_ids ARRAY NOT NULL DEFAULT '{}'::uuid[],
  screen_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id),
  CONSTRAINT fk_users_auth FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.customer_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_name text NOT NULL,
  color text NOT NULL DEFAULT '#2563EB'::text,
  incentive_rate numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  mobile_1 text,
  mobile_2 text,
  guarantor text,
  status_customer text,
  customer_category_id uuid,
  description text,
  assigned_user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id),
  CONSTRAINT customers_customer_category_id_fkey FOREIGN KEY (customer_category_id) REFERENCES public.customer_categories(id)
);
CREATE TABLE public.excel_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_type text NOT NULL DEFAULT 'balances'::text CHECK (file_type = ANY (ARRAY['balances'::text, 'customers'::text])),
  imported_by uuid,
  import_date timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'نجاح'::text CHECK (status = ANY (ARRAY['نجاح'::text, 'تحذير'::text, 'فشل'::text])),
  rows_count integer NOT NULL DEFAULT 0,
  notes text,
  CONSTRAINT excel_imports_pkey PRIMARY KEY (id),
  CONSTRAINT excel_imports_imported_by_fkey FOREIGN KEY (imported_by) REFERENCES public.users(id)
);
CREATE TABLE public.balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  currency text NOT NULL CHECK (currency = ANY (ARRAY['YER'::text, 'USD'::text, 'SAR'::text])),
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  last_import_id uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT balances_pkey PRIMARY KEY (id),
  CONSTRAINT balances_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT balances_last_import_id_fkey FOREIGN KEY (last_import_id) REFERENCES public.excel_imports(id)
);
CREATE TABLE public.balance_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  currency text NOT NULL CHECK (currency = ANY (ARRAY['YER'::text, 'USD'::text, 'SAR'::text])),
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  prev_debit numeric NOT NULL DEFAULT 0,
  prev_credit numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT balance_history_pkey PRIMARY KEY (id),
  CONSTRAINT balance_history_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.excel_imports(id),
  CONSTRAINT balance_history_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.due_dates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE,
  due_date date NOT NULL,
  grace_1 integer NOT NULL DEFAULT 0,
  grace_2 integer NOT NULL DEFAULT 0,
  grace_3 integer NOT NULL DEFAULT 0,
  note_1 text,
  note_2 text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT due_dates_pkey PRIMARY KEY (id),
  CONSTRAINT due_dates_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.followups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  followup_date date NOT NULL DEFAULT CURRENT_DATE,
  followup_time time without time zone,
  type_followup text NOT NULL CHECK (type_followup = ANY (ARRAY['اتصال'::text, 'واتساب'::text, 'زيارة'::text, 'أخرى'::text])),
  contact_result text,
  next_followup_date date,
  details text,
  description_customer text,
  level_seriousness text CHECK (level_seriousness = ANY (ARRAY['عالي'::text, 'متوسط'::text, 'منخفض'::text])),
  expected_collection_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  attachment_url text,
  attachment_name text,
  CONSTRAINT followups_pkey PRIMARY KEY (id),
  CONSTRAINT followups_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT followups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.collections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  user_id uuid,
  currency text NOT NULL CHECK (currency = ANY (ARRAY['YER'::text, 'USD'::text, 'SAR'::text])),
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  rate_used numeric NOT NULL DEFAULT 1,
  amount_yer numeric NOT NULL,
  collected_date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual'::text CHECK (source = ANY (ARRAY['import'::text, 'manual'::text])),
  import_id uuid,
  note text,
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collections_pkey PRIMARY KEY (id),
  CONSTRAINT collections_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT collections_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.excel_imports(id),
  CONSTRAINT collections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT collections_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id)
);
CREATE TABLE public.incentives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collection_id uuid UNIQUE,
  user_id uuid NOT NULL,
  customer_id uuid,
  collected_amount numeric NOT NULL,
  incentive_rate numeric NOT NULL,
  incentive_amount numeric NOT NULL,
  period_month date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT incentives_pkey PRIMARY KEY (id),
  CONSTRAINT incentives_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id),
  CONSTRAINT incentives_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT incentives_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.incentive_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT incentive_payments_pkey PRIMARY KEY (id),
  CONSTRAINT incentive_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT incentive_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  user_id uuid,
  notification_type text NOT NULL CHECK (notification_type = ANY (ARRAY['before_due'::text, 'due_today'::text, 'shopping_now'::text, 'promise_today'::text, 'stale'::text, 'escalated'::text])),
  notification_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'جديد'::text CHECK (status = ANY (ARRAY['جديد'::text, 'تم التعامل'::text])),
  created_by uuid,
  handled_by uuid,
  handled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT notifications_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id)
);
CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action_type text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.settings (
  id boolean NOT NULL DEFAULT true CHECK (id),
  exchange_rate_usd numeric NOT NULL DEFAULT 530,
  exchange_rate_sar numeric NOT NULL DEFAULT 141,
  no_followup_days_limit integer NOT NULL DEFAULT 14,
  days_before_due_alert integer NOT NULL DEFAULT 3,
  overdue_alert_days integer NOT NULL DEFAULT 35,
  shopping_status_label text NOT NULL DEFAULT 'يسوق الآن'::text,
  promise_keyword text NOT NULL DEFAULT 'وعد'::text,
  internal_email_domain text NOT NULL DEFAULT 'dr-ayman.local'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  company_name text NOT NULL DEFAULT 'مكتب الدكتور أيمن لخدمات الدواجن'::text,
  system_name text NOT NULL DEFAULT 'Smart Collection Platform'::text,
  language text NOT NULL DEFAULT 'ar'::text,
  direction text NOT NULL DEFAULT 'rtl'::text,
  date_format text NOT NULL DEFAULT 'YYYY-MM-DD'::text,
  alert_due_soon_enabled boolean NOT NULL DEFAULT true,
  alert_due_today_enabled boolean NOT NULL DEFAULT true,
  alert_shopping_now_enabled boolean NOT NULL DEFAULT true,
  alert_promise_enabled boolean NOT NULL DEFAULT true,
  alert_stale_enabled boolean NOT NULL DEFAULT true,
  alert_escalated_enabled boolean NOT NULL DEFAULT true,
  currencies_config jsonb NOT NULL DEFAULT '[{"code": "YER", "name": "ريال يمني", "rate": 1, "symbol": "ر.ي", "is_base": true, "is_active": true}, {"code": "USD", "name": "دولار أمريكي", "rate": 530, "symbol": "$", "is_base": false, "is_active": true}, {"code": "SAR", "name": "ريال سعودي", "rate": 141, "symbol": "ر.س", "is_base": false, "is_active": true}]'::jsonb,
  CONSTRAINT settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.collector_tier_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier_key text NOT NULL CHECK (tier_key = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text])),
  tier_name text NOT NULL,
  color text NOT NULL DEFAULT '#6B7280'::text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collector_tier_settings_pkey PRIMARY KEY (id),
  CONSTRAINT collector_tier_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.customer_personal_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  tier_key text NOT NULL CHECK (tier_key = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_personal_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT customer_personal_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT customer_personal_assignments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.custom_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid,
  title text NOT NULL,
  notes text,
  due_date date NOT NULL,
  due_time time without time zone,
  priority text NOT NULL DEFAULT 'normal'::text CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])),
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  snoozed_until date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT custom_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT custom_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT custom_reminders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.system_backups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  backup_name text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text,
  backup_type text NOT NULL DEFAULT 'manual'::text CHECK (backup_type = ANY (ARRAY['manual'::text, 'auto_scheduled'::text, 'safety_pre_restore'::text])),
  checksum_sha256 text NOT NULL,
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT system_backups_pkey PRIMARY KEY (id),
  CONSTRAINT system_backups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);