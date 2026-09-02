-- =============================================================================
-- ترحيل: إصلاح شامل لدفعات العملات الأجنبية (USD/SAR) واستيراد العملاء
-- التاريخ: 2026-09-02
--
-- الإصلاحات:
--   1) دالة normalize_arabic() في قاعدة البيانات لتطبيع الأسماء والهمزات.
--   2) import_balances():
--      - اشتقاق التحصيل من انخفاض المدين (prev_debit - debit) أو زيادة الدائن (credit - prev_credit).
--      - التقاط سدادات العملات الأجنبية سواء قيدت بإنقاص المدين أو بزيادة الدائن.
--   3) import_customers():
--      - مطابقة اسم المحصّل بعد تطبيع الهمزات والألف والياء لمنع ضياع التعيين واختفاء العملاء عن المحصلين.
--      - الحفاظ على العملاء وعدم إسقاط أي عميل.
--   4) sync_balance_for_manual_collection():
--      - ربط الدفعات اليدوية المعتمدة (source = 'manual') بتحديث رصيد جدول balances مباشرة.
-- =============================================================================

-- 1) دالة تطبيع النصوص العربية في PostgreSQL
create or replace function public.normalize_arabic(p_text text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        translate(
          coalesce(trim(p_text), ''),
          'أإآٱىةـًٌٍَُِّْٰ',
          'ااااي ه         '
        ),
        '\s+', ' ', 'g'
      ),
      '[\x00-\x1F\x7F]', '', 'g'
    ),
    ''
  );
$$;

