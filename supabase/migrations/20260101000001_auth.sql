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
