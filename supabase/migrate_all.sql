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

  -- [إصلاح #2] استخدام COALESCE لحماية حساب amount_yer من NULL
  select coalesce(exchange_rate_usd, 530),
         coalesce(exchange_rate_sar, 141)
  into v_rate_usd, v_rate_sar
  from public.settings limit 1;

  -- في حالة عدم وجود صف في settings نضمن قيمة افتراضية آمنة
  v_rate_usd := coalesce(v_rate_usd, 530);
  v_rate_sar := coalesce(v_rate_sar, 141);

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
      -- [إصلاح #3] شرط صريح: الفرق موجب فعلاً (يتجنب فشل check (amount > 0))
      and (h.credit - h.prev_credit) > 0
      -- [إصلاح #1] الشرط المُصلَح لاشتقاق التحصيل:
      --   الحالة أ: عميل له رصيد سابق بنفس العملة (السيناريو الاعتيادي)
      --   الحالة ب: عميل قائم له رصيد بأي عملة، ويظهر بعملة جديدة لأول مرة
      --             (prev_credit = 0 يثبت أنه ليس رصيد مفتوح قديم)
      -- كلا الحالتين يستثنيان العميل الجديد كلياً (لا رصيد بأي عملة)
      and (
        -- الحالة أ: له رصيد سابق بنفس العملة
        exists (
          select 1 from public.balances b
          where b.customer_id = h.customer_id and b.currency = h.currency
        )
        or
        -- الحالة ب: له رصيد بعملة مختلفة (عميل قائم يُضاف له قسم عملة جديد)
        (h.prev_credit = 0 and exists (
          select 1 from public.balances b2
          where b2.customer_id = h.customer_id
        ))
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


-- ############################################################################
-- ### 20260101000006_settings_upgrade.sql
-- ############################################################################

-- ============================================================================
-- 16) ترقية وحدة الإعدادات المركزية (Central Settings Upgrade)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. إضافة حقول الإعدادات العامة والتنبيهات والعملات إلى جدول settings
-- ----------------------------------------------------------------------------
alter table public.settings
  add column if not exists company_name text not null default 'مكتب الدكتور أيمن لخدمات الدواجن',
  add column if not exists system_name text not null default 'Smart Collection Platform',
  add column if not exists language text not null default 'ar',
  add column if not exists direction text not null default 'rtl',
  add column if not exists date_format text not null default 'YYYY-MM-DD',
  add column if not exists alert_due_soon_enabled boolean not null default true,
  add column if not exists alert_due_today_enabled boolean not null default true,
  add column if not exists alert_shopping_now_enabled boolean not null default true,
  add column if not exists alert_promise_enabled boolean not null default true,
  add column if not exists alert_stale_enabled boolean not null default true,
  add column if not exists alert_escalated_enabled boolean not null default true,
  add column if not exists currencies_config jsonb not null default '[
    {"code":"YER","name":"ريال يمني","symbol":"ر.ي","rate":1,"is_base":true,"is_active":true},
    {"code":"USD","name":"دولار أمريكي","symbol":"$","rate":530,"is_base":false,"is_active":true},
    {"code":"SAR","name":"ريال سعودي","symbol":"ر.س","rate":141,"is_base":false,"is_active":true}
  ]'::jsonb;

-- ----------------------------------------------------------------------------
-- 2. تفعيل التدقيق وسجل العمليات على جدول الإعدادات
-- ----------------------------------------------------------------------------
drop trigger if exists trg_audit_settings on public.settings;
create trigger trg_audit_settings
  after insert or update or delete on public.settings
  for each row execute function public.audit_row();

-- ----------------------------------------------------------------------------
-- 3. تحديث دالة توليد التنبيهات لمراعاة مفاتيح تفعيل/تعطيل التنبيهات
-- ----------------------------------------------------------------------------
create or replace function public.generate_daily_notifications(p_today date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_s        public.settings%rowtype;
  v_inserted integer := 0;
begin
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
    from due
    where v_s.alert_due_soon_enabled and remaining_days = v_s.days_before_due_alert
    union all
    -- 2) يوم الاستحقاق
    select customer_id, assigned_user_id, 'due_today'
    from due
    where v_s.alert_due_today_enabled and remaining_days = 0
    union all
    -- 3) يسوق الآن
    select customer_id, assigned_user_id, 'shopping_now'
    from due
    where v_s.alert_shopping_now_enabled and status_customer = v_s.shopping_status_label
    union all
    -- 4) وعد بالسداد اليوم
    select f.customer_id, c.assigned_user_id, 'promise_today'
    from public.followups f
    join public.customers c on c.id = f.customer_id
    where v_s.alert_promise_enabled
      and f.next_followup_date = p_today
      and f.contact_result ilike '%' || v_s.promise_keyword || '%'
      and c.is_active and c.assigned_user_id is not null
    union all
    -- 5) لم تتم متابعته منذ مدة
    select d.customer_id, d.assigned_user_id, 'stale'
    from due d
    where v_s.alert_stale_enabled
      and not exists (
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


-- ############################################################################
-- ### 20260101000007_followup_attachments.sql
-- ############################################################################

-- ============================================================================
-- ترقية نظام المتابعات: إرفاق المستندات والملفات (Storage Bucket & Schema)
-- ============================================================================

-- 1) إضافة حقلي المرفق في جدول المتابعات
alter table public.followups
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

-- 2) إنشاء أو تحديث Bucket تخزين مرفقات المتابعة
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'followup-attachments',
  'followup-attachments',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3) سياسات الوصول والحماية (RLS) لكائنات التخزين
-- ملاحظة: المسار المعتمد للملفات هو: <customer_id>/<file_name>
drop policy if exists followup_attachments_select on storage.objects;
create policy followup_attachments_select on storage.objects for select using (
  bucket_id = 'followup-attachments'
  and public.is_active_user()
  and (
    public.is_admin()
    or public.is_accountant()
    or (
      nullif(split_part(name, '/', 1), '') is not null
      and public.can_see_customer(nullif(split_part(name, '/', 1), '')::uuid)
    )
  )
);

drop policy if exists followup_attachments_insert on storage.objects;
create policy followup_attachments_insert on storage.objects for insert with check (
  bucket_id = 'followup-attachments'
  and public.is_active_user()
  and (
    public.is_admin()
    or public.is_accountant()
    or (
      nullif(split_part(name, '/', 1), '') is not null
      and public.can_see_customer(nullif(split_part(name, '/', 1), '')::uuid)
    )
  )
);

drop policy if exists followup_attachments_delete on storage.objects;
create policy followup_attachments_delete on storage.objects for delete using (
  bucket_id = 'followup-attachments'
  and public.is_active_user()
  and (
    public.is_admin()
    or public.is_accountant()
    or (
      nullif(split_part(name, '/', 1), '') is not null
      and public.can_see_customer(nullif(split_part(name, '/', 1), '')::uuid)
    )
  )
);


-- ############################################################################
-- ### 20260901000001_fix_import_balances_foreign_currency.sql
-- ############################################################################

