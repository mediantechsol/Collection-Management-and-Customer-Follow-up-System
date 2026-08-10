-- ============================================================================
-- سياسات الحماية على مستوى الصف (Row Level Security)
--
-- مبني على legacy/database/02_rls_policies.sql مع إصلاحات:
--   • is_active_user() مطبّقة على كل الجداول لا على customers فقط
--     (كان المستخدم الموقوف يقرأ المتابعات والتنبيهات والحوافز).
--   • can_see_customer() بدل الاستعلامات الفرعية المتكررة.
--   • activity_logs: مُنع الإدراج من الواجهة نهائياً (كان قابلاً للتزوير) —
--     يُكتب حصراً عبر triggers داخل قاعدة البيانات.
--   • notifications: لا إدراج مباشر إطلاقاً — عبر RPC فقط (توليد يومي/رفع حالة)،
--     وهذا يصلح فشل زر "رفع الحالة للمدير" الذي كانت السياسة القديمة ترفضه.
--
-- ملاحظة على hidden_fields: RLS تعمل على الصف لا العمود، فإخفاء الأعمدة يبقى
-- مسؤولية الواجهة (تجميلي وليس أمنياً). أي حقل حسّاس فعلاً يجب استبعاده من
-- الاستعلام نفسه أو عزله في جدول منفصل.
-- ============================================================================

alter table public.roles                enable row level security;
alter table public.app_screens          enable row level security;
alter table public.users                enable row level security;
alter table public.customer_categories  enable row level security;
alter table public.customers            enable row level security;
alter table public.balances             enable row level security;
alter table public.balance_history      enable row level security;
alter table public.due_dates            enable row level security;
alter table public.followups            enable row level security;
alter table public.notifications        enable row level security;
alter table public.collections          enable row level security;
alter table public.incentives           enable row level security;
alter table public.incentive_payments   enable row level security;
alter table public.excel_imports        enable row level security;
alter table public.activity_logs        enable row level security;
alter table public.settings             enable row level security;

-- ---------------------------------------------------------------- مرجعية
create policy roles_select on public.roles for select
  using (auth.uid() is not null);
create policy roles_write on public.roles for all
  using (public.is_admin()) with check (public.is_admin());

create policy screens_select on public.app_screens for select
  using (auth.uid() is not null);

create policy categories_select on public.customer_categories for select
  using (public.is_active_user());
create policy categories_write on public.customer_categories for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- users
-- كل مستخدم يقرأ سطره، والمدير يقرأ الجميع. الأسماء فقط تُقرأ للجميع عبر
-- العرض user_directory. التعديل للمدير حصراً.
create policy users_select on public.users for select
  using (public.is_admin() or id = auth.uid());
create policy users_insert on public.users for insert
  with check (public.is_admin());
create policy users_update on public.users for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- customers
create policy customers_select on public.customers for select using (
  public.is_active_user()
  and (public.is_admin() or public.is_accountant() or assigned_user_id = auth.uid())
  and (
    array_length(public.my_allowed_category_ids(), 1) is null
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

-- ---------------------------------------------------------------- balances / history / due_dates
create policy balances_select on public.balances for select
  using (public.can_see_customer(customer_id));
create policy balances_write on public.balances for all
  using (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  with check (public.is_active_user() and (public.is_admin() or public.is_accountant()));

create policy balance_history_select on public.balance_history for select
  using (public.can_see_customer(customer_id));

create policy due_dates_select on public.due_dates for select
  using (public.can_see_customer(customer_id));
create policy due_dates_write on public.due_dates for all
  using (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  with check (public.is_active_user() and (public.is_admin() or public.is_accountant()));

-- ---------------------------------------------------------------- followups
-- سجل غير قابل للتعديل أو الحذف عمداً (لا سياسة update/delete).
create policy followups_select on public.followups for select
  using (public.can_see_customer(customer_id));
create policy followups_insert on public.followups for insert with check (
  public.can_see_customer(customer_id) and user_id = auth.uid()
);

-- ---------------------------------------------------------------- notifications
-- لا سياسة insert: التوليد اليومي ورفع الحالة يمران عبر RPC بـ security definer.
create policy notifications_select on public.notifications for select using (
  public.is_active_user() and (
    public.is_admin() or public.is_accountant()
    or user_id = auth.uid()
    or public.can_see_customer(customer_id)
  )
);
-- تعليم "تم التعامل": صاحب التنبيه أو الإدارة
create policy notifications_update on public.notifications for update using (
  public.is_active_user() and (public.is_admin() or public.is_accountant() or user_id = auth.uid())
) with check (
  public.is_active_user() and (public.is_admin() or public.is_accountant() or user_id = auth.uid())
);

-- ---------------------------------------------------------------- collections
-- المحصِّل يرى دفعاته وعملاءه، والإدارة ترى الكل وتُدخل وتعتمد.
create policy collections_select on public.collections for select using (
  public.is_active_user() and (
    public.is_admin() or public.is_accountant()
    or user_id = auth.uid()
    or public.can_see_customer(customer_id)
  )
);
create policy collections_write on public.collections for all
  using (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  with check (public.is_active_user() and (public.is_admin() or public.is_accountant()));

-- ---------------------------------------------------------------- incentives
create policy incentives_select on public.incentives for select using (
  public.is_active_user() and (public.is_admin() or public.is_accountant() or user_id = auth.uid())
);
-- لا كتابة مباشرة: تُولَّد آلياً من trigger اعتماد الدفعة.

create policy incentive_payments_select on public.incentive_payments for select using (
  public.is_active_user() and (public.is_admin() or public.is_accountant() or user_id = auth.uid())
);
create policy incentive_payments_write on public.incentive_payments for all
  using (public.is_active_user() and (public.is_admin() or public.is_accountant()))
  with check (public.is_active_user() and (public.is_admin() or public.is_accountant()));

-- ---------------------------------------------------------------- excel_imports
create policy excel_imports_select on public.excel_imports for select using (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
);

-- ---------------------------------------------------------------- activity_logs
-- قراءة للإدارة فقط، ولا إدراج من أي عميل — الكتابة عبر triggers حصراً.
create policy activity_select on public.activity_logs for select using (
  public.is_active_user() and (public.is_admin() or public.is_accountant())
);

-- ---------------------------------------------------------------- settings
create policy settings_select on public.settings for select
  using (auth.uid() is not null);
create policy settings_update on public.settings for update
  using (public.is_admin()) with check (public.is_admin());
