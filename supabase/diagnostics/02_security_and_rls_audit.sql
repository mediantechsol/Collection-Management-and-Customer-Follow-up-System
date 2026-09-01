-- ============================================================================
-- 2. الفحص الأمني الشامل لسياسات الـ RLS وحماية الصلاحيات
-- ============================================================================

-- أ. قائمة بجميع سياسات الـ RLS على كل الجداول مع العمليات (SELECT, INSERT, UPDATE, DELETE)
select 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operation,
  qual as using_expression,
  with_check as check_expression
from pg_policies
where schemaname = 'public'
order by tablename, cmd;


-- ب. الكشف عن أي جدول عام في public يفتقر لتفعيل RLS
select 
  table_name,
  '🚨 تحذير: RLS معطل بالكامل!' as risk_level
from information_schema.tables t
join pg_class c on c.relname = t.table_name and c.relnamespace = 'public'::regnamespace
where t.table_schema = 'public' 
  and t.table_type = 'BASE TABLE'
  and not c.relrowsecurity;


-- ج. فحص سياسات مستودعات التخزين (Storage Buckets RLS)
select 
  b.id as bucket_id,
  b.public as is_public,
  b.file_size_limit,
  b.allowed_mime_types,
  count(p.policyname) as security_policies_count
from storage.buckets b
left join pg_policies p on p.schemaname = 'storage' and p.tablename = 'objects'
group by b.id, b.public, b.file_size_limit, b.allowed_mime_types;