-- =============================================================================
-- إصلاح: الدفعات المحصّلة بالعملة الأجنبية (USD/SAR) لا تُسجَّل عند الاستيراد
--
-- التاريخ: 2026-09-01
-- المشكلة:
--   1) شرط EXISTS كان يشترط وجود رصيد سابق بنفس العملة، مما يحجب العملاء
--      الذين يظهرون لأول مرة بعملة USD أو SAR (رغم أنهم عملاء قائمون بعملة YER).
--   2) أسعار الصرف قد تكون NULL إذا كان جدول settings فارغاً، مما يتسبب
--      في فشل صامت بسبب قيد NOT NULL على عمود amount_yer.
--   3) غياب شرط صريح على (h.credit - h.prev_credit) > 0 في WHERE، مما
--      يتيح محاولة إدراج دفعة بمبلغ صفر ويفشل بسبب check (amount > 0).
-- =============================================================================

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

  -- [إصلاح #2] استخدام COALESCE لحماية حساب amount_yer من NULL
  select coalesce(exchange_rate_usd, 530),
         coalesce(exchange_rate_sar, 141)
  into v_rate_usd, v_rate_sar
  from public.settings limit 1;

  -- في حالة عدم وجود صف في settings نضمن قيمة افتراضية آمنة
  v_rate_usd := coalesce(v_rate_usd, 530);
  v_rate_sar := coalesce(v_rate_sar, 141);

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
      -- [إصلاح #3] شرط صريح: الفرق موجب فعلاً (يتجنب فشل check (amount > 0))
      and (h.credit - h.prev_credit) > 0
      -- [إصلاح #1] الشرط المُصلَح لاشتقاق التحصيل:
      --   الحالة أ: عميل له رصيد سابق بنفس العملة (السيناريو الاعتيادي)
      --   الحالة ب: عميل قائم له رصيد بأي عملة، ويظهر بعملة جديدة لأول مرة
      --             (prev_credit = 0 يثبت أنه ليس رصيد مفتوح قديم)
      -- كلا الحالتين يستثنيان العميل الجديد كلياً (لا رصيد بأي عملة)
      and (
        -- الحالة أ: له رصيد سابق بنفس العملة
        exists (
          select 1 from public.balances b
          where b.customer_id = h.customer_id and b.currency = h.currency
        )
        or
        -- الحالة ب: له رصيد بعملة مختلفة (عميل قائم يُضاف له قسم عملة جديد)
        (h.prev_credit = 0 and exists (
          select 1 from public.balances b2
          where b2.customer_id = h.customer_id
        ))
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


-- ############################################################################
-- ### 20260901000002_notify_after_followup.sql
-- ############################################################################

-- =============================================================================
-- Migration: 20260901000002_notify_after_followup.sql
--
-- الهدف: إنشاء دالة notify_after_followup تُنشئ/تُحدِّث التنبيهات تلقائياً
-- فور إضافة متابعة، بصرف النظر عن دور المستخدم.
--
-- هذا يحل مشكلة: مسؤول التحصيل لا يملك صلاحية استدعاء generate_daily_notifications،
-- فكانت التنبيهات تتأخر حتى التوليد اليومي الآلي.
--
-- ما تفعله الدالة:
--  1) تزيل تنبيه 'stale' للعميل إن وُجد اليوم — لأن المتابعة الجديدة
--     تعني أن العميل لم يعد متجاهلاً.
--  2) تُنشئ تنبيه 'promise_today' إذا:
--       • تاريخ المتابعة القادمة = اليوم
--       • نتيجة التواصل تحتوي على كلمة الوعد المضبوطة في الإعدادات
-- =============================================================================

create or replace function public.notify_after_followup(
  p_followup_id   uuid,
  p_customer_id   uuid,
  p_followup_date date,
  p_next_date     date    default null,
  p_result        text    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today          date := current_date;
  v_s              public.settings%rowtype;
  v_assigned_uid   uuid;
begin
  -- أي مستخدم مصادق عليه ونشط يستطيع استدعاء هذه الدالة
  if not public.is_active_user() then
    raise exception 'غير مصرّح: يجب تسجيل الدخول بحساب نشط';
  end if;

  -- جلب إعدادات النظام والمستخدم المكلّف بالعميل
  select * into v_s from public.settings limit 1;

  select assigned_user_id
  into   v_assigned_uid
  from   public.customers
  where  id = p_customer_id and is_active;

  -- -----------------------------------------------------------------------
  -- 1) حذف تنبيه 'stale' لهذا العميل اليوم إن كانت المتابعة اليوم
  --    (المتابعة الجديدة تُثبت أن العميل لم يُهمَل)
  -- -----------------------------------------------------------------------
  if p_followup_date >= v_today - coalesce(v_s.no_followup_days_limit, 14) then
    delete from public.notifications
    where  customer_id       = p_customer_id
      and  notification_type = 'stale'
      and  notification_date = v_today
      and  status            = 'جديد';
  end if;

  -- -----------------------------------------------------------------------
  -- 2) إنشاء تنبيه 'promise_today' إن توفّرت الشروط
  -- -----------------------------------------------------------------------
  if coalesce(v_s.alert_promise_enabled, true)
     and p_next_date    = v_today
     and p_result       ilike '%' || coalesce(v_s.promise_keyword, 'وعد') || '%'
     and v_assigned_uid is not null
  then
    insert into public.notifications
      (customer_id, user_id, notification_type, notification_date)
    values
      (p_customer_id, v_assigned_uid, 'promise_today', v_today)
    on conflict (customer_id, notification_type, notification_date)
    do nothing;
  end if;

end;
$$;

-- منح التنفيذ لكل مستخدم مصادق (الفحص الداخلي يضمن الأمان)
revoke all on function public.notify_after_followup(uuid,uuid,date,date,text) from public, anon;
grant execute on function public.notify_after_followup(uuid,uuid,date,date,text) to authenticated;


-- ############################################################################
-- ### 20260901000003_analytics_reports.sql
-- ############################################################################

-- ============================================================================
-- ترقية ميزة التقارير التحليلية (V2 - Module 1: Analytics Reports)
-- تشمل:
--   1) تسجيل شاشة 'reports' في جدول app_screens وصلاحيات المستخدمين.
--   2) دالة get_analytics_summary_kpis لحساب المؤشرات المالية والتحصيلية.
--   3) دالة get_analytics_charts_data لحساب بيانات الرسوم البيانية الخمسة وتفاصيل أعلى المديونيات.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) تسجيل شاشة التقارير في app_screens
-- ----------------------------------------------------------------------------
insert into public.app_screens (screen_key, screen_label, sort_order)
values ('reports', 'التقارير التحليلية', 6)
on conflict (screen_key) do update set
  screen_label = excluded.screen_label,
  sort_order = excluded.sort_order;

-- إضافة الشاشة إلى allowed_screens لجميع المستخدمين الذين لا يمتلكونها
update public.users
set allowed_screens = array_append(allowed_screens, 'reports')
where not ('reports' = any(coalesce(allowed_screens, array[]::text[])));

