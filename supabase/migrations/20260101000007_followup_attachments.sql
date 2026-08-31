-- ============================================================================
-- ترقية نظام المتابعات: إرفاق المستندات والملفات (Storage Bucket & Schema)
-- ============================================================================

-- 1) إضافة حقلي المرفق في جدول المتابعات
alter table public.followups
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

-- 2) إنشاء أو تحديث Bucket تخزين مرفقات المتابعة
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'followup-attachments',
  'followup-attachments',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3) سياسات الوصول والحماية (RLS) لكائنات التخزين
-- ملاحظة: المسار المعتمد للملفات هو: <customer_id>/<file_name>
drop policy if exists followup_attachments_select on storage.objects;
create policy followup_attachments_select on storage.objects for select using (
  bucket_id = 'followup-attachments'
  and public.is_active_user()
  and (
    public.is_admin()
    or public.is_accountant()
    or (
      nullif(split_part(name, '/', 1), '') is not null
      and public.can_see_customer(nullif(split_part(name, '/', 1), '')::uuid)
    )
  )
);

drop policy if exists followup_attachments_insert on storage.objects;
create policy followup_attachments_insert on storage.objects for insert with check (
  bucket_id = 'followup-attachments'
  and public.is_active_user()
  and (
    public.is_admin()
    or public.is_accountant()
    or (
      nullif(split_part(name, '/', 1), '') is not null
      and public.can_see_customer(nullif(split_part(name, '/', 1), '')::uuid)
    )
  )
);

drop policy if exists followup_attachments_delete on storage.objects;
create policy followup_attachments_delete on storage.objects for delete using (
  bucket_id = 'followup-attachments'
  and public.is_active_user()
  and (
    public.is_admin()
    or public.is_accountant()
    or (
      nullif(split_part(name, '/', 1), '') is not null
      and public.can_see_customer(nullif(split_part(name, '/', 1), '')::uuid)
    )
  )
);
