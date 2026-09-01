-- ============================================================================
-- 5. فحص الأداء والفهارس ومفاتيح الربط السريع (Performance & Indexes)
-- ============================================================================

-- أ. التحقق من وجود فهارس لكافة أعمدة المفاتيح الأجنبية لتسريع استعلامات الربط
select 
  c.conrelid::regclass as table_name,
  c.conname as foreign_key_name,
  pg_get_constraintdef(c.oid) as constraint_definition,
  case 
    when exists (
      select 1 from pg_index i 
      where i.indrelid = c.conrelid 
        and (c.conkey::smallint[]) <@ (i.indkey::smallint[])
    ) then '✅ مفهرس بالكامل'
    else '⚠️ يفتقر لفهرس مخصص (قد يبطئ الاستعلامات)'
  end as index_status
from pg_constraint c
where c.contype = 'f' 
  and c.connamespace = 'public'::regnamespace
order by index_status desc, table_name;


-- ب. أحجام الجداول والفهارس في قاعدة البيانات
select 
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  pg_size_pretty(pg_relation_size(c.oid)) as table_size,
  pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size
from pg_class c
where relkind = 'r' 
  and relnamespace = 'public'::regnamespace
order by pg_total_relation_size(c.oid) desc;
