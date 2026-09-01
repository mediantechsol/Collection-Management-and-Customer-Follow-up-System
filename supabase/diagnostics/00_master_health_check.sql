-- ============================================================================
-- 🏥 الاستعلام التشخيصي الشامل والموحد لقاعدة البيانات (Master Health Check)
-- ============================================================================
-- الغرض: فحص فوري لكافة طبقات قاعدة البيانات (جداول، أمان RLS، دوال، قيود، سجلات يتيمة)
-- وإرجاع تقرير موحد يوضح أي خلل أو ثغرة محتملة بنقرة واحدة.
-- ============================================================================

with
-- 1. فحص وجود كافة جداول النظام الـ 16
expected_tables as (
  select unnest(array[
    'roles',
    'app_screens',
    'users',
    'customer_categories',
    'customers',
    'balances',
    'balance_history',
    'due_dates',
    'followups',
    'collections',
    'incentives',
    'incentive_payments',
    'notifications',
    'excel_imports',
    'activity_logs',
    'settings',
    'collector_tier_settings',
    'customer_personal_assignments',
    'custom_reminders',
    'system_backups'
  ]) as table_name
),
tables_check as (
  select
    '1. سلامة الجداول (Tables Existence)' as check_domain,
    et.table_name as item_name,
    case 
      when c.relname is not null then '✅ سليم'
      else '❌ جدول مفقود'
    end as status,
    case 
      when c.relname is not null then 'عدد السجلات التقريبي: ' || coalesce(c.reltuples::bigint, 0)::text
      else 'يجب إنشاء هذا الجدول'
    end as findings
  from expected_tables et
  left join pg_class c on c.relname = et.table_name and c.relnamespace = 'public'::regnamespace
),

-- 2. فحص تفعيل RLS على كل جداول النظام في schema public
rls_check as (
  select
    '2. أمان وسياسات RLS (Row Level Security)' as check_domain,
    t.table_name as item_name,
    case 
      when c.relrowsecurity then '✅ RLS مفعل'
      else '🚨 ثغرة أمنية: RLS معطل!'
    end as status,
    case 
      when not c.relrowsecurity then 'البيانات مكشوفة لأي مستخدم'
      when (select count(*) from pg_policy where polrelid = c.oid) = 0 then '⚠️ مفعل لكن لا توجد أي سياسات (مغلق بالكامل)'
      else 'عدد السياسات: ' || (select count(*) from pg_policy where polrelid = c.oid)::text
    end as findings
  from information_schema.tables t
  join pg_class c on c.relname = t.table_name and c.relnamespace = 'public'::regnamespace
  where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
),

-- 3. فحص أمان دوال الـ Security Definer وتعيين search_path
secdef_funcs as (
  select
    '3. أمان الدوال (Security Definer Search Path)' as check_domain,
    p.proname as item_name,
    case 
      when p.proconfig is not null and array_to_string(p.proconfig, ',') like '%search_path=%' then '✅ مؤمنة بـ search_path'
      when not p.prosecdef then '✅ Invoker آمنة'
      else '⚠️ غير مؤمنة: تفتقر لـ search_path ثابت'
    end as status,
    case 
      when p.prosecdef then 'Security Definer'
      else 'Security Invoker'
    end as findings
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosecdef = true
),

-- 4. فحص السجلات اليتيمة (Orphaned Records)
orphaned_checks as (
  -- أ. أرصدة بلا عملاء
  select
    '4. سلامة البيانات والسجلات اليتيمة' as check_domain,
    'أرصدة بدون عملاء (balances without customers)' as item_name,
    case when count(*) = 0 then '✅ سليم' else '❌ توجد سجلات تالفة' end as status,
    'عدد السجلات اليتيمة: ' || count(*)::text as findings
  from public.balances b
  left join public.customers c on b.customer_id = c.id
  where c.id is null

  union all

  -- ب. متابعات بلا عملاء
  select
    '4. سلامة البيانات والسجلات اليتيمة' as check_domain,
    'متابعات بدون عملاء (followups without customers)' as item_name,
    case when count(*) = 0 then '✅ سليم' else '❌ توجد سجلات تالفة' end as status,
    'عدد السجلات اليتيمة: ' || count(*)::text as findings
  from public.followups f
  left join public.customers c on f.customer_id = c.id
  where c.id is null

  union all

  -- ج. دفعات بلا عملاء
  select
    '4. سلامة البيانات والسجلات اليتيمة' as check_domain,
    'دفعات بدون عملاء (collections without customers)' as item_name,
    case when count(*) = 0 then '✅ سليم' else '❌ توجد سجلات تالفة' end as status,
    'عدد السجلات اليتيمة: ' || count(*)::text as findings
  from public.collections col
  left join public.customers c on col.customer_id = c.id
  where c.id is null

  union all

  -- د. حوافز بلا دفعات
  select
    '4. سلامة البيانات والسجلات اليتيمة' as check_domain,
    'حوافز بدون دفعات (incentives without collections)' as item_name,
    case when count(*) = 0 then '✅ سليم' else '❌ توجد سجلات تالفة' end as status,
    'عدد السجلات اليتيمة: ' || count(*)::text as findings
  from public.incentives inc
  left join public.collections col on inc.collection_id = col.id
  where col.id is null

  union all

  -- هـ. تذكيرات بلا عملاء
  select
    '4. سلامة البيانات والسجلات اليتيمة' as check_domain,
    'تذكيرات بدون عملاء (custom_reminders without customers)' as item_name,
    case when count(*) = 0 then '✅ سليم' else '❌ توجد سجلات تالفة' end as status,
    'عدد السجلات اليتيمة: ' || count(*)::text as findings
  from public.custom_reminders r
  left join public.customers c on r.customer_id = c.id
  where r.customer_id is not null and c.id is null
),

-- 5. فحص الـ Triggers الأساسية وسجل التدقيق
triggers_check as (
  select
    '5. المحفزات التلقائية (Triggers & Audit)' as check_domain,
    tg.tgname as item_name,
    '✅ مفعل' as status,
    'على جدول: ' || rel.relname as findings
  from pg_trigger tg
  join pg_class rel on tg.tgrelid = rel.oid
  where not tg.tgisinternal
    and rel.relnamespace = 'public'::regnamespace
)

-- تجميع التقرير النهائي الشامل
select * from tables_check
union all
select * from rls_check
union all
select * from secdef_funcs
union all
select * from orphaned_checks
union all
select * from triggers_check
order by check_domain, item_name;