-- 2) دالة استيراد الأرصدة المحدثة لاشتقاق الدفعات من انخفاض المدين أو زيادة الدائن
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

  -- أسعار الصرف من الإعدادات مع قيمة افتراضية آمنة
  select coalesce(exchange_rate_usd, 530),
         coalesce(exchange_rate_sar, 141)
  into v_rate_usd, v_rate_sar
  from public.settings limit 1;

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

  -- اشتقاق الدفعات المحصّلة:
  -- يُحتسب التحصيل إما من زيادة الجانب الدائن (credit - prev_credit)
  -- أو من انخفاض الجانب المدين (prev_debit - debit) في كشوف الأرصدة الصافية
  if p_derive_collections then
    insert into public.collections(
      customer_id, user_id, currency, amount, rate_used, amount_yer,
      collected_date, source, import_id, note, created_by
    )
    select
      h.customer_id,
      c.assigned_user_id,
      h.currency,
      calc.collected_amount,
      case h.currency when 'USD' then v_rate_usd when 'SAR' then v_rate_sar else 1 end,
      round(calc.collected_amount * case h.currency when 'USD' then v_rate_usd when 'SAR' then v_rate_sar else 1 end, 2),
      current_date, 'import', v_import_id,
      case
        when (h.credit > h.prev_credit and h.prev_debit > h.debit) then
          'مشتقّة آلياً من حركة سداد بالملف: ' || p_file_name
        when (h.prev_debit > h.debit) then
          'مشتقّة آلياً من انخفاض المدين (سداد) في ملف: ' || p_file_name
        else
          'مشتقّة آلياً من زيادة الجانب الدائن في ملف: ' || p_file_name
      end,
      v_uid
    from public.balance_history h
    join public.customers c on c.id = h.customer_id
    cross join lateral (
      select (greatest(0, h.credit - h.prev_credit) + greatest(0, h.prev_debit - h.debit)) as collected_amount
    ) calc
    where h.import_id = v_import_id
      and calc.collected_amount > 0
      -- شرط وجود رصيد سابق يثبت أن هذه ليست أرصدة افتتاحية أولية
      and (
        exists (
          select 1 from public.balances b
          where b.customer_id = h.customer_id and b.currency = h.currency
        )
        or
        -- عميل قائم له رصيد بعملة أخرى ويظهر بعملة جديدة
        (h.prev_credit = 0 and h.prev_debit = 0 and exists (
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

-- 3) دالة استيراد بيانات العملاء المحدثة بمطابقة لغوية مرنة للمحصلين
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
    nullif(trim(r->>'category_name'), '')                    as category_name,
    (r->>'due_date')::date                                   as due_date,
    coalesce((r->>'grace_1')::int, 0)                        as grace_1,
    coalesce((r->>'grace_2')::int, 0)                        as grace_2,
    coalesce((r->>'grace_3')::int, 0)                        as grace_3,
    nullif(trim(r->>'note_1'), '')                           as note_1,
    nullif(trim(r->>'note_2'), '')                           as note_2
  from jsonb_array_elements(p_rows) r
  where public.normalize_customer_number(r->>'customer_number') is not null
  order by 1;

  select count(*) into v_rows from _in_cust;

  select count(*) into v_new_customers
  from _in_cust i
  left join public.customers c on c.customer_number = i.customer_number
  where c.id is null;

  -- فحص أسماء المسؤولين غير المطابقين بعد تطبيع الحروف والهمزات
  select array_agg(distinct i.assigned_name)
  into v_unmatched
  from _in_cust i
  where i.assigned_name is not null
    and not exists (
      select 1 from public.users u
      where public.normalize_arabic(u.full_name) = public.normalize_arabic(i.assigned_name)
         or public.normalize_arabic(u.username) = public.normalize_arabic(i.assigned_name)
         or lower(u.username) = lower(trim(i.assigned_name))
    );

  -- إدراج/تحديث العملاء مع مطابقة لغوية مرنة للمحصل والفئة
  insert into public.customers as c
    (customer_number, customer_name, mobile_1, mobile_2, guarantor, status_customer, assigned_user_id, customer_category_id)
  select
    i.customer_number,
    coalesce(i.customer_name, 'عميل ' || i.customer_number),
    i.mobile_1, i.mobile_2, i.guarantor, i.status_customer,
    (select u.id from public.users u
      where public.normalize_arabic(u.full_name) = public.normalize_arabic(i.assigned_name)
         or public.normalize_arabic(u.username) = public.normalize_arabic(i.assigned_name)
         or lower(u.username) = lower(trim(i.assigned_name))
      limit 1),
    (select cat.id from public.customer_categories cat
      where public.normalize_arabic(cat.category_name) = public.normalize_arabic(i.category_name)
      limit 1)
  from _in_cust i
  on conflict (customer_number) do update set
    customer_name        = coalesce(excluded.customer_name, c.customer_name),
    mobile_1             = coalesce(excluded.mobile_1, c.mobile_1),
    mobile_2             = coalesce(excluded.mobile_2, c.mobile_2),
    guarantor            = coalesce(excluded.guarantor, c.guarantor),
    status_customer      = coalesce(excluded.status_customer, c.status_customer),
    assigned_user_id     = coalesce(excluded.assigned_user_id, c.assigned_user_id),
    customer_category_id = coalesce(excluded.customer_category_id, c.customer_category_id);

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
    'unmatched_assignees', coalesce(v_unmatched, array[]::text[])
  );
end;
$$;

-- 4) دالة وتريغر لتحديث رصيد جدول balances عند اعتماد دفعة يدوية مباشرة
create or replace function public.sync_balance_for_manual_collection()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.source = 'manual') or
     (tg_op = 'UPDATE' and (new.source = 'manual' or old.source = 'manual')) or
     (tg_op = 'DELETE' and old.source = 'manual') then

    -- عند اعتماد دفعة يدوية جديدة أو تعديلها إلى معتمدة
    if (tg_op = 'INSERT' and new.confirmed_at is not null) or
       (tg_op = 'UPDATE' and old.confirmed_at is null and new.confirmed_at is not null) then
      insert into public.balances(customer_id, currency, debit, credit)
      values (new.customer_id, new.currency, 0, new.amount)
      on conflict (customer_id, currency) do update set
        credit = public.balances.credit + excluded.credit,
        updated_at = now();

    -- عند إلغاء اعتماد دفعة يدوية
    elsif (tg_op = 'UPDATE' and old.confirmed_at is not null and new.confirmed_at is null) then
      update public.balances
      set credit = greatest(0, credit - old.amount),
          updated_at = now()
      where customer_id = old.customer_id and currency = old.currency;

    -- عند حذف دفعة يدوية كانت معتمدة
    elsif (tg_op = 'DELETE' and old.confirmed_at is not null) then
      update public.balances
      set credit = greatest(0, credit - old.amount),
          updated_at = now()
      where customer_id = old.customer_id and currency = old.currency;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_balance_manual_collection on public.collections;
create trigger trg_sync_balance_manual_collection
  after insert or update of confirmed_at or delete
  on public.collections
  for each row execute function public.sync_balance_for_manual_collection();
