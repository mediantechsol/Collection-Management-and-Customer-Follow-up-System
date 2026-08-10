-- ============================================================================
-- ترقية أول مدير نظام — يُشغَّل مرة واحدة فقط عند تجهيز النظام
--
-- لماذا يدوياً؟ إنشاء المستخدمين في التطبيق يتطلب مدير نظام، ولا يوجد مدير بعد.
-- هذه هي الحلقة الوحيدة التي تُكسر يدوياً؛ كل مستخدم بعدها يُنشأ من التطبيق.
--
-- ── قبل تشغيل هذا الملف ────────────────────────────────────────────────────
-- أنشئ حساب المصادقة من لوحة التحكم:
--     Authentication → Users → Add user
--     Email:    ayman@dr-ayman.local      ← النطاق يجب أن يطابق الإعدادات
--     Password: كلمة مرور قوية (8 خانات فأكثر)
--     ✅ فعّل خيار Auto Confirm User
--
-- الموظفون لا يملكون بريداً حقيقياً؛ الإيميل هنا معرّف داخلي فقط، والموظف
-- يكتب اسم المستخدم وحده عند الدخول والتطبيق يضيف النطاق تلقائياً.
--
-- الـ trigger أنشأ تلقائياً ملفاً شخصياً بدور "مستخدم مخصص" وحالة "موقوف"
-- وبلا أي شاشة — أأمن حالة ابتدائية ممكنة. هذا الملف يرقّيه إلى مدير نظام.
--
-- ── التشغيل ────────────────────────────────────────────────────────────────
-- عدّل القيم الثلاث في القسم التالي فقط، ثم شغّل الملف كاملاً في SQL Editor.
-- ============================================================================

do $$
declare
  -- ⬇⬇⬇ عدّل هذه القيم الثلاث فقط ⬇⬇⬇
  v_email     text := 'ayman@dr-ayman.local';
  v_full_name text := 'د. أيمن نجيب';
  v_phone     text := '777000001';
  -- ⬆⬆⬆ ------------------------- ⬆⬆⬆

  v_user_id   uuid;
  v_domain    text;
  v_username  text;
  v_confirmed timestamptz;
begin
  ---------------------------------------------------------------- فحوص أولية
  select id, email_confirmed_at into v_user_id, v_confirmed
  from auth.users where email = lower(v_email);

  if v_user_id is null then
    raise exception E'لا يوجد حساب مصادقة بالبريد %.\nأنشئه أولاً من Authentication → Users → Add user مع تفعيل Auto Confirm User.', v_email;
  end if;

  if v_confirmed is null then
    raise exception E'الحساب % غير مؤكَّد، ولن يستطيع تسجيل الدخول.\nاحذفه وأعد إنشاءه مع تفعيل خيار Auto Confirm User.', v_email;
  end if;

  -- النطاق يجب أن يطابق ما تستخدمه الواجهة، وإلا فشل الدخول: الحساب يُنشأ
  -- بنطاق والتطبيق يبحث بنطاق آخر.
  select internal_email_domain into v_domain from public.settings limit 1;
  v_username := split_part(lower(v_email), '@', 1);

  if split_part(lower(v_email), '@', 2) is distinct from v_domain then
    raise exception E'نطاق البريد (%) لا يطابق النطاق المضبوط في الإعدادات (%).\nإما تنشئ الحساب بالنطاق الصحيح، أو تحدّث الإعدادات وملف app/.env.local ليتطابق الثلاثة.',
      split_part(lower(v_email), '@', 2), v_domain;
  end if;

  ---------------------------------------------------------------- الترقية
  update public.users set
    full_name            = v_full_name,
    username             = v_username,
    phone                = v_phone,
    role_id              = (select id from public.roles where name_role = 'مدير النظام'),
    status               = 'نشط',
    allowed_screens      = array['dashboard','followups','customers','notifications',
                                 'collections','import','performance','users'],
    allowed_category_ids = '{}'::uuid[],   -- فارغة = كل الفئات
    screen_permissions   = '{}'::jsonb     -- لا تخصيص = صلاحيات الدور الكاملة
  where id = v_user_id;

  if not found then
    raise exception E'حساب المصادقة موجود لكن لا يوجد له ملف في public.users.\nهذا يعني أن الـ trigger لم يعمل — تأكد أن ملف الترحيل 20260101000001_auth.sql نُفِّذ بنجاح.';
  end if;

  raise notice '✔ تمت ترقية % إلى مدير نظام. اسم الدخول: %', v_full_name, v_username;
end $$;

-- ============================================================================
-- التحقق — يجب أن يظهر سطر واحد بدور "مدير النظام" وحالة "نشط" و8 شاشات
-- ============================================================================
select
  u.username        as "اسم الدخول",
  u.full_name       as "الاسم",
  r.name_role       as "الدور",
  u.status          as "الحالة",
  array_length(u.allowed_screens, 1) as "عدد الشاشات",
  a.email           as "البريد الداخلي",
  (a.email_confirmed_at is not null) as "مؤكَّد"
from public.users u
join public.roles r on r.id = u.role_id
join auth.users a on a.id = u.id
order by r.name_role, u.username;
