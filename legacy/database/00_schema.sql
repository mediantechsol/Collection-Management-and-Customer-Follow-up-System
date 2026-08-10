-- ============================================================================
-- نظام إدارة التحصيل ومتابعة العملاء — المخطط الأساسي (Schema)
-- المحرك المستهدف: PostgreSQL 15+ (متوافق مع Supabase)
-- هذا الملف يُنشئ الجداول فقط. المصادقة في 01_link_auth.sql،
-- وسياسات الوصول (RLS) في 02_rls_policies.sql، وبيانات تجريبية في 03_seed_data.sql.
-- شغّل الملفات بهذا الترتيب بالضبط.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) الأدوار الثابتة
-- أربعة أدوار فقط حسب مواصفات النظام الأصلية. لو احتجت دوراً خامساً مستقبلاً
-- أضفه هنا بدل تغيير الكود، فالكود يقرأ اسم الدور من هذا الجدول.
-- ----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  name_role   text not null unique check (name_role in ('مدير النظام','المحاسب','مسؤول التحصيل','مستخدم مخصص')),
  created_at  timestamptz not null default now()
);
-- الأدوار الأربعة أساسية للنظام (وليست بيانات تجريبية) — يعتمد عليها
-- trigger ربط المصادقة بالملف التالي 01_link_auth.sql، فيجب إدراجها هنا.
insert into public.roles(name_role) values
  ('مدير النظام'),('المحاسب'),('مسؤول التحصيل'),('مستخدم مخصص');

-- ----------------------------------------------------------------------------
-- 2) الشاشات المتاحة بالنظام (مرجع - Reference Table)
-- بدل تكرار قائمة الشاشات كنص حر بكل مكان، نجعلها جدولاً مرجعياً واحداً.
-- ----------------------------------------------------------------------------
create table public.app_screens (
  key    text primary key,
  label  text not null
);
insert into public.app_screens(key,label) values
  ('dashboard','لوحة المدير'),
  ('followups','متابعة العملاء'),
  ('customers','العملاء'),
  ('notifications','التنبيهات'),
  ('import','استيراد Excel'),
  ('performance','الأداء والحوافز'),
  ('users','المستخدمون والصلاحيات');

-- ----------------------------------------------------------------------------
-- 3) المستخدمون
-- id هنا هو نفسه auth.users.id (يُربط في 01_link_auth.sql). لا يوجد عمود
-- password هنا إطلاقاً — كلمات المرور تُدار حصراً عبر Supabase Auth.
-- allowed_screens / allowed_category_ids / screen_permissions تطابق حرفياً
-- نفس بنية البيانات المستخدمة بالواجهة الحالية (jsonb لأقصى مرونة مستقبلية).
-- ----------------------------------------------------------------------------
create table public.users (
  id                    uuid primary key,  -- = auth.users.id
  full_name             text not null,
  username              text not null unique,
  phone                 text,
  role_id               uuid not null references public.roles(id),
  status                text not null default 'نشط' check (status in ('نشط','موقوف')),
  allowed_screens        text[] not null default array['dashboard','followups','customers','notifications','import','performance','users'],
  allowed_category_ids   uuid[] not null default '{}',
  -- شكل screen_permissions: { "customers": {"actions": {"create": true}, "hidden_fields": ["status_customer"]}, ... }
  screen_permissions    jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_users_role on public.users(role_id);

-- ----------------------------------------------------------------------------
-- 4) فئات العملاء
-- ----------------------------------------------------------------------------
create table public.customer_categories (
  id              uuid primary key default gen_random_uuid(),
  category_name   text not null,
  color           text not null default '#2563EB',
  incentive_rate  numeric(6,3) not null default 0,   -- نسبة % تُستخدم في حساب الحافز
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5) العملاء
-- ----------------------------------------------------------------------------
create table public.customers (
  id                    uuid primary key default gen_random_uuid(),
  customer_number       text not null unique,
  customer_name         text not null,
  mobile_1              text,
  mobile_2              text,
  guarantor             text,               -- الضامن / الضمانة
  status_customer       text,               -- نص حر مثل "يسوق الآن"
  customer_category_id  uuid references public.customer_categories(id) on delete set null,
  description           text,
  assigned_user_id      uuid references public.users(id) on delete set null,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_customers_assigned on public.customers(assigned_user_id);
create index idx_customers_category on public.customers(customer_category_id);
create index idx_customers_active on public.customers(is_active);

-- ----------------------------------------------------------------------------
-- 6) الأرصدة (متعددة العملات لكل عميل)
-- الرصيد الفعلي = مجموع (مدين - دائن) لكل عملة على حدة، تحويل الإجمالي لليمني
-- يتم بمعادلة calc_total_due_yer أدناه (مطابقة لـ calcTotalDueYER بالواجهة).
-- ----------------------------------------------------------------------------
create table public.balances (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  currency      text not null check (currency in ('YER','USD','SAR')),
  debit         numeric(18,2) not null default 0,
  credit        numeric(18,2) not null default 0,
  import_id     uuid,  -- FK إلى excel_imports يُضاف لاحقاً بالأسفل (الجدول يُنشأ بعد هذا بقليل)
  created_at    timestamptz not null default now()
);
create index idx_balances_customer on public.balances(customer_id);
create index idx_balances_currency on public.balances(currency);

