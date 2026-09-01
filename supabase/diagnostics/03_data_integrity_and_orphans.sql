-- ============================================================================
-- 3. فحص سلامة البيانات واكتشاف السجلات اليتيمة والشاذة
-- ============================================================================

-- أ. التحقق من عدم وجود تكرار في أرصدة العملاء لنفس العملة
select 
  customer_id, 
  currency, 
  count(*) as duplicate_count
from public.balances
group by customer_id, currency
having count(*) > 1;


-- ب. التحقق من العملاء الذين لا تحتوي أسماؤهم على نصوص صالحة
select 
  id, 
  customer_name, 
  customer_number,
  created_at
from public.customers
where customer_name is null or trim(customer_name) = '';


-- ج. التحقق من وجود عملاء بدون فئات أو بدون مسؤول تحصيل معين
select 
  count(*) filter (where category_id is null) as customers_without_category,
  count(*) filter (where assigned_collector_id is null) as customers_without_collector
from public.customers;


-- د. التحقق من سجلات المتابعة بدون عميل أو بدون محصل
select 
  count(*) filter (where customer_id is null) as followups_without_customer,
  count(*) filter (where user_id is null) as followups_without_user
from public.followups;


-- هـ. التحقق من الدفعات بدون عملة أو بمبالغ سالبة أو صفرية
select 
  count(*) as invalid_collections_count
from public.collections
where amount <= 0 or currency not in ('YER', 'USD', 'SAR');
