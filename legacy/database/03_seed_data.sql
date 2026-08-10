-- ============================================================================
-- بيانات تجريبية اختيارية (Seed) — للاختبار والتطوير فقط، لا تُشغَّل بالإنتاج.
-- شغّل هذا الملف بعد 00_schema.sql و 01_link_auth.sql و 02_rls_policies.sql.
--
-- ⚠️ هذا الملف لا يُنشئ مستخدمين (لا يمكن إدراج صف بـ public.users مباشرة
-- بدون صف مطابق بـ auth.users بسبب fk_users_auth). لإنشاء المستخدمين
-- التجريبيين الأربعة (ayman/accountant/sami/khaled) اتبع الخطوات بأسفل الملف.
-- ============================================================================

-- ---------------------------------------------------------------- فئات العملاء
insert into public.customer_categories (id, category_name, color, incentive_rate, is_active) values
  ('a0000000-0000-0000-0000-00000000000a','فئة أ - عملاء كبار','#2563EB',3,true),
  ('a0000000-0000-0000-0000-00000000000b','فئة ب - عملاء متوسطون','#16A34A',2,true),
  ('a0000000-0000-0000-0000-00000000000c','فئة ج - عملاء صغار','#D97706',1,true);

-- ---------------------------------------------------------------- إعدادات
update public.settings set exchange_rate_usd = 530, exchange_rate_sar = 141, no_followup_days_limit = 14;

-- ============================================================================
-- خطوات إنشاء المستخدمين الأربعة التجريبيين (يُنفَّذ مرة واحدة، وليس عبر SQL
-- مباشرة، لأن Supabase Auth لا تسمح بإدراج مستخدم مباشر بجدول auth.users):
--
--   1) من Supabase Dashboard → Authentication → Users → Add User (أو عبر
--      supabase.auth.admin.createUser من كود خادم)، أنشئ 4 حسابات:
--        ayman@example.com / accountant@example.com /
--        sami@example.com  / khaled@example.com
--      بكلمات مرور قوية فعلية (وليست ayman123 كما بالنموذج الأولي).
--
--   2) الـ trigger on_auth_user_created سينشئ تلقائياً سطراً بـ public.users
--      لكل حساب بدور "مستخدم مخصص" وحالة "موقوف".
--
--   3) نفّذ التحديثات التالية (بدّل UUID الفعلي لكل مستخدم من نتيجة الخطوة 1):
--
-- update public.users set
--   full_name='د. أيمن نجيب', username='ayman', phone='777000001',
--   role_id=(select id from public.roles where name_role='مدير النظام'),
--   status='نشط',
--   allowed_screens=array['dashboard','followups','customers','notifications','import','performance','users']
-- where id = '<ضع هنا UUID الحساب من auth.users>';
--
-- update public.users set
--   full_name='محمد المحاسب', username='accountant', phone='777000002',
--   role_id=(select id from public.roles where name_role='المحاسب'),
--   status='نشط',
--   allowed_screens=array['dashboard','followups','customers','notifications','import','performance']
-- where id = '<...>';
--
-- update public.users set
--   full_name='سامي التحصيل', username='sami', phone='777000003',
--   role_id=(select id from public.roles where name_role='مسؤول التحصيل'),
--   status='نشط',
--   allowed_screens=array['dashboard','followups','customers','notifications','performance'],
--   allowed_category_ids=array['a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000b']::uuid[],
--   screen_permissions='{"customers":{"actions":{"create":false,"edit":true,"deactivate":false},"hidden_fields":["status_customer"]},"followups":{"actions":{"create":true},"hidden_fields":[]}}'::jsonb
-- where id = '<...>';
--
-- update public.users set
--   full_name='خالد التحصيل', username='khaled', phone='777000004',
--   role_id=(select id from public.roles where name_role='مسؤول التحصيل'),
--   status='موقوف',
--   allowed_screens=array['followups','customers','notifications'],
--   allowed_category_ids=array['a0000000-0000-0000-0000-00000000000c']::uuid[],
--   screen_permissions='{"customers":{"actions":{"create":false,"edit":false,"deactivate":false},"hidden_fields":[]},"followups":{"actions":{"create":true},"hidden_fields":["assigned_user"]}}'::jsonb
-- where id = '<...>';
--
-- ============================================================================

-- ---------------------------------------------------------------- عملاء تجريبيون
-- (بدون assigned_user_id لتجنّب الاعتماد على مستخدمين لم يُنشأوا بعد —
--  حدّثها يدوياً من شاشة "العملاء" بعد إنشاء المستخدمين أعلاه)
insert into public.customers (id, customer_number, customer_name, mobile_1, mobile_2, guarantor, status_customer, customer_category_id, description, is_active) values
  ('b0000000-0000-0000-0000-000000000001','1001','محل الأمين للمواد الغذائية','711111111','','أخوه ياسر','يسوق الآن','a0000000-0000-0000-0000-00000000000a','عميل قديم وملتزم غالباً',true),
  ('b0000000-0000-0000-0000-000000000002','1002','صالون النور','733333333','','','','a0000000-0000-0000-0000-00000000000b','',true),
  ('b0000000-0000-0000-0000-000000000003','1003','مكتبة الجيل','788888888','799999999','صاحب المحل المجاور','','a0000000-0000-0000-0000-00000000000c','يحتاج متابعة عن قرب',true),
  ('b0000000-0000-0000-0000-000000000004','1004','مطعم الشرق','712121212','','','','a0000000-0000-0000-0000-00000000000a','',true);

insert into public.balances (customer_id, currency, debit, credit) values
  ('b0000000-0000-0000-0000-000000000001','YER',250000,50000),
  ('b0000000-0000-0000-0000-000000000001','USD',120,0),
  ('b0000000-0000-0000-0000-000000000002','YER',80000,0),
  ('b0000000-0000-0000-0000-000000000003','SAR',600,100),
  ('b0000000-0000-0000-0000-000000000004','YER',400000,400000);

insert into public.due_dates (customer_id, due_date, grace_1, grace_2, grace_3) values
  ('b0000000-0000-0000-0000-000000000001', current_date + 3, 0,0,0),
  ('b0000000-0000-0000-0000-000000000002', current_date, 0,0,0),
  ('b0000000-0000-0000-0000-000000000003', current_date - 10, 2,0,0),
  ('b0000000-0000-0000-0000-000000000004', current_date + 20, 0,0,0);
