-- ============================================================================
-- فحوصات الأمان والنزاهة للنسخ الاحتياطي والاستعادة — V2 Module 4
-- ============================================================================

begin;

-- 1. التأكد من وجود جدول system_backups والفهارس
select count(*) >= 0 from public.system_backups;

-- 2. التأكد من تفعيل RLS على جدول system_backups
select relrowsecurity from pg_class where relname = 'system_backups';

-- 3. التأكد من وجود مستودع backups في Storage
select id, public, file_size_limit from storage.buckets where id = 'backups';

-- 4. التأكد من وجود الدوال الأربع الأساسية
select proname from pg_proc where proname in (
  'generate_system_backup_json',
  'delete_system_backup_record',
  'validate_system_backup_payload',
  'restore_system_backup'
);

rollback;
