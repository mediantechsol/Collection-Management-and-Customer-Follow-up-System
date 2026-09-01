-- ============================================================================
-- مركز النسخ الاحتياطي والاستعادة من الواجهة — V2 Module 4
--
-- هذا الملف يُنشئ:
--  1) جدول system_backups: سجل لكافة النسخ الاحتياطية (اليدوية، المجدولة، ونقاط الأمان).
--  2) سياسات RLS وقواعد الأمان: قصر الوصول والإدارة حصرياً على مدير النظام.
--  3) مستودع التخزين السحابي (backups bucket) وسياسات الحماية.
--  4) دالة generate_system_backup_json(): تجميع كافة جداول V1 و V2 في حزمة JSON
--     موحدة ومشفرة بالبصمة الرقمية (SHA-256) وتسجيل العملية في سجل التدقيق.
--  5) دالة delete_system_backup_record(): لحذف سجل نسخة احتياطية من قبل المدير.
--  6) دالة validate_system_backup_payload(): فحص ومقارنة حزمة النسخة قبل الاستعادة.
--  7) دالة restore_system_backup(): استعادة ذرية شاملة مع أخذ نقطة أمان آلية.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- 1. جدول سجل النسخ الاحتياطية
create table if not exists public.system_backups (
  id                  uuid primary key default gen_random_uuid(),
  backup_name         text not null,
  file_name           text not null,
  file_size_bytes     bigint not null default 0,
  storage_path        text,
  backup_type         text not null default 'manual' check (backup_type in ('manual', 'auto_scheduled', 'safety_pre_restore')),
  checksum_sha256     text not null,
  table_counts        jsonb not null default '{}'::jsonb,
  notes               text,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- فهارس الأداء السريع
create index if not exists idx_system_backups_created_at on public.system_backups(created_at desc);
create index if not exists idx_system_backups_type on public.system_backups(backup_type);

-- ---------------------------------------------------------------- 2. سياسات الحماية على مستوى الصف (RLS)
alter table public.system_backups enable row level security;

-- صلاحية كاملة لمدير النظام فقط
drop policy if exists system_backups_admin_all on public.system_backups;
create policy system_backups_admin_all on public.system_backups
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------- 3. مستودع التخزين السحابي المحمي
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 104857600, array['application/json', 'application/gzip', 'application/octet-stream'])
on conflict (id) do update set
  public = false,
  file_size_limit = 104857600;

-- سياسات RLS على مستودع التخزين
drop policy if exists backups_bucket_admin_select on storage.objects;
create policy backups_bucket_admin_select on storage.objects
  for select
  using (bucket_id = 'backups' and public.is_admin());

drop policy if exists backups_bucket_admin_insert on storage.objects;
create policy backups_bucket_admin_insert on storage.objects
  for insert
  with check (bucket_id = 'backups' and public.is_admin());

drop policy if exists backups_bucket_admin_delete on storage.objects;
create policy backups_bucket_admin_delete on storage.objects
  for delete
  using (bucket_id = 'backups' and public.is_admin());

-- ---------------------------------------------------------------- 4. دوال الـ RPC للنسخ الاحتياطي

