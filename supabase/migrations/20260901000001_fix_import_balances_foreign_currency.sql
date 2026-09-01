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
