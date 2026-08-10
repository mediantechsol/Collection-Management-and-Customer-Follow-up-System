-- ============================================================================
-- اختبارات RLS ومنطق الاستيراد — تُشغَّل في SQL Editor بلوحة تحكم Supabase.
--
-- ⚠️ هذه الاختبارات هي شرط قبول العمل، وليست اختياراً. صلاحيات مفروضة في
-- الواجهة فقط يمكن تجاوزها من أدوات المطوّر بالمتصفح؛ ما يهم فعلاً هو ما
-- ترجعه قاعدة البيانات لكل دور.
--
-- قبل التشغيل: أنشئ المستخدمين الأربعة من التطبيق (شاشة المستخدمين)، ثم ضع
-- معرّفاتهم أدناه. اجلبها بـ:
--     select id, username, full_name, status from public.users order by username;
--
-- كل السكربت داخل معاملة تنتهي بـ rollback — لا يترك أي أثر في البيانات.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- الإعداد
create temp table _ids (label text primary key, id uuid);
insert into _ids(label, id) values
  ('admin',      '00000000-0000-0000-0000-000000000000'),  -- ← ضع معرّف مدير النظام
  ('accountant', '00000000-0000-0000-0000-000000000000'),  -- ← ضع معرّف المحاسب
  ('collector1', '00000000-0000-0000-0000-000000000000'),  -- ← ضع معرّف مسؤول تحصيل نشط
  ('collector2', '00000000-0000-0000-0000-000000000000');  -- ← ضع معرّف مسؤول تحصيل موقوف

do $$
begin
  if exists (select 1 from _ids where id = '00000000-0000-0000-0000-000000000000') then
    raise exception 'ضع معرّفات المستخدمين الحقيقية في جدول _ids أعلاه قبل التشغيل';
  end if;
end $$;

-- دالة مساعدة: تقمّص مستخدم معيّن كما يفعل PostgREST
create or replace function pg_temp.act_as(p_label text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from _ids where label = p_label;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ============================================================================
-- 1) مسؤول التحصيل يرى عملاءه فقط
-- ============================================================================
do $$
declare
  v_all   int;
  v_mine  int;
  v_seen  int;
begin
  perform pg_temp.as_service();
  select count(*) into v_all from public.customers;
  select count(*) into v_mine from public.customers
   where assigned_user_id = (select id from _ids where label='collector1')
     and is_active;

  perform pg_temp.act_as('collector1');
  select count(*) into v_seen from public.customers;

  raise notice 'إجمالي العملاء: % | عملاء المحصّل: % | ما يراه فعلياً: %', v_all, v_mine, v_seen;

  assert v_seen <= v_mine,
    format('فشل: مسؤول التحصيل يرى %s عميلاً بينما المعيَّن له %s فقط', v_seen, v_mine);

  assert not exists (
    select 1 from public.customers
    where assigned_user_id is distinct from (select id from _ids where label='collector1')
  ), 'فشل: مسؤول التحصيل يرى عملاء غير معيَّنين له';

  raise notice '✔ 1) عزل عملاء مسؤول التحصيل سليم';
end $$;

-- ============================================================================
-- 2) قيد الفئات يُطبَّق فوق قيد التعيين
-- ============================================================================
do $$
declare v_bad int;
begin
  perform pg_temp.act_as('collector1');

  select count(*) into v_bad
  from public.customers c
  where array_length(public.my_allowed_category_ids(), 1) is not null
    and (c.customer_category_id is null
         or not (c.customer_category_id = any(public.my_allowed_category_ids())));

  assert v_bad = 0, format('فشل: %s عميل ظاهر خارج الفئات المسموحة', v_bad);
  raise notice '✔ 2) قيد فئات العملاء سليم';
end $$;

-- ============================================================================
-- 3) المستخدم الموقوف لا يرى شيئاً إطلاقاً
-- ============================================================================
do $$
declare v_c int; v_f int; v_n int;
begin
  perform pg_temp.act_as('collector2');   -- يجب أن يكون status='موقوف'
  select count(*) into v_c from public.customers;
  select count(*) into v_f from public.followups;
  select count(*) into v_n from public.notifications;

  assert v_c = 0 and v_f = 0 and v_n = 0,
    format('فشل: المستخدم الموقوف يرى عملاء=%s متابعات=%s تنبيهات=%s', v_c, v_f, v_n);
  raise notice '✔ 3) المستخدم الموقوف معزول تماماً';
end $$;

-- ============================================================================
-- 4) غير المدير لا يستطيع تعديل المستخدمين
-- ============================================================================
do $$
declare v_err text;
begin
  perform pg_temp.act_as('collector1');
  begin
    update public.users set status = 'نشط'
     where id = (select id from _ids where label='collector2');
    -- RLS لا ترمي خطأً بل تُصفّر الصفوف المتأثرة
    if found then
      raise exception 'فشل: مسؤول التحصيل عدّل بيانات مستخدم آخر';
    end if;
  exception when insufficient_privilege then
    v_err := 'rejected';
  end;
  raise notice '✔ 4) تعديل المستخدمين محصور بالمدير';
end $$;

