-- ============================================================================
-- ملف الترحيل المدمج — نظام إدارة التحصيل ومتابعة العملاء
--
-- مولَّد آلياً من supabase/migrations/ — لا تُعدّله يدوياً.
-- عدّل الملف الأصلي في migrations/ ثم أعد التوليد:
--     bash supabase/build_migrate_all.sh
--
-- ── الترحيل عبر لوحة التحكم ────────────────────────────────────────────────
--  1) SQL Editor → New query → الصق هذا الملف كاملاً → Run
--  2) الصق supabase/seed.sql وشغّله (فئات افتراضية + الإعدادات)
--  3) فعّل pg_cron من Database → Extensions، ثم شغّل ملف
--     supabase/migrations/20260101000005_cron.sql وحده
--     (بدونه يعمل النظام، لكن التنبيهات تحتاج ضغط الزر يدوياً كل يوم)
--  4) أنشئ أول مدير نظام — خطوة 4 في docs/SETUP.md
--
-- ── ملاحظات ────────────────────────────────────────────────────────────────
--  • محرر SQL ينفّذ اللصقة كمعاملة واحدة: إما ينجح كل شيء أو لا شيء.
--  • يُشغَّل مرة واحدة على قاعدة بيانات فارغة. إعادة تشغيله على قاعدة مُرحَّلة
--    ستفشل عند أول جدول موجود — وهذا حاجز أمان مقصود يمنع الكتابة فوق بيانات
--    حقيقية، وليس خطأً يُلتفّ عليه.
-- ============================================================================



-- ############################################################################
-- ### 20260101000000_schema.sql
-- ############################################################################

-- ============================================================================
-- نظام إدارة التحصيل ومتابعة العملاء — المخطط الأساسي
-- المحرك: PostgreSQL 15+ (Supabase)
--
-- مبني على legacy/database/00_schema.sql مع إصلاحات جوهرية:
--   1) balances أصبح "الرصيد الحالي" بقيد فريد (customer_id, currency) بدل
--      الإلحاق عند كل استيراد — ملف Excel لقطة تراكمية كاملة، والإلحاق كان
--      يضاعف مديونية كل العملاء عند إعادة الاستيراد.
--   2) balance_history جديد: أرشيف كل استيراد ومصدر اشتقاق الدفعات المحصّلة.
--   3) collections جديد: الدفعات المحصّلة فعلياً (مصدر الحوافز).
--   4) notification_type أصبح مفاتيح ثابتة بدل نص عربي يحوي الرقم "3"،
--      حتى تصير عتبة التنبيه قابلة للضبط من الإعدادات.
--   5) settings تحوي الآن كل العتبات القابلة للضبط بدل تثبيتها بالكود.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) الأدوار الثابتة
-- ----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  name_role   text not null unique check (name_role in ('مدير النظام','المحاسب','مسؤول التحصيل','مستخدم مخصص')),
  created_at  timestamptz not null default now()
);
insert into public.roles(name_role) values
  ('مدير النظام'),('المحاسب'),('مسؤول التحصيل'),('مستخدم مخصص');

-- ----------------------------------------------------------------------------
-- 2) شاشات النظام (جدول مرجعي)
-- ----------------------------------------------------------------------------
create table public.app_screens (
  key    text primary key,
  label  text not null,
  sort_order int not null default 0
);
insert into public.app_screens(key,label,sort_order) values
  ('dashboard','لوحة المدير',1),
  ('followups','متابعة العملاء',2),
  ('customers','العملاء',3),
  ('notifications','التنبيهات',4),
  ('collections','الدفعات المحصّلة',5),
  ('import','استيراد Excel',6),
  ('performance','الأداء والحوافز',7),
  ('users','المستخدمون والصلاحيات',8);

-- ----------------------------------------------------------------------------
-- 3) المستخدمون — id = auth.users.id، ولا يوجد عمود password إطلاقاً
-- ----------------------------------------------------------------------------
create table public.users (
  id                    uuid primary key,
  full_name             text not null,
  username              text not null unique,
  phone                 text,
  role_id               uuid not null references public.roles(id),
  status                text not null default 'نشط' check (status in ('نشط','موقوف')),
  allowed_screens       text[] not null default array['dashboard','followups','customers','notifications','collections','import','performance','users'],
  allowed_category_ids  uuid[] not null default '{}',
  -- { "customers": {"actions":{"create":true}, "hidden_fields":["status_customer"]}, ... }
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
  incentive_rate  numeric(6,3) not null default 0,   -- نسبة % لحساب الحافز
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5) العملاء
-- customer_number يُخزَّن مطبَّعاً (بدون أصفار بادئة) — شيت "بيانات العملاء"
-- يكتبه '00001' وشيت "متابعة العملاء" يكتبه 1، والربط بينهما يفشل بدون تطبيع.
-- ----------------------------------------------------------------------------
create table public.customers (
  id                    uuid primary key default gen_random_uuid(),
  customer_number       text not null unique,
  customer_name         text not null,
  mobile_1              text,
  mobile_2              text,
  guarantor             text,
  status_customer       text,               -- نص حر: "يسوق الآن" / "مسدد" ...
  customer_category_id  uuid references public.customer_categories(id) on delete set null,
  description           text,
  assigned_user_id      uuid references public.users(id) on delete set null,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_customers_assigned on public.customers(assigned_user_id);
create index idx_customers_category on public.customers(customer_category_id);
create index idx_customers_active   on public.customers(is_active);
create index idx_customers_name     on public.customers(customer_name);

-- ----------------------------------------------------------------------------
-- 6) عمليات استيراد Excel (مُقدَّمة على balances لأن الأخيرة تشير إليها)
-- ----------------------------------------------------------------------------
create table public.excel_imports (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null,
  file_type     text not null default 'balances' check (file_type in ('balances','customers')),
  imported_by   uuid references public.users(id) on delete set null,
  import_date   timestamptz not null default now(),
  status        text not null default 'نجاح' check (status in ('نجاح','تحذير','فشل')),
  rows_count    integer not null default 0,
  notes         text
);
create index idx_excel_imports_date on public.excel_imports(import_date desc);