-- ----------------------------------------------------------------------------
-- 2) الدالة التجميعية الأولى: get_analytics_summary_kpis
-- ----------------------------------------------------------------------------
create or replace function public.get_analytics_summary_kpis(
  p_start_date   date default null,
  p_end_date     date default null,
  p_user_id      uuid default null,
  p_category_id  uuid default null,
  p_currency     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid                      uuid;
  v_is_active                boolean;
  v_is_admin                 boolean;
  v_is_accountant            boolean;
  v_target_user_id           uuid;
  v_my_cats                  uuid[];
  v_rate_usd                 numeric(12,4);
  v_rate_sar                 numeric(12,4);
  v_ref_date                 date;
  v_total_debt_yer           numeric(18,2) := 0;
  v_total_collected_period_yer numeric(18,2) := 0;
  v_active_count             integer := 0;
  v_overdue_count            integer := 0;
  v_settled_count            integer := 0;
  v_team_collection_rate     numeric(6,2) := 0;
begin
  v_uid := auth.uid();

  -- التحقق من حالة المستخدم
  select (status = 'نشط') into v_is_active
  from public.users
  where id = v_uid;

  if not v_is_active then
    raise exception 'غير مصرّح: حساب المستخدم غير نشط أو غير مسجّل دخول';
  end if;

  v_is_admin := public.is_admin();
  v_is_accountant := public.is_accountant();
  v_my_cats := public.my_allowed_category_ids();
  v_ref_date := coalesce(p_end_date, current_date);

  -- عزل الصلاحيات: مسؤول التحصيل يرى بياناته فقط ويتم تجاهل p_user_id
  if v_is_admin or v_is_accountant then
    v_target_user_id := p_user_id;
  else
    v_target_user_id := v_uid;
  end if;

  -- قراءة أسعار الصرف
  select coalesce(exchange_rate_usd, 0), coalesce(exchange_rate_sar, 0)
  into v_rate_usd, v_rate_sar
  from public.settings limit 1;

  -- 1) حساب مديونيات العملاء وحالاتهم
  with filtered_customers as (
    select c.id, c.is_active, c.customer_category_id, c.assigned_user_id
    from public.customers c
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
  ),
  customer_debts as (
    select
      fc.id as customer_id,
      fc.is_active,
      case
        when p_currency = 'USD' then
          coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd else 0 end), 0)
        when p_currency = 'SAR' then
          coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar else 0 end), 0)
        when p_currency = 'YER' then
          coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0)
        else
          public.calc_total_due_yer(
            coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
            coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
            coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
            v_rate_usd,
            v_rate_sar
          )
      end as customer_due_yer,
      (dd.due_date + coalesce(dd.grace_period_1,0) + coalesce(dd.grace_period_2,0) + coalesce(dd.grace_period_3,0) - v_ref_date) as remaining_days
    from filtered_customers fc
    left join public.balances b on b.customer_id = fc.id
    left join public.due_dates dd on dd.customer_id = fc.id
    group by fc.id, fc.is_active, dd.due_date, dd.grace_period_1, dd.grace_period_2, dd.grace_period_3
  )
  select
    coalesce(sum(customer_due_yer), 0),
    count(*) filter (where customer_due_yer > 0 and (remaining_days is null or remaining_days >= 0) and is_active = true),
    count(*) filter (where customer_due_yer > 0 and remaining_days < 0 and is_active = true),
    count(*) filter (where customer_due_yer <= 0 or is_active = false)
  into
    v_total_debt_yer,
    v_active_count,
    v_overdue_count,
    v_settled_count
  from customer_debts;

  -- 2) حساب المبالغ المحصلة في الفترة
  select
    coalesce(sum(case
      when p_currency is null or p_currency = 'ALL' or p_currency = '' then col.amount_yer
      when col.currency = p_currency then col.amount_yer
      else 0
    end), 0)
  into v_total_collected_period_yer
  from public.collections col
  join public.customers c on c.id = col.customer_id
  where (v_target_user_id is null or col.user_id = v_target_user_id or c.assigned_user_id = v_target_user_id)
    and (p_category_id is null or c.customer_category_id = p_category_id)
    and (
      array_length(v_my_cats, 1) is null
      or c.customer_category_id = any(v_my_cats)
    )
    and (p_start_date is null or col.collected_date >= p_start_date)
    and (p_end_date is null or col.collected_date <= p_end_date);

  -- 3) حساب نسبة التحصيل العام
  if (v_total_collected_period_yer + v_total_debt_yer) > 0 then
    v_team_collection_rate := round(
      (v_total_collected_period_yer / (v_total_collected_period_yer + v_total_debt_yer) * 100)::numeric,
      2
    );
  else
    v_team_collection_rate := 0;
  end if;

  return jsonb_build_object(
    'total_debt_yer', coalesce(v_total_debt_yer, 0),
    'total_collected_period_yer', coalesce(v_total_collected_period_yer, 0),
    'active_customers_count', coalesce(v_active_count, 0),
    'overdue_customers_count', coalesce(v_overdue_count, 0),
    'settled_customers_count', coalesce(v_settled_count, 0),
    'team_collection_rate', coalesce(v_team_collection_rate, 0)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) الدالة التجميعية الثانية: get_analytics_charts_data