-- أ. دالة توليد حزمة النسخة الاحتياطية الشاملة
create or replace function public.generate_system_backup_json(
  p_backup_type text default 'manual',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_payload jsonb;
  v_tables jsonb;
  v_counts jsonb;
  v_backup_id uuid := gen_random_uuid();
  v_backup_name text;
  v_file_name text;
  v_checksum text;
  v_now_str text := to_char(now() at time zone 'UTC', 'YYYYMMDD_HH24MISS');
begin
  -- التحقق من صلاحية المدير
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'غير مصرح: عملية النسخ الاحتياطي محصورة بمدير النظام فقط';
  end if;

  select username into v_username from public.users where id = v_user_id;

  v_backup_name := case 
    when p_backup_type = 'safety_pre_restore' then 'نقطة أمان تلقائية قبل الاستعادة (' || v_now_str || ')'
    when p_backup_type = 'auto_scheduled' then 'نسخة مجدولة آلية (' || v_now_str || ')'
    else 'نسخة احتياطية يدوية (' || v_now_str || ')'
  end;

  v_file_name := 'backup_' || v_now_str || '_' || coalesce(p_backup_type, 'manual') || '.json';

  -- استخراج كافة الجداول كـ JSON
  v_tables := jsonb_build_object(
    'settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.settings t),
    'customer_categories', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customer_categories t),
    'customers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customers t),
    'balances', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.balances t),
    'balance_history', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.balance_history t),
    'due_dates', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.due_dates t),
    'followups', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.followups t),
    'collections', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.collections t),
    'incentives', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.incentives t),
    'incentive_payments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.incentive_payments t),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.notifications t),
    'excel_imports', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.excel_imports t),
    'collector_tier_settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.collector_tier_settings t),
    'customer_personal_assignments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customer_personal_assignments t),
    'custom_reminders', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.custom_reminders t)
  );

  -- إحصاء عدد السجلات في كل جدول
  v_counts := jsonb_build_object(
    'settings', (select count(*) from public.settings),
    'customer_categories', (select count(*) from public.customer_categories),
    'customers', (select count(*) from public.customers),
    'balances', (select count(*) from public.balances),
    'balance_history', (select count(*) from public.balance_history),
    'due_dates', (select count(*) from public.due_dates),
    'followups', (select count(*) from public.followups),
    'collections', (select count(*) from public.collections),
    'incentives', (select count(*) from public.incentives),
    'incentive_payments', (select count(*) from public.incentive_payments),
    'notifications', (select count(*) from public.notifications),
    'excel_imports', (select count(*) from public.excel_imports),
    'collector_tier_settings', (select count(*) from public.collector_tier_settings),
    'customer_personal_assignments', (select count(*) from public.customer_personal_assignments),
    'custom_reminders', (select count(*) from public.custom_reminders)
  );

  -- حساب البصمة الرقمية للبيانات (دالة sha256 أصلية في بوستجريس)
  v_checksum := encode(sha256(convert_to(v_tables::text, 'UTF8')), 'hex');

  -- بناء الـ Payload النهائي المتكامل
  v_payload := jsonb_build_object(
    'manifest', jsonb_build_object(
      'format_version', '2.0',
      'app_version', 'SCP-V2',
      'backup_type', coalesce(p_backup_type, 'manual'),
      'backup_id', v_backup_id,
      'backup_name', v_backup_name,
      'file_name', v_file_name,
      'checksum_sha256', v_checksum,
      'created_at', now(),
      'created_by_username', coalesce(v_username, 'admin'),
      'created_by_user_id', v_user_id,
      'notes', p_notes,
      'table_counts', v_counts
    ),
    'tables', v_tables
  );

  -- حفظ سجل النسخة في جدول system_backups
  insert into public.system_backups (
    id, backup_name, file_name, file_size_bytes, backup_type,
    checksum_sha256, table_counts, notes, created_by, created_at
  ) values (
    v_backup_id, v_backup_name, v_file_name,
    octet_length(v_payload::text),
    coalesce(p_backup_type, 'manual'),
    v_checksum,
    v_counts,
    p_notes,
    v_user_id,
    now()
  );

  -- توثيق العملية في سجل التدقيق الأمني
  insert into public.activity_logs (
    user_id, action, entity_type, entity_id, details
  ) values (
    v_user_id,
    'create_backup',
    'system_backup',
    v_backup_id::text,
    jsonb_build_object(
      'file_name', v_file_name,
      'backup_type', coalesce(p_backup_type, 'manual'),
      'checksum_sha256', v_checksum,
      'total_customers', (select count(*) from public.customers),
      'total_followups', (select count(*) from public.followups)
    )
  );

  return v_payload;
end;
$$;