-- ----------------------------------------------------------------------------
-- 7) تواريخ الاستحقاق ومهل السداد
-- new_due_date = due_date + (grace_1+grace_2+grace_3) أيام — محسوبة، غير مخزّنة،
-- عبر الدالة calc_new_due_date أدناه، تطابقاً لمنطق الواجهة (لا تكرار بيانات).
-- ----------------------------------------------------------------------------
create table public.due_dates (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers(id) on delete cascade,
  due_date           date not null,
  grace_1            integer not null default 0,
  grace_2            integer not null default 0,
  grace_3            integer not null default 0,
  assigned_user_id   uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique(customer_id)   -- عميل واحد = سجل استحقاق واحد نشط بالنموذج الحالي
);

-- ----------------------------------------------------------------------------
-- 8) المتابعات
-- ----------------------------------------------------------------------------
create table public.followups (
  id                          uuid primary key default gen_random_uuid(),
  customer_id                 uuid not null references public.customers(id) on delete cascade,
  user_id                     uuid not null references public.users(id),
  followup_date               date not null default current_date,
  followup_time               time,
  type_followup               text not null check (type_followup in ('اتصال','واتساب','زيارة','أخرى')),
  contact_result              text,
  next_followup_date          date,
  details                     text,
  description_customer        text,
  level_seriousness           text check (level_seriousness in ('عالي','متوسط','منخفض')),
  expected_collection_amount  numeric(18,2) not null default 0,
  created_at                  timestamptz not null default now()
);
create index idx_followups_customer on public.followups(customer_id);
create index idx_followups_user on public.followups(user_id);
create index idx_followups_next on public.followups(next_followup_date);

-- ----------------------------------------------------------------------------
-- 9) التنبيهات
-- الأنواع الستة المعتمدة (خمسة تلقائية + واحد يدوي "يحتاج مراجعة المدير")
-- ----------------------------------------------------------------------------
create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers(id) on delete cascade,
  user_id            uuid references public.users(id) on delete set null,
  notification_type  text not null check (notification_type in (
                        'قبل الاستحقاق بـ 3 أيام','يوم الاستحقاق','يسوق الآن',
                        'وعد بالسداد اليوم','لم تتم متابعته منذ مدة','يحتاج مراجعة المدير'
                      )),
  notification_date  date not null default current_date,
  status             text not null default 'جديد' check (status in ('جديد','تم التعامل')),
  created_at         timestamptz not null default now(),
  -- يمنع تكرار نفس التنبيه لنفس العميل بنفس اليوم (مطابق لفحص "exists" بالواجهة)
  unique(customer_id, notification_type, notification_date)
);
create index idx_notifications_user on public.notifications(user_id);
create index idx_notifications_date on public.notifications(notification_date);

-- ----------------------------------------------------------------------------
-- 10) الحوافز والمدفوعات
-- ⚠️ نقطة قرار عمل لم تُحسم بعد في النموذج الأولي: الواجهة تعرض incentives و
-- incentivePayments لكنها لا تحتوي شاشة لإنشاء سجل حافز فعلي (المصفوفتان تبدآن
-- فارغتين ولا يوجد زر "إضافة حافز"). صُممت الجداول بما يطابق حقول الحساب
-- الموجودة (calcIncentiveAmount) لكن يجب على من يكمل المشروع أن يقرر: هل يُنشأ
-- سجل الحافز تلقائياً عند تسجيل تحصيل فعلي، أم يدوياً من المحاسب؟ فصّلنا هذا
-- في PROMPT.md تحت "قرارات عمل معلّقة".
-- ----------------------------------------------------------------------------
create table public.incentives (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id),
  customer_id        uuid references public.customers(id) on delete set null,
  followup_id        uuid references public.followups(id) on delete set null,
  collected_amount   numeric(18,2) not null,
  incentive_rate     numeric(6,3) not null,
  incentive_amount   numeric(18,2) not null,  -- = collected_amount * incentive_rate / 100
  period_month       date not null default date_trunc('month', current_date),
  created_at         timestamptz not null default now()
);
create index idx_incentives_user on public.incentives(user_id);

create table public.incentive_payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id),
  amount        numeric(18,2) not null,
  payment_date  date not null default current_date,
  notes         text,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now()
);
create index idx_incentive_payments_user on public.incentive_payments(user_id);

-- ----------------------------------------------------------------------------
-- 11) عمليات استيراد Excel
-- ----------------------------------------------------------------------------
create table public.excel_imports (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null,
  file_type     text not null default 'balances',
  imported_by   uuid references public.users(id),
  import_date   timestamptz not null default now(),
  status        text not null default 'نجاح' check (status in ('نجاح','تحذير','فشل')),
  notes         text
);