-- ----------------------------------------------------------------------------
create or replace function public.get_analytics_charts_data(
  p_start_date   date default null,
  p_end_date     date default null,
  p_user_id      uuid default null,
  p_category_id  uuid default null,
  p_currency     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid                      uuid;
  v_is_active                boolean;
  v_is_admin                 boolean;
  v_is_accountant            boolean;
  v_target_user_id           uuid;
  v_my_cats                  uuid[];
  v_rate_usd                 numeric(12,4);
  v_rate_sar                 numeric(12,4);
  v_ref_date                 date;
  v_total_debt_all           numeric(18,2) := 0;
  v_debt_by_currency         jsonb;
  v_customers_by_status      jsonb;
  v_collector_performance    jsonb;
  v_monthly_trend            jsonb;
  v_category_debt            jsonb;
  v_top_10_debtors           jsonb;
  v_start_month              date;
  v_end_month                date;
begin
  v_uid := auth.uid();

  select (status = 'نشط') into v_is_active
  from public.users
  where id = v_uid;

  if not v_is_active then
    raise exception 'غير مصرّح: حساب المستخدم غير نشط أو غير مسجّل دخول';
  end if;

  v_is_admin := public.is_admin();
  v_is_accountant := public.is_accountant();
  v_my_cats := public.my_allowed_category_ids();
  v_ref_date := coalesce(p_end_date, current_date);

  -- عزل الصلاحيات: مسؤول التحصيل يرى بياناته فقط ويتم تجاهل p_user_id
  if v_is_admin or v_is_accountant then
    v_target_user_id := p_user_id;
  else
    v_target_user_id := v_uid;
  end if;

  -- قراءة أسعار الصرف
  select coalesce(exchange_rate_usd, 0), coalesce(exchange_rate_sar, 0)
  into v_rate_usd, v_rate_sar
  from public.settings limit 1;

  -- إجمالي المديونية الكلية بالريال لاستخدامها في حساب النسب المئوية
  select coalesce(sum(
    case
      when p_currency = 'USD' then (b.debit - b.credit) * v_rate_usd
      when p_currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
      when p_currency = 'YER' then (b.debit - b.credit)
      else
        case
          when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd
          when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
          else (b.debit - b.credit)
        end
    end
  ), 0)
  into v_total_debt_all
  from public.customers c
  join public.balances b on b.customer_id = c.id
  where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
    and (p_category_id is null or c.customer_category_id = p_category_id)
    and (
      array_length(v_my_cats, 1) is null
      or c.customer_category_id = any(v_my_cats)
    )
    and (p_currency is null or p_currency = 'ALL' or p_currency = '' or b.currency = p_currency);

  -- 1) توزيع المديونيات حسب العملة (YER, USD, SAR)
  with curr_data as (
    select
      b.currency,
      coalesce(sum(b.debit - b.credit), 0) as amount_orig,
      coalesce(sum(
        case
          when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd
          when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
          else (b.debit - b.credit)
        end
      ), 0) as amount_yer
    from public.customers c
    join public.balances b on b.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_currency is null or p_currency = 'ALL' or p_currency = '' or b.currency = p_currency)
    group by b.currency
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'currency', c_name.curr,
      'currency_name', c_name.label,
      'amount_original', coalesce(cd.amount_orig, 0),
      'amount_yer', coalesce(cd.amount_yer, 0),
      'percentage', case
        when v_total_debt_all > 0 then round((coalesce(cd.amount_yer, 0) / v_total_debt_all * 100)::numeric, 2)
        else 0
      end
    ) order by case c_name.curr when 'YER' then 1 when 'USD' then 2 when 'SAR' then 3 else 4 end
  ), '[]'::jsonb)
  into v_debt_by_currency
  from (
    values
      ('YER'::text, 'ريال يمني'::text),
      ('USD'::text, 'دولار أمريكي'::text),
      ('SAR'::text, 'ريال سعودي'::text)
  ) as c_name(curr, label)
  left join curr_data cd on cd.currency = c_name.curr;

  -- 2) توزيع العملاء حسب الحالة (نشط، متعثر، مسدد)
  with cust_calc as (
    select
      c.id,
      c.is_active,
      coalesce(public.calc_total_due_yer(
        coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
        v_rate_usd,
        v_rate_sar
      ), 0) as total_due_yer,
      (dd.due_date + coalesce(dd.grace_period_1,0) + coalesce(dd.grace_period_2,0) + coalesce(dd.grace_period_3,0) - v_ref_date) as remaining_days
    from public.customers c
    left join public.balances b on b.customer_id = c.id
    left join public.due_dates dd on dd.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
    group by c.id, c.is_active, dd.due_date, dd.grace_period_1, dd.grace_period_2, dd.grace_period_3
  ),
  status_counts as (
    select
      count(*) as total_custs,
      count(*) filter (where total_due_yer > 0 and (remaining_days is null or remaining_days >= 0) and is_active = true) as active_cnt,
      count(*) filter (where total_due_yer > 0 and remaining_days < 0 and is_active = true) as overdue_cnt,
      count(*) filter (where total_due_yer <= 0 or is_active = false) as settled_cnt
    from cust_calc
  )
  select jsonb_build_array(
    jsonb_build_object(
      'status', 'active',
      'status_label', 'عملاء نشطون',
      'count', sc.active_cnt,
      'percentage', case when sc.total_custs > 0 then round((sc.active_cnt::numeric / sc.total_custs * 100)::numeric, 2) else 0 end
    ),
    jsonb_build_object(
      'status', 'overdue',
      'status_label', 'عملاء متعثرون',
      'count', sc.overdue_cnt,
      'percentage', case when sc.total_custs > 0 then round((sc.overdue_cnt::numeric / sc.total_custs * 100)::numeric, 2) else 0 end
    ),
    jsonb_build_object(
      'status', 'settled',
      'status_label', 'عملاء مسددون',
      'count', sc.settled_cnt,
      'percentage', case when sc.total_custs > 0 then round((sc.settled_cnt::numeric / sc.total_custs * 100)::numeric, 2) else 0 end
    )
  )
  into v_customers_by_status
  from status_counts sc;

  -- 3) أداء مسؤولي التحصيل
  with collector_list as (
    select distinct u.id as user_id, u.full_name as collector_name
    from public.users u
    where (v_target_user_id is null or u.id = v_target_user_id)
      and (
        exists (select 1 from public.customers c where c.assigned_user_id = u.id)
        or exists (select 1 from public.collections col where col.user_id = u.id)
        or exists (select 1 from public.roles r where r.id = u.role_id and r.name_role in ('مسؤول التحصيل', 'مستخدم مخصص'))
      )
  ),
  collector_debts as (
    select
      c.assigned_user_id as user_id,
      count(distinct c.id) as customer_count,
      coalesce(sum(
        case
          when p_currency = 'USD' then (b.debit - b.credit) * v_rate_usd
          when p_currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
          when p_currency = 'YER' then (b.debit - b.credit)
          else
            case
              when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd
              when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
              else (b.debit - b.credit)
            end
        end
      ), 0) as total_due_yer
    from public.customers c
    left join public.balances b on b.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_currency is null or p_currency = 'ALL' or p_currency = '' or b.currency = p_currency)
    group by c.assigned_user_id
  ),
  collector_collections as (
    select
      coalesce(col.user_id, c.assigned_user_id) as user_id,
      coalesce(sum(case
        when p_currency is null or p_currency = 'ALL' or p_currency = '' then col.amount_yer
        when col.currency = p_currency then col.amount_yer
        else 0
      end), 0) as total_collected_yer
    from public.collections col
    join public.customers c on c.id = col.customer_id
    where (v_target_user_id is null or col.user_id = v_target_user_id or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_start_date is null or col.collected_date >= p_start_date)
      and (p_end_date is null or col.collected_date <= p_end_date)
    group by coalesce(col.user_id, c.assigned_user_id)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', cl.user_id,
      'collector_name', cl.collector_name,
      'total_due_yer', coalesce(cd.total_due_yer, 0),
      'total_collected_yer', coalesce(cc.total_collected_yer, 0),
      'customer_count', coalesce(cd.customer_count, 0),
      'collection_rate', case
        when (coalesce(cc.total_collected_yer, 0) + coalesce(cd.total_due_yer, 0)) > 0 then
          round((coalesce(cc.total_collected_yer, 0) / (coalesce(cc.total_collected_yer, 0) + coalesce(cd.total_due_yer, 0)) * 100)::numeric, 2)
        else 0
      end
    ) order by coalesce(cc.total_collected_yer, 0) desc, coalesce(cd.total_due_yer, 0) desc
  ), '[]'::jsonb)
  into v_collector_performance
  from collector_list cl
  left join collector_debts cd on cd.user_id = cl.user_id
  left join collector_collections cc on cc.user_id = cl.user_id;

  -- 4) تطور التحصيل الشهري (آخر 6 أشهر)
  v_end_month := date_trunc('month', coalesce(p_end_date, current_date))::date;
  v_start_month := (v_end_month - interval '5 months')::date;

  with months as (
    select generate_series(v_start_month, v_end_month, '1 month'::interval)::date as m_start
  ),
  monthly_data as (
    select
      to_char(m.m_start, 'YYYY-MM') as month_str,
      case extract(month from m.m_start)
        when 1 then 'يناير'
        when 2 then 'فبراير'
        when 3 then 'مارس'
        when 4 then 'أبريل'
        when 5 then 'مايو'
        when 6 then 'يونيو'
        when 7 then 'يوليو'
        when 8 then 'أغسطس'
        when 9 then 'سبتمبر'
        when 10 then 'أكتوبر'
        when 11 then 'نوفمبر'
        when 12 then 'ديسمبر'
      end || ' ' || to_char(m.m_start, 'YYYY') as month_lbl,
      coalesce(sum(
        case
          when p_currency is null or p_currency = 'ALL' or p_currency = '' then col.amount_yer
          when col.currency = p_currency then col.amount_yer
          else 0
        end
      ), 0) as m_collected_yer
    from months m
    left join public.collections col on
      col.collected_date >= m.m_start
      and col.collected_date < (m.m_start + interval '1 month')::date
      and (v_target_user_id is null or col.user_id = v_target_user_id)
    group by m.m_start
    order by m.m_start
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', md.month_str,
      'month_label', md.month_lbl,
      'collected_yer', md.m_collected_yer,
      'target_or_due_yer', v_total_debt_all,
      'collection_rate', case
        when (md.m_collected_yer + v_total_debt_all) > 0 then
          round((md.m_collected_yer / (md.m_collected_yer + v_total_debt_all) * 100)::numeric, 2)
        else 0
      end
    )
  ), '[]'::jsonb)
  into v_monthly_trend
  from monthly_data md;

  -- 5) توزيع المديونيات حسب فئة العميل
  with cat_debts as (
    select
      c.customer_category_id as cat_id,
      coalesce(cat.category_name, 'بدون فئة') as cat_name,
      coalesce(cat.color, '#64748B') as cat_color,
      count(distinct c.id) as cust_cnt,
      coalesce(sum(
        case
          when p_currency = 'USD' then (b.debit - b.credit) * v_rate_usd
          when p_currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
          when p_currency = 'YER' then (b.debit - b.credit)
          else
            case
              when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd
              when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
              else (b.debit - b.credit)
            end
        end
      ), 0) as cat_debt_yer
    from public.customers c
    left join public.customer_categories cat on cat.id = c.customer_category_id
    left join public.balances b on b.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_currency is null or p_currency = 'ALL' or p_currency = '' or b.currency = p_currency)
    group by c.customer_category_id, cat.category_name, cat.color
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category_id', cd.cat_id,
      'category_name', cd.cat_name,
      'category_color', cd.cat_color,
      'total_debt_yer', cd.cat_debt_yer,
      'customer_count', cd.cust_cnt,
      'percentage', case
        when v_total_debt_all > 0 then round((cd.cat_debt_yer / v_total_debt_all * 100)::numeric, 2)
        else 0
      end
    ) order by cd.cat_debt_yer desc
  ), '[]'::jsonb)
  into v_category_debt
  from cat_debts cd;

  -- 6) أعلى 10 عملاء مديونية (التركيز الائتماني)
  with top_debtors_calc as (
    select
      c.id as cust_id,
      c.customer_number as cust_num,
      c.customer_name as cust_name,
      c.is_active,
      cat.category_name as cat_name,
      cat.color as cat_color,
      u.full_name as assigned_name,
      (dd.due_date + coalesce(dd.grace_period_1,0) + coalesce(dd.grace_period_2,0) + coalesce(dd.grace_period_3,0) - v_ref_date) as rem_days,
      coalesce(public.calc_total_due_yer(
        coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
        v_rate_usd,
        v_rate_sar
      ), 0) as due_yer
    from public.customers c
    left join public.customer_categories cat on cat.id = c.customer_category_id
    left join public.users u on u.id = c.assigned_user_id
    left join public.balances b on b.customer_id = c.id
    left join public.due_dates dd on dd.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
    group by c.id, c.customer_number, c.customer_name, c.is_active, cat.category_name, cat.color, u.full_name, dd.due_date, dd.grace_period_1, dd.grace_period_2, dd.grace_period_3
    having coalesce(public.calc_total_due_yer(
      coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
      coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
      coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
      v_rate_usd,
      v_rate_sar
    ), 0) > 0
    order by due_yer desc
    limit 10
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'customer_id', t.cust_id,
      'customer_number', t.cust_num,
      'customer_name', t.cust_name,
      'category_name', t.cat_name,
      'category_color', t.cat_color,
      'assigned_user_name', t.assigned_name,
      'total_due_yer', t.due_yer,
      'debt_percentage', case
        when v_total_debt_all > 0 then round((t.due_yer / v_total_debt_all * 100)::numeric, 2)
        else 0
      end,
      'status', case
        when t.due_yer <= 0 or t.is_active = false then 'settled'
        when t.rem_days < 0 then 'overdue'
        else 'active'
      end
    )
  ), '[]'::jsonb)
  into v_top_10_debtors
  from top_debtors_calc t;

  return jsonb_build_object(
    'debt_by_currency', coalesce(v_debt_by_currency, '[]'::jsonb),
    'customers_by_status', coalesce(v_customers_by_status, '[]'::jsonb),
    'collector_performance', coalesce(v_collector_performance, '[]'::jsonb),
    'monthly_collection_trend', coalesce(v_monthly_trend, '[]'::jsonb),
    'category_debt', coalesce(v_category_debt, '[]'::jsonb),
    'top_10_debtors', coalesce(v_top_10_debtors, '[]'::jsonb)
  );