-- ----------------------------------------------------------------------------
-- 7) الأرصدة — الرصيد الحالي لكل (عميل، عملة). الرصيد = debit - credit
--    ⚠️ صف واحد فقط لكل عميل/عملة، يُحدَّث بـ upsert عند كل استيراد.
-- ----------------------------------------------------------------------------
create table public.balances (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete cascade,
  currency       text not null check (currency in ('YER','USD','SAR')),
  debit          numeric(18,2) not null default 0,
  credit         numeric(18,2) not null default 0,
  last_import_id uuid references public.excel_imports(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (customer_id, currency)
);
create index idx_balances_customer on public.balances(customer_id);

-- ----------------------------------------------------------------------------
-- 8) أرشيف الأرصدة — صف لكل (استيراد، عميل، عملة) مع القيم السابقة.
--    هذا هو مصدر اشتقاق الدفعات المحصّلة (فرق الدائن بين استيرادين).
-- ----------------------------------------------------------------------------
create table public.balance_history (
  id           uuid primary key default gen_random_uuid(),
  import_id    uuid not null references public.excel_imports(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  currency     text not null check (currency in ('YER','USD','SAR')),
  debit        numeric(18,2) not null default 0,
  credit       numeric(18,2) not null default 0,
  prev_debit   numeric(18,2) not null default 0,
  prev_credit  numeric(18,2) not null default 0,
  created_at   timestamptz not null default now(),
  unique (import_id, customer_id, currency)
);
create index idx_balance_history_customer on public.balance_history(customer_id);

-- ----------------------------------------------------------------------------
-- 9) تواريخ الاستحقاق والمهل
-- new_due_date = due_date + (grace_1+grace_2+grace_3) — محسوبة لا مخزّنة.
-- note_1/note_2 تقابلان عمودَي "ملاحظة" و"ملاحظة2" في شيت العميل.
-- ----------------------------------------------------------------------------
create table public.due_dates (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers(id) on delete cascade,
  due_date           date not null,
  grace_1            integer not null default 0,
  grace_2            integer not null default 0,
  grace_3            integer not null default 0,
  note_1             text,
  note_2             text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (customer_id)
);

-- ----------------------------------------------------------------------------
-- 10) المتابعات (سجل غير قابل للتعديل)
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
create index idx_followups_customer on public.followups(customer_id, followup_date desc);
create index idx_followups_user on public.followups(user_id);
create index idx_followups_next on public.followups(next_followup_date);

-- ----------------------------------------------------------------------------
-- 11) الدفعات المحصّلة فعلياً — الجدول المفقود في النموذج الأولي.
-- مصدره: عمود "المبالغ الواصلة (الجانب الدائن)" في شيت العميل الحقيقي.
--   source='import': مشتقّة آلياً من فرق الدائن بين استيرادين.
--   source='manual': يدخلها المحاسب مباشرة.
-- الحافز لا يُولَّد إلا بعد اعتماد الدفعة (confirmed_at).
-- ----------------------------------------------------------------------------
create table public.collections (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete cascade,
  user_id        uuid references public.users(id) on delete set null,  -- المحصِّل المنسوبة له
  currency       text not null check (currency in ('YER','USD','SAR')),
  amount         numeric(18,2) not null check (amount > 0),
  rate_used      numeric(12,4) not null default 1,
  amount_yer     numeric(18,2) not null,       -- amount * rate_used وقت التسجيل
  collected_date date not null default current_date,
  source         text not null default 'manual' check (source in ('import','manual')),
  import_id      uuid references public.excel_imports(id) on delete set null,
  note           text,
  created_by     uuid references public.users(id) on delete set null,
  confirmed_by   uuid references public.users(id) on delete set null,
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index idx_collections_customer on public.collections(customer_id);
create index idx_collections_user on public.collections(user_id, collected_date desc);
-- يمنع اشتقاق نفس الدفعة مرتين من نفس عملية الاستيراد
create unique index uq_collections_import
  on public.collections(import_id, customer_id, currency)
  where source = 'import';

-- ----------------------------------------------------------------------------
-- 12) الحوافز — تُولَّد آلياً من كل دفعة معتمدة (trigger أدناه)
-- ----------------------------------------------------------------------------
create table public.incentives (
  id                 uuid primary key default gen_random_uuid(),
  collection_id      uuid unique references public.collections(id) on delete cascade,
  user_id            uuid not null references public.users(id),
  customer_id        uuid references public.customers(id) on delete set null,
  collected_amount   numeric(18,2) not null,   -- بالريال اليمني
  incentive_rate     numeric(6,3) not null,
  incentive_amount   numeric(18,2) not null,   -- = collected_amount * rate / 100
  period_month       date not null,
  created_at         timestamptz not null default now()
);
create index idx_incentives_user on public.incentives(user_id, period_month);

create table public.incentive_payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id),
  amount        numeric(18,2) not null check (amount > 0),
  payment_date  date not null default current_date,
  notes         text,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index idx_incentive_payments_user on public.incentive_payments(user_id);

-- ----------------------------------------------------------------------------
-- 13) التنبيهات — مفاتيح ثابتة (العرض العربي مسؤولية الواجهة)
-- ----------------------------------------------------------------------------
create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers(id) on delete cascade,
  user_id            uuid references public.users(id) on delete set null,  -- null = موجّه للإدارة
  notification_type  text not null check (notification_type in (
                       'before_due','due_today','shopping_now','promise_today','stale','escalated'
                     )),
  notification_date  date not null default current_date,
  status             text not null default 'جديد' check (status in ('جديد','تم التعامل')),
  created_by         uuid references public.users(id) on delete set null,  -- من رفع الحالة (escalated)
  handled_by         uuid references public.users(id) on delete set null,
  handled_at         timestamptz,
  created_at         timestamptz not null default now(),
  unique (customer_id, notification_type, notification_date)
);
create index idx_notifications_user on public.notifications(user_id, status);
create index idx_notifications_date on public.notifications(notification_date desc);

-- ----------------------------------------------------------------------------
-- 14) سجل التدقيق — يُكتب عبر triggers داخل قاعدة البيانات فقط (غير قابل للتزوير)
-- ----------------------------------------------------------------------------
create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id) on delete set null,
  action_type  text not null,   -- create / update / import / escalate / login / logout / collect
  table_name   text not null,
  record_id    text,
  old_value    jsonb,
  new_value    jsonb,
  created_at   timestamptz not null default now()
);
create index idx_activity_user on public.activity_logs(user_id);
create index idx_activity_created on public.activity_logs(created_at desc);

