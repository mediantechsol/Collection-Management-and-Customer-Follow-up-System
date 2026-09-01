-- ============================================================================
-- 4. فحص المحفزات التلقائية (Triggers) وسجل التدقيق والحوافز
-- ============================================================================

-- أ. قائمة الـ Triggers النشطة ودوال المعالجة المرتبطة بها
select 
  c.relname as table_name,
  t.tgname as trigger_name,
  p.proname as trigger_function,
  case 
    when t.tgenabled = 'O' then '✅ مفعل (Origin & Local)'
    when t.tgenabled = 'D' then '❌ معطل (Disabled)'
    when t.tgenabled = 'A' then '⚡ مفعل دائماً (Always)'
    else t.tgenabled::text
  end as trigger_status
from pg_trigger t
join pg_class c on t.tgrelid = c.oid
join pg_proc p on t.tgfoid = p.oid
where not t.tgisinternal
  and c.relnamespace = 'public'::regnamespace
order by c.relname, t.tgname;


-- ب. التحقق من سجل التدقيق ونشاط النظام والعمليات المسجلة
select 
  action_type,
  table_name,
  count(*) as operations_count,
  max(created_at) as last_operation_time
from public.activity_logs
group by action_type, table_name
order by operations_count desc;
