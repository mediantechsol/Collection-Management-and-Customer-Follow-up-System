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