-- ----------------------------------------------------------------------------
-- 15) الإعدادات (سجل واحد) — كل العتبات قابلة للضبط بدل تثبيتها بالكود
-- ----------------------------------------------------------------------------
create table public.settings (
  id                     boolean primary key default true check (id),
  exchange_rate_usd      numeric(12,4) not null default 530,
  exchange_rate_sar      numeric(12,4) not null default 141,
  no_followup_days_limit integer not null default 14,
  -- عتبة "قبل الاستحقاق بـ N أيام": النموذج الأولي ثبّتها 3، ومفتاح ألوان
  -- شيت العميل الحقيقي يقول 5 — تُحسم من هنا دون تعديل كود.
  days_before_due_alert  integer not null default 3,
  -- عتبة اعتبار العميل متعثّراً بشدة (مفتاح شيت العميل: "مرور 35 يوم")
  overdue_alert_days     integer not null default 35,
  shopping_status_label  text not null default 'يسوق الآن',
  promise_keyword        text not null default 'وعد',
  internal_email_domain  text not null default 'dr-ayman.local',
  updated_at             timestamptz not null default now()
);
insert into public.settings(id) values (true);

-- ============================================================================
-- دوال منطق العمل — مطابقة حرفياً لدوال الواجهة الصافية
-- (calcNewDueDate / calcRemainingDays / calcTotalDueYER / calcIncentiveAmount)
-- ============================================================================
create or replace function public.calc_new_due_date(p_due_date date, p_g1 int, p_g2 int, p_g3 int)
returns date language sql immutable as $$
  select p_due_date + (coalesce(p_g1,0)+coalesce(p_g2,0)+coalesce(p_g3,0));
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
  select round(coalesce(p_amount,0) * coalesce(p_rate,0) / 100, 2);
$$;

-- تطبيع رقم العميل: يزيل المسافات والأصفار البادئة حتى يتطابق '00001' مع 1
create or replace function public.normalize_customer_number(p_value text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(trim(p_value),''), '^0+(?=\d)', ''), '');
$$;

-- ============================================================================
-- Views مساعدة
-- ============================================================================
-- security_invoker: تُطبَّق RLS الخاصة بالمستخدم المستدعي على الجداول الأساسية
-- بدل صلاحيات مالك العرض، فلا يتسرّب رصيد عميل خارج نطاق صلاحية المستخدم.
create or replace view public.customer_balances_view
with (security_invoker = true) as
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

create or replace view public.customer_due_view
with (security_invoker = true) as
select
  d.customer_id,
  d.due_date,
  d.grace_1, d.grace_2, d.grace_3,
  public.calc_new_due_date(d.due_date, d.grace_1, d.grace_2, d.grace_3) as new_due_date,
  public.calc_remaining_days(public.calc_new_due_date(d.due_date, d.grace_1, d.grace_2, d.grace_3)) as remaining_days
from public.due_dates d;

-- العرض الرئيسي لشاشتَي "العملاء" و"متابعة العملاء": يجمع كل ما تحتاجه الجداول
-- في استعلام واحد بدل N+1 استدعاء من الواجهة. RLS على customers تُطبَّق تلقائياً
-- لأن هذا العرض security_invoker.
create or replace view public.customer_overview_view
with (security_invoker = true) as
select
  c.id,
  c.customer_number,
  c.customer_name,
  c.mobile_1,
  c.mobile_2,
  c.guarantor,
  c.status_customer,
  c.description,
  c.is_active,
  c.customer_category_id,
  c.assigned_user_id,
  cat.category_name,
  cat.color        as category_color,
  cat.incentive_rate,
  bal.usd, bal.sar, bal.yer, bal.total_due_yer,
  due.due_date, due.grace_1, due.grace_2, due.grace_3,
  due.new_due_date, due.remaining_days,
  lf.followup_date       as last_followup_date,
  lf.next_followup_date  as last_next_followup_date,
  lf.details             as last_followup_details,
  lf.contact_result      as last_contact_result
from public.customers c
left join public.customer_categories cat on cat.id = c.customer_category_id
left join public.customer_balances_view bal on bal.customer_id = c.id
left join public.customer_due_view due on due.customer_id = c.id
left join lateral (
  select f.followup_date, f.next_followup_date, f.details, f.contact_result
  from public.followups f
  where f.customer_id = c.id
  order by f.followup_date desc, f.created_at desc
  limit 1
) lf on true;

-- ============================================================================
-- الصلاحيات على الـ views
-- Supabase تمنح الوصول افتراضياً للجداول الجديدة، لكن نصرّح بها هنا لتبقى
-- صحيحة على أي بيئة. القراءة للمستخدم المسجّل فقط — و RLS الجداول الأساسية
-- تُطبَّق تلقائياً لأن هذه العروض security_invoker.
-- ============================================================================
revoke all on public.customer_balances_view  from public, anon;
revoke all on public.customer_due_view       from public, anon;
revoke all on public.customer_overview_view  from public, anon;

grant select on public.customer_balances_view  to authenticated;
grant select on public.customer_due_view       to authenticated;
grant select on public.customer_overview_view  to authenticated;

-- ============================================================================
-- Triggers عامة
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
create trigger trg_balances_updated before update on public.balances
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- توليد/إلغاء الحافز تلقائياً عند اعتماد/إلغاء اعتماد الدفعة
-- نسبة الحافز تُؤخذ من فئة العميل وقت الاعتماد.
-- ----------------------------------------------------------------------------
create or replace function public.sync_incentive_for_collection()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric(6,3);
begin
  if new.confirmed_at is null or new.user_id is null then
    delete from public.incentives where collection_id = new.id;
    return new;
  end if;

  select coalesce(cat.incentive_rate, 0) into v_rate
  from public.customers c
  left join public.customer_categories cat on cat.id = c.customer_category_id
  where c.id = new.customer_id;

  insert into public.incentives (
    collection_id, user_id, customer_id, collected_amount,
    incentive_rate, incentive_amount, period_month
  ) values (
    new.id, new.user_id, new.customer_id, new.amount_yer,
    coalesce(v_rate,0), public.calc_incentive_amount(new.amount_yer, coalesce(v_rate,0)),
    date_trunc('month', new.collected_date)::date
  )
  on conflict (collection_id) do update set
    user_id          = excluded.user_id,
    customer_id      = excluded.customer_id,
    collected_amount = excluded.collected_amount,
    incentive_rate   = excluded.incentive_rate,
    incentive_amount = excluded.incentive_amount,
    period_month     = excluded.period_month;

  return new;