end;
$$;


-- ############################################################################
-- ### 20260901000004_personal_tiers.sql
-- ############################################################################

-- ============================================================================
-- ميزة التصنيف الشخصي للمحصل (أ / ب / ج / د) — V2 Module 4
--
-- هذا الملف يُنشئ:
--  1) جدول collector_tier_settings: مسميات وألوان الفئات الشخصية لكل مستخدم.
--  2) جدول customer_personal_assignments: تعيين كل عميل لفئة معينة لدى المستخدم.
--  3) سياسات RLS لعزل الخصوصية بالكامل (لا يرى المستخدم تصنيفات غيره).
--  4) دوال الـ RPC:
--     - get_or_init_user_tiers(): تهيئة الفئات الأربع الافتراضية إن لم تكن موجودة.
--     - set_customer_personal_tier(): تعيين فئة العميل بنقرة واحدة (Upsert).
-- ============================================================================

-- ---------------------------------------------------------------- 1. جدول إعدادات ومسميات الفئات الشخصية
create table if not exists public.collector_tier_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  tier_key    text not null check (tier_key in ('A', 'B', 'C', 'D')),
  tier_name   text not null,
  color       text not null default '#6B7280',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, tier_key)
);

-- ---------------------------------------------------------------- 2. جدول تعيينات العملاء للفئات الشخصية
create table if not exists public.customer_personal_assignments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  tier_key     text not null check (tier_key in ('A', 'B', 'C', 'D')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, customer_id)
);

-- فهارس الأداء
create index if not exists idx_tier_settings_user on public.collector_tier_settings(user_id);
create index if not exists idx_personal_assignments_user on public.customer_personal_assignments(user_id);
create index if not exists idx_personal_assignments_user_cust on public.customer_personal_assignments(user_id, customer_id);

-- ---------------------------------------------------------------- 3. سياسات الحماية على مستوى الصف (RLS)
alter table public.collector_tier_settings enable row level security;
alter table public.customer_personal_assignments enable row level security;

-- كل مستخدم يصل فقط لإعداداته وتصنيفاته الخاصة
create policy collector_tier_settings_all on public.collector_tier_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy customer_personal_assignments_all on public.customer_personal_assignments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- 4. دوال الـ RPC

-- أ. دالة جلب أو تهيئة الفئات الأربع الافتراضية للمستخدم الحالي
create or replace function public.get_or_init_user_tiers()
returns setof public.collector_tier_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'يجب تسجيل الدخول لاستدعاء هذه الدالة';
  end if;

  select count(*) into v_count
  from public.collector_tier_settings
  where user_id = v_user_id;

  if v_count = 0 then
    insert into public.collector_tier_settings (user_id, tier_key, tier_name, color, sort_order)
    values
      (v_user_id, 'A', 'فئة أ (أولوية عالية)', '#EF4444', 1),
      (v_user_id, 'B', 'فئة ب (متابعة نشطة)', '#F59E0B', 2),
      (v_user_id, 'C', 'فئة ج (وعود ومستقر)', '#3B82F6', 3),
      (v_user_id, 'D', 'فئة د (عام / غير مصنف)', '#6B7280', 4)
    on conflict (user_id, tier_key) do nothing;
  end if;

  return query
  select *
  from public.collector_tier_settings
  where user_id = v_user_id
  order by sort_order asc, tier_key asc;
end;
$$;

-- ب. دالة تعيين أو تعديل فئة العميل الشخصية بنقرة واحدة (Upsert)
create or replace function public.set_customer_personal_tier(
  p_customer_id uuid,
  p_tier_key text
)
returns public.customer_personal_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.customer_personal_assignments;
begin
  if v_user_id is null then
    raise exception 'يجب تسجيل الدخول لتعيين الفئة الشخصية';
  end if;

  if p_tier_key not in ('A', 'B', 'C', 'D') then
    raise exception 'مفتاح الفئة غير صالح. القيم المسموحة: A, B, C, D';
  end if;

  insert into public.customer_personal_assignments (user_id, customer_id, tier_key, updated_at)
  values (v_user_id, p_customer_id, p_tier_key, now())
  on conflict (user_id, customer_id)
  do update set
    tier_key = excluded.tier_key,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;


