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
