-- ============================================================================
-- ربط جدول public.users بمصادقة Supabase الحقيقية (auth.users)
-- شغّل هذا الملف بعد 00_schema.sql مباشرة.
--
-- الفكرة: auth.users هو الجدول الذي تديره Supabase فعلياً (كلمات المرور،
-- التشفير، تسجيل الدخول، استرجاع كلمة المرور... كل هذا تلقائي ولا تكتبه أنت).
-- public.users هو جدول "الملف الشخصي" (Profile) الذي يحمل full_name والدور
-- والصلاحيات الخاصة بالنظام. الاثنان مرتبطان بنفس الـ id.
--
-- تسلسل إنشاء مستخدم جديد بالإنتاج الفعلي (وليس بالسكربت هنا فقط):
--   1) استدعاء supabase.auth.admin.createUser({email, password}) من الخادم
--      (Edge Function أو Backend) — لا تُنشئ مستخدمين من الواجهة مباشرة.
--   2) الـ trigger أدناه ينشئ تلقائياً سطراً مبدئياً في public.users.
--   3) بعدها تُحدَّث بيانات الدور/الصلاحيات في public.users بشاشة "المستخدمون".
-- ============================================================================

-- عند إنشاء مستخدم جديد بـ auth.users، أنشئ تلقائياً سطراً مبدئياً بـ public.users
-- بدور افتراضي "مستخدم مخصص" بدون أي شاشات مفعّلة (أكثر الخيارات أماناً)،
-- إلى أن يقوم مدير النظام بتعيين الدور والصلاحيات الفعلية يدوياً.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_default_role uuid;
begin
  select id into v_default_role from public.roles where name_role = 'مستخدم مخصص' limit 1;

  insert into public.users (id, full_name, username, role_id, status, allowed_screens, allowed_category_ids)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    v_default_role,
    'موقوف',      -- يبدأ موقوفاً حتى يفعّله مدير النظام صراحة بعد ضبط صلاحياته
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

-- حذف مستخدم من auth.users يحذف تلقائياً سطره من public.users (نفس الـ id)
alter table public.users
  add constraint fk_users_auth foreign key (id) references auth.users(id) on delete cascade;

-- ============================================================================
-- دوال مساعدة تُستخدم بكل مكان (RLS، والاستعلامات، والشاشات) لمعرفة هوية
-- وصلاحيات المستخدم الحالي المسجّل دخوله عبر Supabase Auth (auth.uid()).
-- ============================================================================
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select r.name_role from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean language sql stable as $$
  select public.current_role_name() = 'مدير النظام';
$$;
create or replace function public.is_accountant() returns boolean language sql stable as $$
  select public.current_role_name() = 'المحاسب';
$$;
create or replace function public.is_collector() returns boolean language sql stable as $$
  select public.current_role_name() = 'مسؤول التحصيل';
$$;
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path = public as $$
  select status = 'نشط' from public.users where id = auth.uid();
$$;

create or replace function public.my_allowed_category_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select allowed_category_ids from public.users where id = auth.uid();
$$;

create or replace function public.has_screen_access(p_screen text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_screen = any(allowed_screens) from public.users where id = auth.uid();
$$;

-- ============================================================================
-- ملاحظة أمان مهمة: بيانات الدخول التجريبية الموجودة بالنموذج الأولي
-- (ayman/ayman123 ... إلخ) يجب ألا تُستخدم إطلاقاً بالإنتاج الفعلي. أنشئ
-- حسابات حقيقية عبر supabase.auth.admin.createUser بكلمات مرور قوية، ثم
-- فعّل كل مستخدم يدوياً من شاشة "المستخدمون" بعد ضبط دوره وصلاحياته.
-- ============================================================================
