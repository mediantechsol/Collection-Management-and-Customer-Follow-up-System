-- ============================================================================
-- سياسات الحماية على مستوى الصف (Row Level Security)
-- شغّل هذا الملف بعد 01_link_auth.sql مباشرة.
--
-- هذا الملف ينقل نفس منطق الصلاحيات الموجود بدوال JS بالواجهة
-- (visibleCustomers / canSeeCustomer / hasScreenAccess / screenAction)
-- إلى قاعدة البيانات نفسها. هذا أمر ضروري: صلاحيات تُفرض فقط بالواجهة
-- يمكن لأي مستخدم متمرس تجاوزها بسهولة (أدوات المطوّر بالمتصفح). RLS
-- يفرض القيد داخل قاعدة البيانات، فلا يوجد طريق آمن لتجاوزه.
--
-- ملاحظة على "الحقول المخفية" (hidden_fields / screen_permissions):
-- RLS تعمل على مستوى "الصف" لا "العمود"، فلا يمكنها إخفاء عمود واحد فقط
-- ضمن صف مسموح بالوصول له. إخفاء الأعمدة (مثل إخفاء status_customer عن
-- مستخدم معيّن) يبقى مسؤولية طبقة الـ API/الواجهة، تماماً كما هو مبرمج
-- حالياً بدالة visibleFields(). فصّلنا هذا في PROMPT.md.
-- ============================================================================

alter table public.roles enable row level security;
alter table public.app_screens enable row level security;
alter table public.users enable row level security;
alter table public.customer_categories enable row level security;
alter table public.customers enable row level security;
alter table public.balances enable row level security;
alter table public.due_dates enable row level security;
alter table public.followups enable row level security;
alter table public.notifications enable row level security;
alter table public.incentives enable row level security;
alter table public.incentive_payments enable row level security;
alter table public.excel_imports enable row level security;
alter table public.activity_logs enable row level security;
alter table public.settings enable row level security;

-- ---------------------------------------------------------------- roles / app_screens
-- جداول مرجعية بحتة، أي مستخدم مسجّل دخول يقرأها، لا كتابة إلا للمدير
create policy roles_select on public.roles for select using (auth.uid() is not null);
create policy roles_write on public.roles for all using (public.is_admin()) with check (public.is_admin());

create policy screens_select on public.app_screens for select using (auth.uid() is not null);

-- ---------------------------------------------------------------- users
-- كل مستخدم يرى سطره الخاص + المدير يرى الجميع. التعديل: المدير فقط
-- (نفس قيد "canManageUsers" بالواجهة: إدارة المستخدمين محصورة بالدور الأساسي).
create policy users_select on public.users for select using (
  public.is_admin() or id = auth.uid()
);
create policy users_insert on public.users for insert with check (public.is_admin());
create policy users_update on public.users for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- customer_categories
create policy categories_select on public.customer_categories for select using (auth.uid() is not null);
create policy categories_write on public.customer_categories for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- customers
-- يطابق visibleCustomers(): مدير/محاسب = كل العملاء ثم قيد الفئة إن وُجد.
-- مسؤول تحصيل = عملاؤه المعيّن عليهم فقط + ضمن فئاته المسموحة (الشرطان معاً).
create policy customers_select on public.customers for select using (
  public.is_active_user() and (
    public.is_admin() or public.is_accountant()
    or assigned_user_id = auth.uid()
  )
  and (
    array_length(public.my_allowed_category_ids(),1) is null
    or customer_category_id = any(public.my_allowed_category_ids())
  )
);
create policy customers_insert on public.customers for insert with check (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
);
create policy customers_update on public.customers for update using (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
) with check (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
);

-- ---------------------------------------------------------------- balances / due_dates
-- تتبع نفس رؤية العميل المرتبطة بها (لا داعي لتكرار منطق الفئة/التعيين)
create policy balances_select on public.balances for select using (
  exists (select 1 from public.customers c where c.id = balances.customer_id)
);
create policy balances_write on public.balances for all using (
  public.is_admin() or public.is_accountant()
) with check (
  public.is_admin() or public.is_accountant()
);

create policy due_dates_select on public.due_dates for select using (
  exists (select 1 from public.customers c where c.id = due_dates.customer_id)
);
create policy due_dates_write on public.due_dates for all using (
  public.is_admin() or public.is_accountant()
) with check (
  public.is_admin() or public.is_accountant()
);

-- ---------------------------------------------------------------- followups
-- أي مستخدم يرى متابعات عملائه المسموح له برؤيتهم فقط، ويضيف متابعة لهم
create policy followups_select on public.followups for select using (
  exists (select 1 from public.customers c where c.id = followups.customer_id)
);
create policy followups_insert on public.followups for insert with check (
  exists (select 1 from public.customers c where c.id = followups.customer_id)
  and user_id = auth.uid()
);

-- ---------------------------------------------------------------- notifications
create policy notifications_select on public.notifications for select using (
  public.is_admin() or public.is_accountant() or user_id = auth.uid()
);
create policy notifications_write on public.notifications for all using (
  public.is_admin() or public.is_accountant()
) with check (
  public.is_admin() or public.is_accountant()
);
-- تعليم "تم التعامل" مسموح لصاحب التنبيه نفسه أيضاً
create policy notifications_ack on public.notifications for update using (
  user_id = auth.uid()
) with check (
  user_id = auth.uid()
);

-- ---------------------------------------------------------------- incentives / payments
create policy incentives_select on public.incentives for select using (
  public.is_admin() or public.is_accountant() or user_id = auth.uid()
);
create policy incentives_write on public.incentives for all using (
  public.is_admin() or public.is_accountant()
) with check (
  public.is_admin() or public.is_accountant()
);

create policy incentive_payments_select on public.incentive_payments for select using (
  public.is_admin() or public.is_accountant() or user_id = auth.uid()
);
create policy incentive_payments_write on public.incentive_payments for all using (
  public.is_admin() or public.is_accountant()
) with check (
  public.is_admin() or public.is_accountant()
);

-- ---------------------------------------------------------------- excel_imports
-- مطابق لـ canImport(): المدير والمحاسب فقط
create policy excel_imports_select on public.excel_imports for select using (
  public.is_admin() or public.is_accountant()
);
create policy excel_imports_write on public.excel_imports for insert with check (
  public.is_admin() or public.is_accountant()
);

-- ---------------------------------------------------------------- activity_logs
-- سجل التدقيق: كتابة من أي مستخدم مسجّل دخول (لتسجيل أفعاله هو فقط)، قراءة للمدير/المحاسب
create policy activity_select on public.activity_logs for select using (
  public.is_admin() or public.is_accountant()
);
create policy activity_insert on public.activity_logs for insert with check (
  user_id = auth.uid()
);

-- ---------------------------------------------------------------- settings
create policy settings_select on public.settings for select using (auth.uid() is not null);
create policy settings_write on public.settings for update using (public.is_admin()) with check (public.is_admin());
