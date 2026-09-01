-- ============================================================================
-- 1. فحص سلامة وتكامل هيكل الجداول والـ Views والمفاتيح الأساسية
-- ============================================================================

-- أ. التحقق من وجود المفاتيح الأساسية (Primary Keys) على كل الجداول
select 
  t.table_name,
  case 
    when pk.constraint_name is not null then '✅ يوجد مفتاح أساسي'
    else '❌ يفتقر لمفتاح أساسي (Primary Key Missing)'
  end as pk_status,
  coalesce(pk.constraint_name, 'None') as constraint_name
from information_schema.tables t
left join (
  select tc.table_name, tc.constraint_name
  from information_schema.table_constraints tc
  where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
) pk on t.table_name = pk.table_name
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by pk_status desc, t.table_name;


-- ب. التحقق من الـ Views وعلم security_invoker (من خلال reloptions في pg_class)
select 
  v.relname as view_name,
  case 
    when v.relname = 'user_directory' then '✅ دليل المستخدمين (مخصص للعرض العام الآمن)'
    when array_to_string(v.reloptions, ',') like '%security_invoker=true%' or array_to_string(v.reloptions, ',') like '%security_invoker=on%' then '✅ Security Invoker مفعل (يحترم RLS)'
    else '⚠️ Security Invoker غير محدد (يمكن تفعيله بـ ALTER VIEW ... SET security_invoker = true)'
  end as view_security_status,
  coalesce(array_to_string(v.reloptions, ','), 'None') as current_options
from pg_views p
join pg_class v on v.relname = p.viewname and v.relnamespace = 'public'::regnamespace
where p.schemaname = 'public'
order by v.relname;