-- ############################################################################
-- ### 20260901000005_custom_reminders.sql
-- ############################################################################

-- ============================================================================
-- ميزة زر «ذكرني» والتذكيرات الحرة المخصصة — V2 Module 3
--
-- هذا الملف يُنشئ:
--  1) جدول custom_reminders: تخزين التذكيرات والمهام الحرة لكل مستخدم.
--  2) سياسات RLS لعزل الخصوصية بالكامل (لا يرى المستخدم إلا تذكيراته).
--  3) دوال الـ RPC:
--     - create_custom_reminder(): إنشاء تذكير سريع مع التحقق.
--     - toggle_reminder_status(): تبديل حالة الإنجاز (مكتمل / غير مكتمل).
--     - snooze_reminder(): تأجيل موعد التذكير بعدد محدد من الأيام.
-- ============================================================================

-- ---------------------------------------------------------------- 1. جدول التذكيرات المخصصة
create table if not exists public.custom_reminders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete cascade,
  title           text not null,
  notes           text,
  due_date        date not null,
  due_time        time,
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  is_completed    boolean not null default false,
  completed_at    timestamptz,
  snoozed_until   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- فهارس الأداء السريع
create index if not exists idx_custom_reminders_user on public.custom_reminders(user_id);
create index if not exists idx_custom_reminders_user_date on public.custom_reminders(user_id, due_date);
create index if not exists idx_custom_reminders_customer on public.custom_reminders(customer_id);
create index if not exists idx_custom_reminders_status on public.custom_reminders(user_id, is_completed);

-- ---------------------------------------------------------------- 2. سياسات الحماية على مستوى الصف (RLS)
alter table public.custom_reminders enable row level security;

create policy custom_reminders_user_policy on public.custom_reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- 3. دوال الـ RPC

-- أ. دالة إنشاء تذكير مخصص
create or replace function public.create_custom_reminder(
  p_customer_id uuid,
  p_title text,
  p_notes text,
  p_due_date date,
  p_due_time time default null,
  p_priority text default 'normal'
)
returns public.custom_reminders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_res public.custom_reminders;
begin
  if v_user_id is null then
    raise exception 'يجب تسجيل الدخول لإنشاء تذكير';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'عنوان التذكير مطلوب';
  end if;
  if p_due_date is null then
    raise exception 'تاريخ التذكير مطلوب';
  end if;

  insert into public.custom_reminders (
    user_id, customer_id, title, notes, due_date, due_time, priority
  ) values (
    v_user_id, p_customer_id, trim(p_title), p_notes, p_due_date, p_due_time, coalesce(p_priority, 'normal')
  )
  returning * into v_res;

  return v_res;
end;
$$;

-- ب. دالة تبديل حالة إنجاز التذكير (Toggle Status)
create or replace function public.toggle_reminder_status(
  p_reminder_id uuid,
  p_is_completed boolean
)
returns public.custom_reminders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_res public.custom_reminders;
begin
  if v_user_id is null then
    raise exception 'غير مصرح';
  end if;

  update public.custom_reminders
  set
    is_completed = p_is_completed,
    completed_at = case when p_is_completed then now() else null end,
    updated_at = now()
  where id = p_reminder_id and user_id = v_user_id
  returning * into v_res;

  if v_res.id is null then
    raise exception 'التذكير غير موجود أو لا تملك صلاحية تعديله';
  end if;

  return v_res;
end;
$$;

-- ج. دالة تأجيل موعد التذكير (Snooze)
create or replace function public.snooze_reminder(
  p_reminder_id uuid,
  p_days_to_add integer
)
returns public.custom_reminders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_res public.custom_reminders;
begin
  if v_user_id is null then
    raise exception 'غير مصرح';
  end if;
  if p_days_to_add <= 0 then
    raise exception 'عدد أيام التأجيل يجب أن يكون أكبر من الصفر';
  end if;

  update public.custom_reminders
  set
    due_date = current_date + p_days_to_add,
    snoozed_until = current_date + p_days_to_add,
    is_completed = false,
    completed_at = null,
    updated_at = now()
  where id = p_reminder_id and user_id = v_user_id
  returning * into v_res;

  if v_res.id is null then
    raise exception 'التذكير غير موجود أو لا تملك صلاحية تعديله';
  end if;

  return v_res;
end;
$$;


-- ############################################################################
-- ### 20260901000006_system_backups.sql
-- ############################################################################

-- ============================================================================
-- مركز النسخ الاحتياطي والاستعادة من الواجهة — V2 Module 4
--
-- هذا الملف يُنشئ:
--  1) جدول system_backups: سجل لكافة النسخ الاحتياطية (اليدوية، المجدولة، ونقاط الأمان).
--  2) سياسات RLS وقواعد الأمان: قصر الوصول والإدارة حصرياً على مدير النظام.
--  3) مستودع التخزين السحابي (backups bucket) وسياسات الحماية.
--  4) دالة generate_system_backup_json(): تجميع كافة جداول V1 و V2 في حزمة JSON
--     موحدة ومشفرة بالبصمة الرقمية (SHA-256) وتسجيل العملية في سجل التدقيق.
--  5) دالة delete_system_backup_record(): لحذف سجل نسخة احتياطية من قبل المدير.
--  6) دالة validate_system_backup_payload(): فحص ومقارنة حزمة النسخة قبل الاستعادة.
--  7) دالة restore_system_backup(): استعادة ذرية شاملة مع أخذ نقطة أمان آلية.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- 1. جدول سجل النسخ الاحتياطية
create table if not exists public.system_backups (
  id                  uuid primary key default gen_random_uuid(),
  backup_name         text not null,
  file_name           text not null,
  file_size_bytes     bigint not null default 0,
  storage_path        text,
  backup_type         text not null default 'manual' check (backup_type in ('manual', 'auto_scheduled', 'safety_pre_restore')),
  checksum_sha256     text not null,
  table_counts        jsonb not null default '{}'::jsonb,
  notes               text,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- فهارس الأداء السريع
create index if not exists idx_system_backups_created_at on public.system_backups(created_at desc);
create index if not exists idx_system_backups_type on public.system_backups(backup_type);

-- ---------------------------------------------------------------- 2. سياسات الحماية على مستوى الصف (RLS)
alter table public.system_backups enable row level security;

-- صلاحية كاملة لمدير النظام فقط
drop policy if exists system_backups_admin_all on public.system_backups;
create policy system_backups_admin_all on public.system_backups
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------- 3. مستودع التخزين السحابي المحمي
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 104857600, array['application/json', 'application/gzip', 'application/octet-stream'])
on conflict (id) do update set
  public = false,
  file_size_limit = 104857600;

-- سياسات RLS على مستودع التخزين
drop policy if exists backups_bucket_admin_select on storage.objects;
create policy backups_bucket_admin_select on storage.objects
  for select
  using (bucket_id = 'backups' and public.is_admin());

drop policy if exists backups_bucket_admin_insert on storage.objects;
create policy backups_bucket_admin_insert on storage.objects
  for insert
  with check (bucket_id = 'backups' and public.is_admin());

drop policy if exists backups_bucket_admin_delete on storage.objects;
create policy backups_bucket_admin_delete on storage.objects
  for delete
  using (bucket_id = 'backups' and public.is_admin());