-- ============================================================================
-- 5) سجل التدقيق غير قابل للكتابة من التطبيق
-- ============================================================================
do $$
begin
  perform pg_temp.act_as('collector1');
  begin
    insert into public.activity_logs(user_id, action_type, table_name, record_id)
    values ((select id from _ids where label='collector1'), 'fake', 'customers', 'x');
    raise exception 'فشل: أمكن حقن سطر مزوّر في سجل التدقيق';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '%فشل:%' then raise; end if;
  end;
  raise notice '✔ 5) سجل التدقيق محمي من التزوير';
end $$;

-- ============================================================================
-- 6) رفع الحالة للمدير يعمل لمسؤول التحصيل (كان يفشل في التصميم القديم)
-- ============================================================================
do $$
declare v_customer uuid; v_notif uuid;
begin
  perform pg_temp.act_as('collector1');
  select id into v_customer from public.customers limit 1;

  if v_customer is null then
    raise notice '⚠ 6) تخطّي الاختبار: لا يوجد عميل معيَّن لهذا المحصّل';
  else
    select public.escalate_customer(v_customer, 'اختبار') into v_notif;
    assert v_notif is not null, 'فشل: تعذّر رفع الحالة للمدير';
    raise notice '✔ 6) رفع الحالة للمدير يعمل';
  end if;
end $$;

-- ============================================================================
-- 7) الاستيراد المتكرر لا يضاعف الأرصدة — أخطر خلل في التصميم القديم
-- ============================================================================
do $$
declare
  v_payload jsonb := '[
    {"customer_number":"TEST-9001","customer_name":"عميل اختبار","currency":"YER","debit":100000,"credit":0}
  ]'::jsonb;
  v_total_1 numeric;
  v_total_2 numeric;
  v_collections int;
  v_res jsonb;
begin
  perform pg_temp.act_as('accountant');

  v_res := public.import_balances('اختبار-١.xlsx', v_payload, true);
  select debit - credit into v_total_1
  from public.balances b
  join public.customers c on c.id = b.customer_id
  where c.customer_number = 'TEST-9001' and b.currency = 'YER';

  v_res := public.import_balances('اختبار-٢.xlsx', v_payload, true);
  select debit - credit into v_total_2
  from public.balances b
  join public.customers c on c.id = b.customer_id
  where c.customer_number = 'TEST-9001' and b.currency = 'YER';

  assert v_total_1 = 100000, format('فشل: الرصيد بعد أول استيراد %s بدل 100000', v_total_1);
  assert v_total_2 = 100000,
    format('فشل: الرصيد تضاعف بعد إعادة الاستيراد (%s بدل 100000)', v_total_2);

  assert (v_res->>'collections')::int = 0,
    'فشل: اشتُقّت دفعة محصّلة رغم عدم تغيّر الجانب الدائن';

  raise notice '✔ 7) إعادة الاستيراد لا تضاعف الأرصدة';
end $$;

-- ============================================================================
-- 8) اشتقاق الدفعة المحصّلة من زيادة الجانب الدائن
-- ============================================================================
do $$
declare
  v_res jsonb;
  v_amount numeric;
begin
  perform pg_temp.act_as('accountant');

  v_res := public.import_balances('اختبار-٣.xlsx', '[
    {"customer_number":"TEST-9001","customer_name":"عميل اختبار","currency":"YER","debit":100000,"credit":30000}
  ]'::jsonb, true);

  assert (v_res->>'collections')::int = 1,
    format('فشل: عدد الدفعات المشتقّة %s بدل 1', v_res->>'collections');

  select amount into v_amount
  from public.collections
  where import_id = (v_res->>'import_id')::uuid;

  assert v_amount = 30000, format('فشل: مبلغ الدفعة %s بدل 30000', v_amount);

  -- الدفعة تبقى غير معتمدة، فلا حافز بعد
  assert not exists (
    select 1 from public.incentives i
    join public.collections c on c.id = i.collection_id
    where c.import_id = (v_res->>'import_id')::uuid
  ), 'فشل: احتُسب حافز لدفعة غير معتمدة';

  raise notice '✔ 8) اشتقاق الدفعات من الجانب الدائن سليم، ولا حافز قبل الاعتماد';
end $$;

-- ============================================================================
-- 9) دوال حساب قواعد العمل
-- ============================================================================
do $$
begin
  perform pg_temp.as_service();

  assert public.calc_new_due_date(date '2026-01-01', 5, 3, 2) = date '2026-01-11',
    'فشل: حساب تاريخ الاستحقاق الجديد';
  assert public.calc_remaining_days(date '2026-01-11', date '2026-01-01') = 10,
    'فشل: حساب الأيام المتبقية';
  assert public.calc_total_due_yer(100, 200, 5000, 530, 141) = 100*530 + 200*141 + 5000,
    'فشل: تحويل العملات';
  assert public.calc_incentive_amount(100000, 3) = 3000,
    'فشل: حساب الحافز';
  assert public.normalize_customer_number('00001') = '1'
     and public.normalize_customer_number(' 23 ') = '23',
    'فشل: تطبيع رقم العميل';

  raise notice '✔ 9) دوال قواعد العمل مطابقة للمتوقع';
end $$;

rollback;

-- ============================================================================
-- تشغيل ناجح = ظهور كل الأسطر ✔ بلا أي exception.
-- أي فشل يوقف السكربت عند أول assert خاطئ ويطبع سبب الفشل.
-- ============================================================================
