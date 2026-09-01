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
