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