end;
$$;

create trigger trg_collections_incentive
  after insert or update of confirmed_at, user_id, amount_yer, collected_date
  on public.collections
  for each row execute function public.sync_incentive_for_collection();


-- ############################################################################
-- ### 20260101000001_auth.sql
-- ############################################################################

-- ============================================================================
-- ربط public.users بمصادقة Supabase الحقيقية (auth.users) + دوال الصلاحيات
--
-- auth.users تديره Supabase (كلمات المرور والتشفير والجلسات).
-- public.users هو الملف الشخصي (الدور والصلاحيات)، مرتبط بنفس الـ id.
--
-- آلية الدخول المعتمدة: الموظف يكتب اسم المستخدم فقط، والواجهة تحوّله إلى
-- <username>@<internal_email_domain> قبل استدعاء signInWithPassword.
-- الموظفون لا يملكون بريداً إلكترونياً حقيقياً.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- إنشاء ملف شخصي تلقائياً لكل حساب مصادقة جديد، بأقل صلاحية ممكنة:
-- دور "مستخدم مخصص"، حالة "موقوف"، بدون أي شاشة — حتى يفعّله المدير صراحة.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_default_role uuid;
  v_username     text;
begin
  select id into v_default_role from public.roles where name_role = 'مستخدم مخصص' limit 1;
  v_username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1));

  insert into public.users (id, full_name, username, phone, role_id, status, allowed_screens, allowed_category_ids)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', v_username),
    v_username,
    new.raw_user_meta_data->>'phone',
    v_default_role,
    'موقوف',
    array[]::text[],
    array[]::uuid[]
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- حذف حساب المصادقة يحذف ملفه الشخصي
alter table public.users
  add constraint fk_users_auth foreign key (id) references auth.users(id) on delete cascade;

-- ============================================================================
-- دوال هوية وصلاحيات المستخدم الحالي — تُستخدم في RLS وفي الـ RPC
-- ============================================================================
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select r.name_role
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean language sql stable as $$
  select coalesce(public.current_role_name() = 'مدير النظام', false);
$$;
create or replace function public.is_accountant() returns boolean language sql stable as $$
  select coalesce(public.current_role_name() = 'المحاسب', false);
$$;
create or replace function public.is_collector() returns boolean language sql stable as $$
  select coalesce(public.current_role_name() = 'مسؤول التحصيل', false);
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'نشط' from public.users where id = auth.uid()), false);
$$;

create or replace function public.my_allowed_category_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce((select allowed_category_ids from public.users where id = auth.uid()), '{}'::uuid[]);
$$;