-- ب. دالة حذف سجل النسخة الاحتياطية
create or replace function public.delete_system_backup_record(
  p_backup_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'غير مصرح: حذف سجلات النسخ الاحتياطية محصور بمدير النظام';
  end if;

  delete from public.system_backups where id = p_backup_id;

  insert into public.activity_logs (
    user_id, action, entity_type, entity_id, details
  ) values (
    v_user_id,
    'delete_backup_record',
    'system_backup',
    p_backup_id::text,
    jsonb_build_object('deleted_at', now())
  );

  return true;
end;
$$;

-- ج. دالة فحص وتدقيق حزمة النسخة الاحتياطية قبل الاستعادة
create or replace function public.validate_system_backup_payload(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manifest jsonb;
  v_tables jsonb;
  v_format_version text;
  v_table_counts jsonb := '{}'::jsonb;
begin
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'غير مصرح: فحص النسخ الاحتياطية محصور بمدير النظام فقط';
  end if;

  if p_payload is null or not (p_payload ? 'manifest') or not (p_payload ? 'tables') then
    raise exception 'ملف النسخة الاحتياطية غير صالح: تنقصه بيانات الميتاداتا أو الجداول الأساسية';
  end if;

  v_manifest := p_payload->'manifest';
  v_tables := p_payload->'tables';
  v_format_version := v_manifest->>'format_version';

  if v_format_version is null or v_format_version not in ('1.0', '2.0') then
    raise exception 'إصدار النسخة الاحتياطية غير متوافق مع هذا النظام (الإصدار الحالي: 2.0)';
  end if;

  -- حساب عدد السجلات في كل جدول بالحزمة
  v_table_counts := jsonb_build_object(
    'settings', jsonb_array_length(coalesce(v_tables->'settings', '[]'::jsonb)),
    'customer_categories', jsonb_array_length(coalesce(v_tables->'customer_categories', '[]'::jsonb)),
    'customers', jsonb_array_length(coalesce(v_tables->'customers', '[]'::jsonb)),
    'balances', jsonb_array_length(coalesce(v_tables->'balances', '[]'::jsonb)),
    'due_dates', jsonb_array_length(coalesce(v_tables->'due_dates', '[]'::jsonb)),
    'followups', jsonb_array_length(coalesce(v_tables->'followups', '[]'::jsonb)),
    'collections', jsonb_array_length(coalesce(v_tables->'collections', '[]'::jsonb)),
    'incentives', jsonb_array_length(coalesce(v_tables->'incentives', '[]'::jsonb)),
    'custom_reminders', jsonb_array_length(coalesce(v_tables->'custom_reminders', '[]'::jsonb))
  );

  return jsonb_build_object(
    'is_valid', true,
    'manifest', v_manifest,
    'table_counts', v_table_counts,
    'current_database_counts', jsonb_build_object(
      'customers', (select count(*) from public.customers),
      'balances', (select count(*) from public.balances),
      'followups', (select count(*) from public.followups),
      'collections', (select count(*) from public.collections),
      'custom_reminders', (select count(*) from public.custom_reminders)
    )
  );
end;
$$;

-- د. دالة الاستعادة الذرية الكاملة والشاملة
create or replace function public.restore_system_backup(
  p_payload jsonb,
  p_create_safety_snapshot boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manifest jsonb;
  v_tables jsonb;
  v_safety_result jsonb;
  v_restored_counts jsonb := '{}'::jsonb;
begin
  -- 1. التحقق الأمني من المدير
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'غير مصرح: استعادة النظام محصورة بمدير النظام فقط';
  end if;

  -- 2. التحقق من صحة الحزمة
  if p_payload is null or not (p_payload ? 'tables') then
    raise exception 'هيكل ملف النسخة الاحتياطية غير صالح';
  end if;

  v_manifest := p_payload->'manifest';
  v_tables := p_payload->'tables';

  -- 3. أخذ نقطة أمان آلية قبل البدء (إذا تم طلبها)
  if coalesce(p_create_safety_snapshot, true) then
    v_safety_result := public.generate_system_backup_json(
      'safety_pre_restore',
      'نقطة أمان تلقائية تم أخذها تلقائياً قبل تنفيذ عملية استعادة النظام'
    );
  end if;

  -- 4. إيقاف الـ Triggers مؤقتاً لتجنب تكرار الحوافز وسجلات التدقيق أثناء الإدخال الشامل
  set local session_replication_role = 'replica';

  -- 5. مسح الجداول بالترتيب العكسي للتبعيات (مع where true لتجاوز قيود safeupdate)
  delete from public.custom_reminders where true;
  delete from public.customer_personal_assignments where true;
  delete from public.collector_tier_settings where true;
  delete from public.notifications where true;
  delete from public.incentive_payments where true;
  delete from public.incentives where true;
  delete from public.collections where true;
  delete from public.followups where true;
  delete from public.due_dates where true;
  delete from public.balance_history where true;
  delete from public.balances where true;
  delete from public.customers where true;
  delete from public.excel_imports where true;
  delete from public.customer_categories where true;
  delete from public.settings where true;

  -- 6. إعادة ملء الجداول بالترتيب الطوبولوجي الصحيح
  -- أ. الإعدادات
  if v_tables ? 'settings' and jsonb_array_length(v_tables->'settings') > 0 then
    insert into public.settings select * from jsonb_populate_recordset(null::public.settings, v_tables->'settings');
  end if;

  -- ب. فئات العملاء
  if v_tables ? 'customer_categories' and jsonb_array_length(v_tables->'customer_categories') > 0 then
    insert into public.customer_categories select * from jsonb_populate_recordset(null::public.customer_categories, v_tables->'customer_categories');
  end if;

  -- ج. سجل الاستيراد
  if v_tables ? 'excel_imports' and jsonb_array_length(v_tables->'excel_imports') > 0 then
    insert into public.excel_imports select * from jsonb_populate_recordset(null::public.excel_imports, v_tables->'excel_imports');
  end if;

  -- د. العملاء
  if v_tables ? 'customers' and jsonb_array_length(v_tables->'customers') > 0 then
    insert into public.customers select * from jsonb_populate_recordset(null::public.customers, v_tables->'customers');
  end if;

  -- هـ. الأرصدة وسجلها والاستحقاق
  if v_tables ? 'balances' and jsonb_array_length(v_tables->'balances') > 0 then
    insert into public.balances select * from jsonb_populate_recordset(null::public.balances, v_tables->'balances');
  end if;
  if v_tables ? 'balance_history' and jsonb_array_length(v_tables->'balance_history') > 0 then
    insert into public.balance_history select * from jsonb_populate_recordset(null::public.balance_history, v_tables->'balance_history');
  end if;
  if v_tables ? 'due_dates' and jsonb_array_length(v_tables->'due_dates') > 0 then
    insert into public.due_dates select * from jsonb_populate_recordset(null::public.due_dates, v_tables->'due_dates');
  end if;

  -- و. المتابعات والدفعات والحوافز
  if v_tables ? 'followups' and jsonb_array_length(v_tables->'followups') > 0 then
    insert into public.followups select * from jsonb_populate_recordset(null::public.followups, v_tables->'followups');
  end if;
  if v_tables ? 'collections' and jsonb_array_length(v_tables->'collections') > 0 then
    insert into public.collections select * from jsonb_populate_recordset(null::public.collections, v_tables->'collections');
  end if;
  if v_tables ? 'incentives' and jsonb_array_length(v_tables->'incentives') > 0 then
    insert into public.incentives select * from jsonb_populate_recordset(null::public.incentives, v_tables->'incentives');
  end if;
  if v_tables ? 'incentive_payments' and jsonb_array_length(v_tables->'incentive_payments') > 0 then
    insert into public.incentive_payments select * from jsonb_populate_recordset(null::public.incentive_payments, v_tables->'incentive_payments');
  end if;

  -- ز. التنبيهات
  if v_tables ? 'notifications' and jsonb_array_length(v_tables->'notifications') > 0 then
    insert into public.notifications select * from jsonb_populate_recordset(null::public.notifications, v_tables->'notifications');
  end if;

  -- ح. بيانات V2: الفئات الشخصية والتذكيرات
  if v_tables ? 'collector_tier_settings' and jsonb_array_length(v_tables->'collector_tier_settings') > 0 then
    insert into public.collector_tier_settings select * from jsonb_populate_recordset(null::public.collector_tier_settings, v_tables->'collector_tier_settings');
  end if;
  if v_tables ? 'customer_personal_assignments' and jsonb_array_length(v_tables->'customer_personal_assignments') > 0 then
    insert into public.customer_personal_assignments select * from jsonb_populate_recordset(null::public.customer_personal_assignments, v_tables->'customer_personal_assignments');
  end if;
  if v_tables ? 'custom_reminders' and jsonb_array_length(v_tables->'custom_reminders') > 0 then
    insert into public.custom_reminders select * from jsonb_populate_recordset(null::public.custom_reminders, v_tables->'custom_reminders');
  end if;

  -- 7. إعادة تفعيل الـ Triggers للوضع الطبيعي
  set local session_replication_role = 'origin';

  -- 8. حساب الإحصائيات بعد الاستعادة
  v_restored_counts := jsonb_build_object(
    'customers', (select count(*) from public.customers),
    'balances', (select count(*) from public.balances),
    'followups', (select count(*) from public.followups),
    'collections', (select count(*) from public.collections),
    'custom_reminders', (select count(*) from public.custom_reminders)
  );

  -- 9. تسجيل العملية في سجل التدقيق الأمني
  insert into public.activity_logs (
    user_id, action, entity_type, entity_id, details
  ) values (
    v_user_id,
    'restore_backup',
    'system_restore',
    coalesce(v_manifest->>'backup_id', gen_random_uuid()::text),
    jsonb_build_object(
      'backup_name', v_manifest->>'backup_name',
      'created_at_in_backup', v_manifest->>'created_at',
      'safety_snapshot_created', coalesce(p_create_safety_snapshot, true),
      'restored_counts', v_restored_counts
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'تمت استعادة كافة بيانات النظام بنجاح تام',
    'restored_counts', v_restored_counts,
    'safety_snapshot_id', v_safety_result->'manifest'->>'backup_id'
  );
end;
$$;