-- ---------------------------------------------------------------- 4. دوال الـ RPC للنسخ الاحتياطي

-- أ. دالة توليد حزمة النسخة الاحتياطية الشاملة
create or replace function public.generate_system_backup_json(
  p_backup_type text default 'manual',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_payload jsonb;
  v_tables jsonb;
  v_counts jsonb;
  v_backup_id uuid := gen_random_uuid();
  v_backup_name text;
  v_file_name text;
  v_checksum text;
  v_now_str text := to_char(now() at time zone 'UTC', 'YYYYMMDD_HH24MISS');
begin
  -- التحقق من صلاحية المدير
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'غير مصرح: عملية النسخ الاحتياطي محصورة بمدير النظام فقط';
  end if;

  select username into v_username from public.users where id = v_user_id;

  v_backup_name := case 
    when p_backup_type = 'safety_pre_restore' then 'نقطة أمان تلقائية قبل الاستعادة (' || v_now_str || ')'
    when p_backup_type = 'auto_scheduled' then 'نسخة مجدولة آلية (' || v_now_str || ')'
    else 'نسخة احتياطية يدوية (' || v_now_str || ')'
  end;

  v_file_name := 'backup_' || v_now_str || '_' || coalesce(p_backup_type, 'manual') || '.json';

  -- استخراج كافة الجداول كـ JSON
  v_tables := jsonb_build_object(
    'settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.settings t),
    'customer_categories', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customer_categories t),
    'customers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customers t),
    'balances', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.balances t),
    'balance_history', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.balance_history t),
    'due_dates', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.due_dates t),
    'followups', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.followups t),
    'collections', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.collections t),
    'incentives', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.incentives t),
    'incentive_payments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.incentive_payments t),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.notifications t),
    'excel_imports', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.excel_imports t),
    'collector_tier_settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.collector_tier_settings t),
    'customer_personal_assignments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customer_personal_assignments t),
    'custom_reminders', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.custom_reminders t)
  );

  -- إحصاء عدد السجلات في كل جدول
  v_counts := jsonb_build_object(
    'settings', (select count(*) from public.settings),
    'customer_categories', (select count(*) from public.customer_categories),
    'customers', (select count(*) from public.customers),
    'balances', (select count(*) from public.balances),
    'balance_history', (select count(*) from public.balance_history),
    'due_dates', (select count(*) from public.due_dates),
    'followups', (select count(*) from public.followups),
    'collections', (select count(*) from public.collections),
    'incentives', (select count(*) from public.incentives),
    'incentive_payments', (select count(*) from public.incentive_payments),
    'notifications', (select count(*) from public.notifications),
    'excel_imports', (select count(*) from public.excel_imports),
    'collector_tier_settings', (select count(*) from public.collector_tier_settings),
    'customer_personal_assignments', (select count(*) from public.customer_personal_assignments),
    'custom_reminders', (select count(*) from public.custom_reminders)
  );

  -- حساب البصمة الرقمية للبيانات (دالة sha256 أصلية في بوستجريس)
  v_checksum := encode(sha256(convert_to(v_tables::text, 'UTF8')), 'hex');

  -- بناء الـ Payload النهائي المتكامل
  v_payload := jsonb_build_object(
    'manifest', jsonb_build_object(
      'format_version', '2.0',
      'app_version', 'SCP-V2',
      'backup_type', coalesce(p_backup_type, 'manual'),
      'backup_id', v_backup_id,
      'backup_name', v_backup_name,
      'file_name', v_file_name,
      'checksum_sha256', v_checksum,
      'created_at', now(),
      'created_by_username', coalesce(v_username, 'admin'),
      'created_by_user_id', v_user_id,
      'notes', p_notes,
      'table_counts', v_counts
    ),
    'tables', v_tables
  );

  -- حفظ سجل النسخة في جدول system_backups
  insert into public.system_backups (
    id, backup_name, file_name, file_size_bytes, backup_type,
    checksum_sha256, table_counts, notes, created_by, created_at
  ) values (
    v_backup_id, v_backup_name, v_file_name,
    octet_length(v_payload::text),
    coalesce(p_backup_type, 'manual'),
    v_checksum,
    v_counts,
    p_notes,
    v_user_id,
    now()
  );

  -- توثيق العملية في سجل التدقيق الأمني
  insert into public.activity_logs (
    user_id, action, entity_type, entity_id, details
  ) values (
    v_user_id,
    'create_backup',
    'system_backup',
    v_backup_id::text,
    jsonb_build_object(
      'file_name', v_file_name,
      'backup_type', coalesce(p_backup_type, 'manual'),
      'checksum_sha256', v_checksum,
      'total_customers', (select count(*) from public.customers),
      'total_followups', (select count(*) from public.followups)
    )
  );

  return v_payload;
end;
$$;

