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
