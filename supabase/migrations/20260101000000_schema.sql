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