-- ب. دالة حذف سجل النسخة الاحتياطية
create or replace function public.delete_system_backup_record(
  p_backup_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'غير مصرح: حذف سجلات النسخ الاحتياطية محصور بمدير النظام';
  end if;

  delete from public.system_backups where id = p_backup_id;

  insert into public.activity_logs (
    user_id, action, entity_type, entity_id, details
  ) values (
    v_user_id,
    'delete_backup_record',
    'system_backup',
    p_backup_id::text,
    jsonb_build_object('deleted_at', now())
  );

  return true;
end;
$$;

-- ج. دالة فحص وتدقيق حزمة النسخة الاحتياطية قبل الاستعادة
create or replace function public.validate_system_backup_payload(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manifest jsonb;
  v_tables jsonb;
  v_format_version text;
  v_table_counts jsonb := '{}'::jsonb;
begin
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'غير مصرح: فحص النسخ الاحتياطية محصور بمدير النظام فقط';
  end if;

  if p_payload is null or not (p_payload ? 'manifest') or not (p_payload ? 'tables') then
    raise exception 'ملف النسخة الاحتياطية غير صالح: تنقصه بيانات الميتاداتا أو الجداول الأساسية';
  end if;

  v_manifest := p_payload->'manifest';
  v_tables := p_payload->'tables';
  v_format_version := v_manifest->>'format_version';

  if v_format_version is null or v_format_version not in ('1.0', '2.0') then
    raise exception 'إصدار النسخة الاحتياطية غير متوافق مع هذا النظام (الإصدار الحالي: 2.0)';
  end if;

  -- حساب عدد السجلات في كل جدول بالحزمة
  v_table_counts := jsonb_build_object(
    'settings', jsonb_array_length(coalesce(v_tables->'settings', '[]'::jsonb)),
    'customer_categories', jsonb_array_length(coalesce(v_tables->'customer_categories', '[]'::jsonb)),
    'customers', jsonb_array_length(coalesce(v_tables->'customers', '[]'::jsonb)),
    'balances', jsonb_array_length(coalesce(v_tables->'balances', '[]'::jsonb)),
    'due_dates', jsonb_array_length(coalesce(v_tables->'due_dates', '[]'::jsonb)),
    'followups', jsonb_array_length(coalesce(v_tables->'followups', '[]'::jsonb)),
    'collections', jsonb_array_length(coalesce(v_tables->'collections', '[]'::jsonb)),
    'incentives', jsonb_array_length(coalesce(v_tables->'incentives', '[]'::jsonb)),
    'custom_reminders', jsonb_array_length(coalesce(v_tables->'custom_reminders', '[]'::jsonb))
  );

  return jsonb_build_object(
    'is_valid', true,
    'manifest', v_manifest,
    'table_counts', v_table_counts,
    'current_database_counts', jsonb_build_object(
      'customers', (select count(*) from public.customers),
      'balances', (select count(*) from public.balances),
      'followups', (select count(*) from public.followups),
      'collections', (select count(*) from public.collections),
      'custom_reminders', (select count(*) from public.custom_reminders)
    )
  );
end;
$$;

-- د. دالة الاستعادة الذرية الكاملة والشاملة
create or replace function public.restore_system_backup(
  p_payload jsonb,
  p_create_safety_snapshot boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manifest jsonb;
  v_tables jsonb;
  v_safety_result jsonb;
  v_restored_counts jsonb := '{}'::jsonb;
begin
  -- 1. التحقق الأمني من المدير
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'غير مصرح: استعادة النظام محصورة بمدير النظام فقط';
  end if;

  -- 2. التحقق من صحة الحزمة
  if p_payload is null or not (p_payload ? 'tables') then
    raise exception 'هيكل ملف النسخة الاحتياطية غير صالح';
  end if;

  v_manifest := p_payload->'manifest';
  v_tables := p_payload->'tables';

  -- 3. أخذ نقطة أمان آلية قبل البدء (إذا تم طلبها)
  if coalesce(p_create_safety_snapshot, true) then
    v_safety_result := public.generate_system_backup_json(
      'safety_pre_restore',
      'نقطة أمان تلقائية تم أخذها تلقائياً قبل تنفيذ عملية استعادة النظام'
    );
  end if;

  -- 4. إيقاف الـ Triggers مؤقتاً لتجنب تكرار الحوافز وسجلات التدقيق أثناء الإدخال الشامل
  set local session_replication_role = 'replica';

  -- 5. مسح الجداول بالترتيب العكسي للتبعيات (مع where true لتجاوز قيود safeupdate)
  delete from public.custom_reminders where true;
  delete from public.customer_personal_assignments where true;
  delete from public.collector_tier_settings where true;
  delete from public.notifications where true;
  delete from public.incentive_payments where true;
  delete from public.incentives where true;
  delete from public.collections where true;
  delete from public.followups where true;
  delete from public.due_dates where true;
  delete from public.balance_history where true;
  delete from public.balances where true;
  delete from public.customers where true;
  delete from public.excel_imports where true;
  delete from public.customer_categories where true;
  delete from public.settings where true;

  -- 6. إعادة ملء الجداول بالترتيب الطوبولوجي الصحيح
  -- أ. الإعدادات
  if v_tables ? 'settings' and jsonb_array_length(v_tables->'settings') > 0 then
    insert into public.settings select * from jsonb_populate_recordset(null::public.settings, v_tables->'settings');
  end if;

  -- ب. فئات العملاء
  if v_tables ? 'customer_categories' and jsonb_array_length(v_tables->'customer_categories') > 0 then
    insert into public.customer_categories select * from jsonb_populate_recordset(null::public.customer_categories, v_tables->'customer_categories');
  end if;

  -- ج. سجل الاستيراد
  if v_tables ? 'excel_imports' and jsonb_array_length(v_tables->'excel_imports') > 0 then
    insert into public.excel_imports select * from jsonb_populate_recordset(null::public.excel_imports, v_tables->'excel_imports');
  end if;

  -- د. العملاء
  if v_tables ? 'customers' and jsonb_array_length(v_tables->'customers') > 0 then
    insert into public.customers select * from jsonb_populate_recordset(null::public.customers, v_tables->'customers');
  end if;

  -- هـ. الأرصدة وسجلها والاستحقاق
  if v_tables ? 'balances' and jsonb_array_length(v_tables->'balances') > 0 then
    insert into public.balances select * from jsonb_populate_recordset(null::public.balances, v_tables->'balances');
  end if;
  if v_tables ? 'balance_history' and jsonb_array_length(v_tables->'balance_history') > 0 then
    insert into public.balance_history select * from jsonb_populate_recordset(null::public.balance_history, v_tables->'balance_history');
  end if;
  if v_tables ? 'due_dates' and jsonb_array_length(v_tables->'due_dates') > 0 then
    insert into public.due_dates select * from jsonb_populate_recordset(null::public.due_dates, v_tables->'due_dates');
  end if;

  -- و. المتابعات والدفعات والحوافز
  if v_tables ? 'followups' and jsonb_array_length(v_tables->'followups') > 0 then
    insert into public.followups select * from jsonb_populate_recordset(null::public.followups, v_tables->'followups');
  end if;
  if v_tables ? 'collections' and jsonb_array_length(v_tables->'collections') > 0 then
    insert into public.collections select * from jsonb_populate_recordset(null::public.collections, v_tables->'collections');
  end if;
  if v_tables ? 'incentives' and jsonb_array_length(v_tables->'incentives') > 0 then
    insert into public.incentives select * from jsonb_populate_recordset(null::public.incentives, v_tables->'incentives');
  end if;
  if v_tables ? 'incentive_payments' and jsonb_array_length(v_tables->'incentive_payments') > 0 then
    insert into public.incentive_payments select * from jsonb_populate_recordset(null::public.incentive_payments, v_tables->'incentive_payments');
  end if;

  -- ز. التنبيهات
  if v_tables ? 'notifications' and jsonb_array_length(v_tables->'notifications') > 0 then
    insert into public.notifications select * from jsonb_populate_recordset(null::public.notifications, v_tables->'notifications');
  end if;

  -- ح. بيانات V2: الفئات الشخصية والتذكيرات
  if v_tables ? 'collector_tier_settings' and jsonb_array_length(v_tables->'collector_tier_settings') > 0 then
    insert into public.collector_tier_settings select * from jsonb_populate_recordset(null::public.collector_tier_settings, v_tables->'collector_tier_settings');
  end if;
  if v_tables ? 'customer_personal_assignments' and jsonb_array_length(v_tables->'customer_personal_assignments') > 0 then
    insert into public.customer_personal_assignments select * from jsonb_populate_recordset(null::public.customer_personal_assignments, v_tables->'customer_personal_assignments');
  end if;
  if v_tables ? 'custom_reminders' and jsonb_array_length(v_tables->'custom_reminders') > 0 then
    insert into public.custom_reminders select * from jsonb_populate_recordset(null::public.custom_reminders, v_tables->'custom_reminders');
  end if;

  -- 7. إعادة تفعيل الـ Triggers للوضع الطبيعي
  set local session_replication_role = 'origin';

  -- 8. حساب الإحصائيات بعد الاستعادة
  v_restored_counts := jsonb_build_object(
    'customers', (select count(*) from public.customers),
    'balances', (select count(*) from public.balances),
    'followups', (select count(*) from public.followups),
    'collections', (select count(*) from public.collections),
    'custom_reminders', (select count(*) from public.custom_reminders)
  );

  -- 9. تسجيل العملية في سجل التدقيق الأمني
  insert into public.activity_logs (
    user_id, action, entity_type, entity_id, details
  ) values (
    v_user_id,
    'restore_backup',
    'system_restore',
    coalesce(v_manifest->>'backup_id', gen_random_uuid()::text),
    jsonb_build_object(
      'backup_name', v_manifest->>'backup_name',
      'created_at_in_backup', v_manifest->>'created_at',
      'safety_snapshot_created', coalesce(p_create_safety_snapshot, true),
      'restored_counts', v_restored_counts
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'تمت استعادة كافة بيانات النظام بنجاح تام',
    'restored_counts', v_restored_counts,
    'safety_snapshot_id', v_safety_result->'manifest'->>'backup_id'
  );
end;
$$;