-- الآن نضيف الـ FK المؤجّل من balances → excel_imports
alter table public.balances
  add constraint fk_balances_import foreign key (import_id) references public.excel_imports(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 12) سجل العمليات (Audit Log)
-- ----------------------------------------------------------------------------
create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id) on delete set null,
  action_type  text not null,   -- create / update / import / escalate / login / logout
  table_name   text not null,
  record_id    text,
  old_value    jsonb,
  new_value    jsonb,
  created_at   timestamptz not null default now()
);
create index idx_activity_user on public.activity_logs(user_id);
create index idx_activity_created on public.activity_logs(created_at desc);

-- ----------------------------------------------------------------------------
-- 13) إعدادات النظام (سجل واحد فقط - Singleton)
-- ----------------------------------------------------------------------------
create table public.settings (
  id                     boolean primary key default true check (id),  -- يضمن سطراً واحداً فقط
  exchange_rate_usd      numeric(12,4) not null default 530,
  exchange_rate_sar      numeric(12,4) not null default 141,
  no_followup_days_limit integer not null default 14,
  updated_at             timestamptz not null default now()
);
insert into public.settings(id) values (true);

-- ============================================================================
-- دوال منطق العمل (Business Logic) — نقل مباشر ومطابق حرفياً للدوال الصافية
-- بالواجهة (daysBetween / addDays / calcNewDueDate / calcRemainingDays /
-- calcTotalDueYER / calcIncentiveAmount) حتى لا يتكرر المنطق بمكانين مختلفين
-- بشكل غير متطابق.
-- ============================================================================
create or replace function public.calc_new_due_date(p_due_date date, p_g1 int, p_g2 int, p_g3 int)
returns date language sql immutable as $$
  select p_due_date + (coalesce(p_g1,0)+coalesce(p_g2,0)+coalesce(p_g3,0)) * interval '1 day';
$$;

create or replace function public.calc_remaining_days(p_new_due_date date, p_today date default current_date)
returns integer language sql immutable as $$
  select (p_new_due_date - p_today)::integer;
$$;

create or replace function public.calc_total_due_yer(p_usd numeric, p_sar numeric, p_yer numeric, p_rate_usd numeric, p_rate_sar numeric)
returns numeric language sql immutable as $$
  select coalesce(p_usd,0)*coalesce(p_rate_usd,0) + coalesce(p_sar,0)*coalesce(p_rate_sar,0) + coalesce(p_yer,0);
$$;

create or replace function public.calc_incentive_amount(p_amount numeric, p_rate numeric)
returns numeric language sql immutable as $$
  select coalesce(p_amount,0) * coalesce(p_rate,0) / 100;
$$;

-- ============================================================================
-- عرض مساعد: رصيد كل عميل الحالي بكل عملة + الإجمالي بالريال (يطابق
-- customerBalances() + customerTotalYER() بالواجهة). يبسّط الاستعلامات
-- بلوحة المدير وشاشة العملاء بدل تكرار GROUP BY في كل مكان.
-- ============================================================================
create or replace view public.customer_balances_view as
select
  c.id as customer_id,
  coalesce(sum(b.debit-b.credit) filter (where b.currency='USD'),0) as usd,
  coalesce(sum(b.debit-b.credit) filter (where b.currency='SAR'),0) as sar,
  coalesce(sum(b.debit-b.credit) filter (where b.currency='YER'),0) as yer,
  public.calc_total_due_yer(
    coalesce(sum(b.debit-b.credit) filter (where b.currency='USD'),0),
    coalesce(sum(b.debit-b.credit) filter (where b.currency='SAR'),0),
    coalesce(sum(b.debit-b.credit) filter (where b.currency='YER'),0),
    (select exchange_rate_usd from public.settings limit 1),
    (select exchange_rate_sar from public.settings limit 1)
  ) as total_due_yer
from public.customers c
left join public.balances b on b.customer_id = c.id
group by c.id;

-- ============================================================================
-- عرض مساعد: تاريخ الاستحقاق الجديد والأيام المتبقية لكل عميل
-- (يطابق customerDueComputed() بالواجهة)
-- ============================================================================
create or replace view public.customer_due_view as
select
  d.customer_id,
  d.due_date,
  d.grace_1, d.grace_2, d.grace_3,
  public.calc_new_due_date(d.due_date, d.grace_1, d.grace_2, d.grace_3) as new_due_date,
  public.calc_remaining_days(public.calc_new_due_date(d.due_date, d.grace_1, d.grace_2, d.grace_3)) as remaining_days
from public.due_dates d;

-- ============================================================================
-- trigger عام لتحديث updated_at تلقائياً
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated before update on public.users
  for each row execute function public.set_updated_at();
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();
create trigger trg_due_dates_updated before update on public.due_dates
  for each row execute function public.set_updated_at();