create or replace function public.has_screen_access(p_screen text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p_screen = any(allowed_screens) from public.users where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- الدالة المركزية لرؤية العميل — تطابق visibleCustomers() بالواجهة:
--   مدير/محاسب: كل العملاء.  مسؤول تحصيل: عملاؤه المعيَّن عليهم فقط.
--   ثم يُطبَّق قيد الفئة على الجميع (فارغ = كل الفئات).
-- تُستخدم في سياسات balances / due_dates / followups / collections بدل تكرار
-- الاستعلامات الفرعية، وتضمن أن المستخدم الموقوف لا يرى شيئاً.
-- ----------------------------------------------------------------------------
create or replace function public.can_see_customer(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.customers c
    where c.id = p_customer_id
      and (public.is_admin() or public.is_accountant() or c.assigned_user_id = auth.uid())
      and (
        array_length(public.my_allowed_category_ids(), 1) is null
        or c.customer_category_id = any(public.my_allowed_category_ids())
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- دليل المستخدمين — عرض مقروء لكل مسجّل دخول (الاسم فقط، لا صلاحيات).
-- ضروري لأن كل جدول في النظام يعرض عمود "المسؤول"، وسياسة users تمنع
-- مسؤول التحصيل من قراءة سطور غيره فتظهر الأسماء فارغة بدون هذا العرض.
-- ملاحظة: هذا العرض security definer عمداً (لا يمرر RLS جدول users).
-- ----------------------------------------------------------------------------
create or replace view public.user_directory as
select u.id, u.full_name, u.username, u.status, r.name_role
from public.users u
join public.roles r on r.id = u.role_id;

revoke all on public.user_directory from public, anon;
grant select on public.user_directory to authenticated;


-- ############################################################################
-- ### 20260101000002_rls.sql
-- ############################################################################

-- ============================================================================
-- سياسات الحماية على مستوى الصف (Row Level Security)
--
-- مبني على legacy/database/02_rls_policies.sql مع إصلاحات:
--   • is_active_user() مطبّقة على كل الجداول لا على customers فقط
--     (كان المستخدم الموقوف يقرأ المتابعات والتنبيهات والحوافز).
--   • can_see_customer() بدل الاستعلامات الفرعية المتكررة.
--   • activity_logs: مُنع الإدراج من الواجهة نهائياً (كان قابلاً للتزوير) —
--     يُكتب حصراً عبر triggers داخل قاعدة البيانات.
--   • notifications: لا إدراج مباشر إطلاقاً — عبر RPC فقط (توليد يومي/رفع حالة)،
--     وهذا يصلح فشل زر "رفع الحالة للمدير" الذي كانت السياسة القديمة ترفضه.
--
-- ملاحظة على hidden_fields: RLS تعمل على الصف لا العمود، فإخفاء الأعمدة يبقى
-- مسؤولية الواجهة (تجميلي وليس أمنياً). أي حقل حسّاس فعلاً يجب استبعاده من
-- الاستعلام نفسه أو عزله في جدول منفصل.
-- ============================================================================

alter table public.roles                enable row level security;
alter table public.app_screens          enable row level security;
alter table public.users                enable row level security;
alter table public.customer_categories  enable row level security;
alter table public.customers            enable row level security;
alter table public.balances             enable row level security;
alter table public.balance_history      enable row level security;
alter table public.due_dates            enable row level security;
alter table public.followups            enable row level security;
alter table public.notifications        enable row level security;
alter table public.collections          enable row level security;
alter table public.incentives           enable row level security;
alter table public.incentive_payments   enable row level security;
alter table public.excel_imports        enable row level security;
alter table public.activity_logs        enable row level security;
alter table public.settings             enable row level security;

-- ---------------------------------------------------------------- مرجعية
create policy roles_select on public.roles for select
  using (auth.uid() is not null);
create policy roles_write on public.roles for all
  using (public.is_admin()) with check (public.is_admin());

create policy screens_select on public.app_screens for select
  using (auth.uid() is not null);

create policy categories_select on public.customer_categories for select
  using (public.is_active_user());
create policy categories_write on public.customer_categories for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- users
-- كل مستخدم يقرأ سطره، والمدير يقرأ الجميع. الأسماء فقط تُقرأ للجميع عبر
-- العرض user_directory. التعديل للمدير حصراً.
create policy users_select on public.users for select
  using (public.is_admin() or id = auth.uid());
create policy users_insert on public.users for insert
  with check (public.is_admin());
create policy users_update on public.users for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- customers
create policy customers_select on public.customers for select using (
  public.is_active_user()
  and (public.is_admin() or public.is_accountant() or assigned_user_id = auth.uid())
  and (
    array_length(public.my_allowed_category_ids(), 1) is null
    or customer_category_id = any(public.my_allowed_category_ids())
  )
);
create policy customers_insert on public.customers for insert with check (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
);
create policy customers_update on public.customers for update using (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
) with check (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
);

-- ---------------------------------------------------------------- balances / history / due_dates
create policy balances_select on public.balances for select
  using (public.can_see_customer(customer_id));
create policy balances_write on public.balances for all
  using (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  with check (public.is_active_user() and (public.is_admin() or public.is_accountant()));

create policy balance_history_select on public.balance_history for select
  using (public.can_see_customer(customer_id));

create policy due_dates_select on public.due_dates for select
  using (public.can_see_customer(customer_id));
create policy due_dates_write on public.due_dates for all
  using (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  with check (public.is_active_user() and (public.is_admin() or public.is_accountant()));

-- ---------------------------------------------------------------- followups
-- سجل غير قابل للتعديل أو الحذف عمداً (لا سياسة update/delete).
create policy followups_select on public.followups for select
  using (public.can_see_customer(customer_id));
create policy followups_insert on public.followups for insert with check (
  public.can_see_customer(customer_id) and user_id = auth.uid()
);

-- ---------------------------------------------------------------- notifications
-- لا سياسة insert: التوليد اليومي ورفع الحالة يمران عبر RPC بـ security definer.
create policy notifications_select on public.notifications for select using (
  public.is_active_user() and (
    public.is_admin() or public.is_accountant()
    or user_id = auth.uid()
    or public.can_see_customer(customer_id)
  )
);
-- تعليم "تم التعامل": صاحب التنبيه أو الإدارة
create policy notifications_update on public.notifications for update using (
  public.is_active_user() and (public.is_admin() or public.is_accountant() or user_id = auth.uid())
) with check (
  public.is_active_user() and (public.is_admin() or public.is_accountant() or user_id = auth.uid())
);

-- ---------------------------------------------------------------- collections
-- المحصِّل يرى دفعاته وعملاءه، والإدارة ترى الكل وتُدخل وتعتمد.
create policy collections_select on public.collections for select using (
  public.is_active_user() and (
    public.is_admin() or public.is_accountant()
    or user_id = auth.uid()
    or public.can_see_customer(customer_id)
  )
);
create policy collections_write on public.collections for all
  using (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  with check (public.is_active_user() and (public.is_admin() or public.is_accountant()));

-- ---------------------------------------------------------------- incentives
create policy incentives_select on public.incentives for select using (
  public.is_active_user() and (public.is_admin() or public.is_accountant() or user_id = auth.uid())
);
-- لا كتابة مباشرة: تُولَّد آلياً من trigger اعتماد الدفعة.

create policy incentive_payments_select on public.incentive_payments for select using (
  public.is_active_user() and (public.is_admin() or public.is_accountant() or user_id = auth.uid())
);
create policy incentive_payments_write on public.incentive_payments for all
  using (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  with check (public.is_active_user() and (public.is_admin() or public.is_accountant()));

-- ---------------------------------------------------------------- excel_imports
create policy excel_imports_select on public.excel_imports for select using (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
);

-- ---------------------------------------------------------------- activity_logs
-- قراءة للإدارة فقط، ولا إدراج من أي عميل — الكتابة عبر triggers حصراً.
create policy activity_select on public.activity_logs for select using (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
);

-- ---------------------------------------------------------------- settings
create policy settings_select on public.settings for select
  using (auth.uid() is not null);
create policy settings_update on public.settings for update
  using (public.is_admin()) with check (public.is_admin());


-- ############################################################################
-- ### 20260101000003_audit.sql
-- ############################################################################

-- ============================================================================
-- سجل التدقيق (Audit Trail) — يُكتب داخل قاعدة البيانات حصراً
--
-- في النموذج الأولي كانت الواجهة تكتب في activity_logs بأي قيم تشاء
-- (logActivity في JS)، أي أن السجل كان قابلاً للتزوير من أدوات المطوّر.
-- هنا لا توجد سياسة insert أصلاً، والكتابة تتم عبر triggers بـ security definer.
--
-- العمليات الجماعية (الاستيراد) تُعطّل التدقيق الصفّي وتكتب سطراً ملخّصاً
-- واحداً بدل ~700 سطر، عبر الإعداد app.skip_audit داخل معاملة الاستيراد.
-- ============================================================================

-- ⚠️ دالة داخلية فقط: تُستدعى من دوال أخرى بـ security definer (الاستيراد،
-- رفع الحالة). لا تُمنح لأي دور تطبيقي — لو مُنحت لصار بإمكان أي مستخدم كتابة
-- أي سطر في سجل التدقيق، وهي بالضبط الثغرة التي يعالجها هذا الملف.
create or replace function public.write_activity_log(
  p_action_type text,
  p_table_name  text,
  p_record_id   text,
  p_old_value   jsonb default null,
  p_new_value   jsonb default null
) returns void language sql security definer set search_path = public as $$
  insert into public.activity_logs(user_id, action_type, table_name, record_id, old_value, new_value)
  values (auth.uid(), p_action_type, p_table_name, p_record_id, p_old_value, p_new_value);
$$;

revoke all on function public.write_activity_log(text, text, text, jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_id     text;
  v_old    jsonb;
  v_new    jsonb;
begin
  -- تخطّي التدقيق الصفّي أثناء عمليات الاستيراد الجماعية
  if coalesce(current_setting('app.skip_audit', true), 'off') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_action := 'create'; v_new := to_jsonb(new); v_id := new.id::text;
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := new.id::text;
  else
    v_action := 'delete'; v_old := to_jsonb(old); v_id := old.id::text;
  end if;

  insert into public.activity_logs(user_id, action_type, table_name, record_id, old_value, new_value)
  values (auth.uid(), v_action, tg_table_name, v_id, v_old, v_new);

  return coalesce(new, old);
end;
$$;

create trigger trg_audit_customers
  after insert or update or delete on public.customers
  for each row execute function public.audit_row();

create trigger trg_audit_users
  after insert or update or delete on public.users
  for each row execute function public.audit_row();

create trigger trg_audit_followups
  after insert on public.followups
  for each row execute function public.audit_row();

create trigger trg_audit_collections
  after insert or update or delete on public.collections
  for each row execute function public.audit_row();

create trigger trg_audit_incentive_payments
  after insert or update or delete on public.incentive_payments
  for each row execute function public.audit_row();

create trigger trg_audit_categories
  after insert or update or delete on public.customer_categories
  for each row execute function public.audit_row();

create trigger trg_audit_due_dates
  after insert or update or delete on public.due_dates
  for each row execute function public.audit_row();

-- ----------------------------------------------------------------------------
-- تسجيل الدخول/الخروج — الحدث الوحيد الذي لا يمكن التقاطه بـ trigger،
-- فتستدعيه الواجهة صراحة. القيم المقبولة مقيّدة حتى لا يُحقن أي فعل آخر.
-- ----------------------------------------------------------------------------
create or replace function public.log_auth_event(p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_action not in ('login','logout') then
    raise exception 'قيمة غير مسموحة: %', p_action;
  end if;
  if auth.uid() is null then
    return;
  end if;
  insert into public.activity_logs(user_id, action_type, table_name, record_id)
  values (auth.uid(), p_action, 'users', auth.uid()::text);
end;
$$;

revoke all on function public.log_auth_event(text) from public, anon;
grant execute on function public.log_auth_event(text) to authenticated;


-- ############################################################################
-- ### 20260101000004_rpc.sql
-- ############################################################################

-- ============================================================================
-- دوال العمليات (RPC) — كل عملية تكتب أكثر من جدول تمر من هنا، لتنفَّذ في
-- معاملة واحدة وبفحص صلاحيات صريح، بدل عشرات الاستدعاءات من الواجهة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) رفع حالة عميل لمراجعة المدير
-- في النموذج الأولي كان زراً في الواجهة يُدرج مباشرة في notifications، وكانت
-- سياسة RLS القديمة ترفضه لأن المُدرِج مسؤول تحصيل. هنا يمر عبر دالة تتحقق
-- من أن المستخدم يرى العميل فعلاً، ثم تُدرج التنبيه موجّهاً للإدارة (user_id
-- فارغ = يظهر للمدير والمحاسب).
-- ----------------------------------------------------------------------------
create or replace function public.escalate_customer(p_customer_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.can_see_customer(p_customer_id) then
    raise exception 'غير مصرّح: لا تملك صلاحية على هذا العميل';
  end if;

  insert into public.notifications (customer_id, user_id, notification_type, notification_date, created_by)
  values (p_customer_id, null, 'escalated', current_date, auth.uid())
  on conflict (customer_id, notification_type, notification_date) do update
    set created_by = excluded.created_by
  returning id into v_id;

  perform public.write_activity_log('escalate', 'customers', p_customer_id::text, null,
                                    jsonb_build_object('note', p_note));
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) توليد تنبيهات اليوم — نقل مطابق لـ generateDailyNotifications في الواجهة
-- (legacy/frontend/collection-system.html:269) مع فارق واحد: كل العتبات تُقرأ
-- من public.settings بدل تثبيتها بالكود، ونوع التنبيه مفتاح ثابت لا نص عربي.
-- القواعد الخمس الآلية (السادسة "رفع للمدير" يدوية عبر escalate_customer).
-- تعمل يدوياً من زر المدير، وآلياً عبر pg_cron يومياً.
-- ----------------------------------------------------------------------------
create or replace function public.generate_daily_notifications(p_today date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_s        public.settings%rowtype;
  v_inserted integer := 0;
begin
  -- ⚠️ الدالة security definer وممنوحة لـ authenticated، وجدول notifications
  -- بلا سياسة insert عمداً. بدون هذا الفحص كان أي مستخدم مسجّل دخول — بل حتى
  -- الموقوف — يستطيع استدعاءها والكتابة في الجدول، وهو بالضبط ما تمنعه السياسة.
  -- التشغيل الآلي عبر pg_cron يمر بـ auth.uid() فارغة فيُستثنى صراحة.
  if auth.uid() is not null
     and not (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  then
    raise exception 'غير مصرّح: توليد التنبيهات مقتصر على مدير النظام والمحاسب';
  end if;

  select * into v_s from public.settings limit 1;

  with due as (
    select c.id as customer_id, c.assigned_user_id, c.status_customer,
           d.remaining_days
    from public.customers c
    left join public.customer_due_view d on d.customer_id = c.id
    where c.is_active and c.assigned_user_id is not null
  ),
  candidates as (
    -- 1) قبل الاستحقاق بـ N أيام
    select customer_id, assigned_user_id, 'before_due' as t
    from due where remaining_days = v_s.days_before_due_alert
    union all
    -- 2) يوم الاستحقاق
    select customer_id, assigned_user_id, 'due_today'
    from due where remaining_days = 0
    union all
    -- 3) يسوق الآن
    select customer_id, assigned_user_id, 'shopping_now'
    from due where status_customer = v_s.shopping_status_label
    union all
    -- 4) وعد بالسداد اليوم
    select f.customer_id, c.assigned_user_id, 'promise_today'
    from public.followups f
    join public.customers c on c.id = f.customer_id
    where f.next_followup_date = p_today
      and f.contact_result ilike '%' || v_s.promise_keyword || '%'
      and c.is_active and c.assigned_user_id is not null
    union all
    -- 5) لم تتم متابعته منذ مدة
    select d.customer_id, d.assigned_user_id, 'stale'
    from due d
    where not exists (
      select 1 from public.followups f
      where f.customer_id = d.customer_id
        and f.followup_date > p_today - v_s.no_followup_days_limit
        and f.followup_date <= p_today
    )
  ),
  ins as (
    insert into public.notifications (customer_id, user_id, notification_type, notification_date)
    select distinct customer_id, assigned_user_id, t, p_today from candidates
    on conflict (customer_id, notification_type, notification_date) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return v_inserted;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) استيراد الأرصدة
--
-- ملف Excel لقطة تراكمية كاملة، لذلك:
--   • balances تُحدَّث بـ upsert (لا إلحاق) — استيراد نفس الملف مرتين لا يغيّر شيئاً.
--   • balance_history يحفظ القيم الجديدة والسابقة لكل استيراد.
--   • الدفعات المحصّلة تُشتق من زيادة الجانب الدائن عن الاستيراد السابق،
--     ولا تُشتق أبداً لعميل/عملة لم يكن له رصيد سابق (وإلا لاعتُبر كل رصيد
--     دائن قديم "تحصيلاً" عند أول استيراد ترحيلي).
--   • الدفعات المشتقّة تبقى غير معتمدة حتى يعتمدها المحاسب، وعندها فقط
--     يُولَّد الحافز.
--
-- p_rows: [{customer_number, customer_name, currency, debit, credit}, ...]
-- ----------------------------------------------------------------------------
create or replace function public.import_balances(
  p_file_name text,
  p_rows jsonb,
  p_derive_collections boolean default true
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_import_id   uuid;
  v_uid         uuid := auth.uid();
  v_rate_usd    numeric;
  v_rate_sar    numeric;
  v_new_customers int := 0;
  v_rows        int := 0;
  v_collections int := 0;
begin
  if not (public.is_active_user() and (public.is_admin() or public.is_accountant())) then
    raise exception 'غير مصرّح: الاستيراد مقتصر على مدير النظام والمحاسب';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'لا توجد صفوف صالحة للاستيراد';
  end if;

  perform set_config('app.skip_audit', 'on', true);

  select exchange_rate_usd, exchange_rate_sar into v_rate_usd, v_rate_sar
  from public.settings limit 1;

  insert into public.excel_imports(file_name, file_type, imported_by, status)
  values (p_file_name, 'balances', v_uid, 'نجاح')
  returning id into v_import_id;

  -- تجميع الصفوف الواردة: رقم عميل مطبَّع + عملة، مع جمع التكرارات داخل الملف
  create temp table _in_bal on commit drop as
  select
    public.normalize_customer_number(r->>'customer_number')  as customer_number,
    max(nullif(trim(r->>'customer_name'), ''))               as customer_name,
    (r->>'currency')                                         as currency,
    sum(coalesce((r->>'debit')::numeric, 0))                 as debit,
    sum(coalesce((r->>'credit')::numeric, 0))                as credit
  from jsonb_array_elements(p_rows) r
  where public.normalize_customer_number(r->>'customer_number') is not null
    and (r->>'currency') in ('YER','USD','SAR')
  group by 1, 3;

  select count(*) into v_rows from _in_bal;

  -- إنشاء العملاء الجدد فقط (لا نلمس بيانات عميل قائم من ملف أرصدة)
  with ins as (
    insert into public.customers(customer_number, customer_name)
    select i.customer_number, coalesce(i.customer_name, i.customer_number)
    from (select distinct on (customer_number) customer_number, customer_name
          from _in_bal order by customer_number) i
    left join public.customers c on c.customer_number = i.customer_number
    where c.id is null
    returning 1
  )
  select count(*) into v_new_customers from ins;

  -- الأرشيف: القيم الجديدة مع السابقة (قبل التحديث)
  insert into public.balance_history(import_id, customer_id, currency, debit, credit, prev_debit, prev_credit)
  select v_import_id, c.id, i.currency, i.debit, i.credit,
         coalesce(b.debit, 0), coalesce(b.credit, 0)
  from _in_bal i
  join public.customers c on c.customer_number = i.customer_number
  left join public.balances b on b.customer_id = c.id and b.currency = i.currency;

  -- اشتقاق الدفعات المحصّلة قبل تحديث balances (لأنها ما تزال تحمل الحالة السابقة)
  if p_derive_collections then
    insert into public.collections(
      customer_id, user_id, currency, amount, rate_used, amount_yer,
      collected_date, source, import_id, note, created_by
    )
    select
      h.customer_id,
      c.assigned_user_id,
      h.currency,
      (h.credit - h.prev_credit),
      case h.currency when 'USD' then v_rate_usd when 'SAR' then v_rate_sar else 1 end,
      round((h.credit - h.prev_credit)
            * case h.currency when 'USD' then v_rate_usd when 'SAR' then v_rate_sar else 1 end, 2),
      current_date, 'import', v_import_id,
      'مشتقّة آلياً من زيادة الجانب الدائن في ملف: ' || p_file_name,
      v_uid
    from public.balance_history h
    join public.customers c on c.id = h.customer_id
    where h.import_id = v_import_id
      and h.credit > h.prev_credit
      -- شرط وجود رصيد سابق فعلي: يمنع اعتبار أرصدة أول استيراد تحصيلاً
      and exists (
        select 1 from public.balances b
        where b.customer_id = h.customer_id and b.currency = h.currency
      );
    get diagnostics v_collections = row_count;
  end if;

  -- تحديث الرصيد الحالي (upsert)
  insert into public.balances(customer_id, currency, debit, credit, last_import_id)
  select c.id, i.currency, i.debit, i.credit, v_import_id
  from _in_bal i
  join public.customers c on c.customer_number = i.customer_number
  on conflict (customer_id, currency) do update set
    debit          = excluded.debit,
    credit         = excluded.credit,
    last_import_id = excluded.last_import_id,
    updated_at     = now();

  update public.excel_imports
  set rows_count = v_rows,
      notes = format('صفوف: %s • عملاء جدد: %s • دفعات مشتقّة: %s', v_rows, v_new_customers, v_collections)
  where id = v_import_id;

  perform set_config('app.skip_audit', 'off', true);
  perform public.write_activity_log('import', 'excel_imports', v_import_id::text, null,
    jsonb_build_object('file_name', p_file_name, 'rows', v_rows,
                       'new_customers', v_new_customers, 'collections', v_collections));

  return jsonb_build_object(
    'import_id', v_import_id,
    'rows', v_rows,
    'new_customers', v_new_customers,
    'collections', v_collections
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) استيراد بيانات العملاء وتواريخ الاستحقاق (من ملف "متابعه العملاء")
--
-- p_rows: [{customer_number, customer_name, mobile_1, mobile_2, guarantor,
--           status_customer, assigned_name, due_date, grace_1, grace_2, grace_3,
--           note_1, note_2}, ...]
-- assigned_name يُطابَق باسم المستخدم الكامل أو باسم الدخول.
-- الحقول الفارغة لا تمسح القيم الموجودة (coalesce).
-- ----------------------------------------------------------------------------
create or replace function public.import_customers(p_file_name text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_import_id     uuid;
  v_uid           uuid := auth.uid();
  v_rows          int := 0;
  v_new_customers int := 0;
  v_due           int := 0;
  v_unmatched     text[];
begin
  if not (public.is_active_user() and (public.is_admin() or public.is_accountant())) then
    raise exception 'غير مصرّح: الاستيراد مقتصر على مدير النظام والمحاسب';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'لا توجد صفوف صالحة للاستيراد';
  end if;

  perform set_config('app.skip_audit', 'on', true);

  insert into public.excel_imports(file_name, file_type, imported_by, status)
  values (p_file_name, 'customers', v_uid, 'نجاح')
  returning id into v_import_id;

  create temp table _in_cust on commit drop as
  select distinct on (public.normalize_customer_number(r->>'customer_number'))
    public.normalize_customer_number(r->>'customer_number')  as customer_number,
    nullif(trim(r->>'customer_name'), '')                    as customer_name,
    nullif(trim(r->>'mobile_1'), '')                         as mobile_1,
    nullif(trim(r->>'mobile_2'), '')                         as mobile_2,
    nullif(trim(r->>'guarantor'), '')                        as guarantor,
    nullif(trim(r->>'status_customer'), '')                  as status_customer,
    nullif(trim(r->>'assigned_name'), '')                    as assigned_name,
    (r->>'due_date')::date                                   as due_date,
    coalesce((r->>'grace_1')::int, 0)                        as grace_1,
    coalesce((r->>'grace_2')::int, 0)                        as grace_2,
    coalesce((r->>'grace_3')::int, 0)                        as grace_3,
    nullif(trim(r->>'note_1'), '')                           as note_1,
    nullif(trim(r->>'note_2'), '')                           as note_2
  from jsonb_array_elements(p_rows) r
  where public.normalize_customer_number(r->>'customer_number') is not null
    and nullif(trim(r->>'customer_name'), '') is not null
  order by 1;

  select count(*) into v_rows from _in_cust;

  -- عدّ العملاء الجدد قبل الـ upsert (بعده يستحيل التمييز بين إدراج وتحديث)
  select count(*) into v_new_customers
  from _in_cust i
  left join public.customers c on c.customer_number = i.customer_number
  where c.id is null;

  -- أسماء مسؤولي تحصيل وردت في الملف ولا تطابق أي مستخدم — تُعاد كتحذير
  select array_agg(distinct i.assigned_name)
  into v_unmatched
  from _in_cust i
  where i.assigned_name is not null
    and not exists (
      select 1 from public.users u
      where u.full_name = i.assigned_name or u.username = i.assigned_name
    );

  insert into public.customers as c
    (customer_number, customer_name, mobile_1, mobile_2, guarantor, status_customer, assigned_user_id)
  select
    i.customer_number, i.customer_name, i.mobile_1, i.mobile_2, i.guarantor, i.status_customer,
    (select u.id from public.users u
      where u.full_name = i.assigned_name or u.username = i.assigned_name
      limit 1)
  from _in_cust i
  on conflict (customer_number) do update set
    customer_name    = coalesce(excluded.customer_name, c.customer_name),
    mobile_1         = coalesce(excluded.mobile_1, c.mobile_1),
    mobile_2         = coalesce(excluded.mobile_2, c.mobile_2),
    guarantor        = coalesce(excluded.guarantor, c.guarantor),
    status_customer  = coalesce(excluded.status_customer, c.status_customer),
    assigned_user_id = coalesce(excluded.assigned_user_id, c.assigned_user_id);

  with due_upsert as (
    insert into public.due_dates as d
      (customer_id, due_date, grace_1, grace_2, grace_3, note_1, note_2)
    select c.id, i.due_date, i.grace_1, i.grace_2, i.grace_3, i.note_1, i.note_2
    from _in_cust i
    join public.customers c on c.customer_number = i.customer_number
    where i.due_date is not null
    on conflict (customer_id) do update set
      due_date = excluded.due_date,
      grace_1  = excluded.grace_1,
      grace_2  = excluded.grace_2,
      grace_3  = excluded.grace_3,
      note_1   = coalesce(excluded.note_1, d.note_1),
      note_2   = coalesce(excluded.note_2, d.note_2),
      updated_at = now()
    returning 1
  )
  select count(*) into v_due from due_upsert;

  update public.excel_imports
  set rows_count = v_rows,
      status = case when v_unmatched is null then 'نجاح' else 'تحذير' end,
      notes = format('صفوف: %s • عملاء جدد: %s • تواريخ استحقاق: %s%s',
                     v_rows, v_new_customers, v_due,
                     case when v_unmatched is null then ''
                          else ' • مسؤولون غير مطابقين: ' || array_to_string(v_unmatched, '، ') end)
  where id = v_import_id;

  perform set_config('app.skip_audit', 'off', true);
  perform public.write_activity_log('import', 'excel_imports', v_import_id::text, null,
    jsonb_build_object('file_name', p_file_name, 'rows', v_rows,
                       'new_customers', v_new_customers, 'due_dates', v_due));

  return jsonb_build_object(
    'import_id', v_import_id,
    'rows', v_rows,
    'new_customers', v_new_customers,
    'due_dates', v_due,
    'unmatched_assignees', coalesce(to_jsonb(v_unmatched), '[]'::jsonb)
  );
end;
$$;

-- ============================================================================
-- الصلاحيات على الدوال: لا تُستدعى إلا من مستخدم مسجّل دخول
-- ============================================================================
revoke all on function public.escalate_customer(uuid, text) from public, anon;
revoke all on function public.generate_daily_notifications(date) from public, anon;
revoke all on function public.import_balances(text, jsonb, boolean) from public, anon;
revoke all on function public.import_customers(text, jsonb) from public, anon;

grant execute on function public.escalate_customer(uuid, text) to authenticated;
grant execute on function public.generate_daily_notifications(date) to authenticated;
grant execute on function public.import_balances(text, jsonb, boolean) to authenticated;
grant execute on function public.import_customers(text, jsonb) to authenticated;
