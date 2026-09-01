-- ============================================================================
-- ترقية ميزة التقارير التحليلية (V2 - Module 1: Analytics Reports)
-- تشمل:
--   1) تسجيل شاشة 'reports' في جدول app_screens وصلاحيات المستخدمين.
--   2) دالة get_analytics_summary_kpis لحساب المؤشرات المالية والتحصيلية.
--   3) دالة get_analytics_charts_data لحساب بيانات الرسوم البيانية الخمسة وتفاصيل أعلى المديونيات.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) تسجيل شاشة التقارير في app_screens
-- ----------------------------------------------------------------------------
insert into public.app_screens (screen_key, screen_label, sort_order)
values ('reports', 'التقارير التحليلية', 6)
on conflict (screen_key) do update set
  screen_label = excluded.screen_label,
  sort_order = excluded.sort_order;

-- إضافة الشاشة إلى allowed_screens لجميع المستخدمين الذين لا يمتلكونها
update public.users
set allowed_screens = array_append(allowed_screens, 'reports')
where not ('reports' = any(coalesce(allowed_screens, array[]::text[])));

-- ----------------------------------------------------------------------------
-- 2) الدالة التجميعية الأولى: get_analytics_summary_kpis
-- ----------------------------------------------------------------------------
create or replace function public.get_analytics_summary_kpis(
  p_start_date   date default null,
  p_end_date     date default null,
  p_user_id      uuid default null,
  p_category_id  uuid default null,
  p_currency     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid                      uuid;
  v_is_active                boolean;
  v_is_admin                 boolean;
  v_is_accountant            boolean;
  v_target_user_id           uuid;
  v_my_cats                  uuid[];
  v_rate_usd                 numeric(12,4);
  v_rate_sar                 numeric(12,4);
  v_ref_date                 date;
  v_total_debt_yer           numeric(18,2) := 0;
  v_total_collected_period_yer numeric(18,2) := 0;
  v_active_count             integer := 0;
  v_overdue_count            integer := 0;
  v_settled_count            integer := 0;
  v_team_collection_rate     numeric(6,2) := 0;
begin
  v_uid := auth.uid();

  -- التحقق من حالة المستخدم
  select (status = 'نشط') into v_is_active
  from public.users
  where id = v_uid;

  if not v_is_active then
    raise exception 'غير مصرّح: حساب المستخدم غير نشط أو غير مسجّل دخول';
  end if;

  v_is_admin := public.is_admin();
  v_is_accountant := public.is_accountant();
  v_my_cats := public.my_allowed_category_ids();
  v_ref_date := coalesce(p_end_date, current_date);

  -- عزل الصلاحيات: مسؤول التحصيل يرى بياناته فقط ويتم تجاهل p_user_id
  if v_is_admin or v_is_accountant then
    v_target_user_id := p_user_id;
  else
    v_target_user_id := v_uid;
  end if;

  -- قراءة أسعار الصرف
  select coalesce(exchange_rate_usd, 0), coalesce(exchange_rate_sar, 0)
  into v_rate_usd, v_rate_sar
  from public.settings limit 1;

  -- 1) حساب مديونيات العملاء وحالاتهم
  with filtered_customers as (
    select c.id, c.is_active, c.customer_category_id, c.assigned_user_id
    from public.customers c
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
  ),
  customer_debts as (
    select
      fc.id as customer_id,
      fc.is_active,
      case
        when p_currency = 'USD' then
          coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd else 0 end), 0)
        when p_currency = 'SAR' then
          coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar else 0 end), 0)
        when p_currency = 'YER' then
          coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0)
        else
          public.calc_total_due_yer(
            coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
            coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
            coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
            v_rate_usd,
            v_rate_sar
          )
      end as customer_due_yer,
      (dd.due_date + coalesce(dd.grace_period_1,0) + coalesce(dd.grace_period_2,0) + coalesce(dd.grace_period_3,0) - v_ref_date) as remaining_days
    from filtered_customers fc
    left join public.balances b on b.customer_id = fc.id
    left join public.due_dates dd on dd.customer_id = fc.id
    group by fc.id, fc.is_active, dd.due_date, dd.grace_period_1, dd.grace_period_2, dd.grace_period_3
  )
  select
    coalesce(sum(customer_due_yer), 0),
    count(*) filter (where customer_due_yer > 0 and (remaining_days is null or remaining_days >= 0) and is_active = true),
    count(*) filter (where customer_due_yer > 0 and remaining_days < 0 and is_active = true),
    count(*) filter (where customer_due_yer <= 0 or is_active = false)
  into
    v_total_debt_yer,
    v_active_count,
    v_overdue_count,
    v_settled_count
  from customer_debts;

  -- 2) حساب المبالغ المحصلة في الفترة
  select
    coalesce(sum(case
      when p_currency is null or p_currency = 'ALL' or p_currency = '' then col.amount_yer
      when col.currency = p_currency then col.amount_yer
      else 0
    end), 0)
  into v_total_collected_period_yer
  from public.collections col
  join public.customers c on c.id = col.customer_id
  where (v_target_user_id is null or col.user_id = v_target_user_id or c.assigned_user_id = v_target_user_id)
    and (p_category_id is null or c.customer_category_id = p_category_id)
    and (
      array_length(v_my_cats, 1) is null
      or c.customer_category_id = any(v_my_cats)
    )
    and (p_start_date is null or col.collected_date >= p_start_date)
    and (p_end_date is null or col.collected_date <= p_end_date);

  -- 3) حساب نسبة التحصيل العام
  if (v_total_collected_period_yer + v_total_debt_yer) > 0 then
    v_team_collection_rate := round(
      (v_total_collected_period_yer / (v_total_collected_period_yer + v_total_debt_yer) * 100)::numeric,
      2
    );
  else
    v_team_collection_rate := 0;
  end if;

  return jsonb_build_object(
    'total_debt_yer', coalesce(v_total_debt_yer, 0),
    'total_collected_period_yer', coalesce(v_total_collected_period_yer, 0),
    'active_customers_count', coalesce(v_active_count, 0),
    'overdue_customers_count', coalesce(v_overdue_count, 0),
    'settled_customers_count', coalesce(v_settled_count, 0),
    'team_collection_rate', coalesce(v_team_collection_rate, 0)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) الدالة التجميعية الثانية: get_analytics_charts_data
-- ----------------------------------------------------------------------------
create or replace function public.get_analytics_charts_data(
  p_start_date   date default null,
  p_end_date     date default null,
  p_user_id      uuid default null,
  p_category_id  uuid default null,
  p_currency     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid                      uuid;
  v_is_active                boolean;
  v_is_admin                 boolean;
  v_is_accountant            boolean;
  v_target_user_id           uuid;
  v_my_cats                  uuid[];
  v_rate_usd                 numeric(12,4);
  v_rate_sar                 numeric(12,4);
  v_ref_date                 date;
  v_total_debt_all           numeric(18,2) := 0;
  v_debt_by_currency         jsonb;
  v_customers_by_status      jsonb;
  v_collector_performance    jsonb;
  v_monthly_trend            jsonb;
  v_category_debt            jsonb;
  v_top_10_debtors           jsonb;
  v_start_month              date;
  v_end_month                date;
begin
  v_uid := auth.uid();

  select (status = 'نشط') into v_is_active
  from public.users
  where id = v_uid;

  if not v_is_active then
    raise exception 'غير مصرّح: حساب المستخدم غير نشط أو غير مسجّل دخول';
  end if;

  v_is_admin := public.is_admin();
  v_is_accountant := public.is_accountant();
  v_my_cats := public.my_allowed_category_ids();
  v_ref_date := coalesce(p_end_date, current_date);

  -- عزل الصلاحيات: مسؤول التحصيل يرى بياناته فقط ويتم تجاهل p_user_id
  if v_is_admin or v_is_accountant then
    v_target_user_id := p_user_id;
  else
    v_target_user_id := v_uid;
  end if;

  -- قراءة أسعار الصرف
  select coalesce(exchange_rate_usd, 0), coalesce(exchange_rate_sar, 0)
  into v_rate_usd, v_rate_sar
  from public.settings limit 1;

  -- إجمالي المديونية الكلية بالريال لاستخدامها في حساب النسب المئوية
  select coalesce(sum(
    case
      when p_currency = 'USD' then (b.debit - b.credit) * v_rate_usd
      when p_currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
      when p_currency = 'YER' then (b.debit - b.credit)
      else
        case
          when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd
          when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
          else (b.debit - b.credit)
        end
    end
  ), 0)
  into v_total_debt_all
  from public.customers c
  join public.balances b on b.customer_id = c.id
  where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
    and (p_category_id is null or c.customer_category_id = p_category_id)
    and (
      array_length(v_my_cats, 1) is null
      or c.customer_category_id = any(v_my_cats)
    )
    and (p_currency is null or p_currency = 'ALL' or p_currency = '' or b.currency = p_currency);

  -- 1) توزيع المديونيات حسب العملة (YER, USD, SAR)
  with curr_data as (
    select
      b.currency,
      coalesce(sum(b.debit - b.credit), 0) as amount_orig,
      coalesce(sum(
        case
          when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd
          when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
          else (b.debit - b.credit)
        end
      ), 0) as amount_yer
    from public.customers c
    join public.balances b on b.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_currency is null or p_currency = 'ALL' or p_currency = '' or b.currency = p_currency)
    group by b.currency
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'currency', c_name.curr,
      'currency_name', c_name.label,
      'amount_original', coalesce(cd.amount_orig, 0),
      'amount_yer', coalesce(cd.amount_yer, 0),
      'percentage', case
        when v_total_debt_all > 0 then round((coalesce(cd.amount_yer, 0) / v_total_debt_all * 100)::numeric, 2)
        else 0
      end
    ) order by case c_name.curr when 'YER' then 1 when 'USD' then 2 when 'SAR' then 3 else 4 end
  ), '[]'::jsonb)
  into v_debt_by_currency
  from (
    values
      ('YER'::text, 'ريال يمني'::text),
      ('USD'::text, 'دولار أمريكي'::text),
      ('SAR'::text, 'ريال سعودي'::text)
  ) as c_name(curr, label)
  left join curr_data cd on cd.currency = c_name.curr;

  -- 2) توزيع العملاء حسب الحالة (نشط، متعثر، مسدد)
  with cust_calc as (
    select
      c.id,
      c.is_active,
      coalesce(public.calc_total_due_yer(
        coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
        v_rate_usd,
        v_rate_sar
      ), 0) as total_due_yer,
      (dd.due_date + coalesce(dd.grace_period_1,0) + coalesce(dd.grace_period_2,0) + coalesce(dd.grace_period_3,0) - v_ref_date) as remaining_days
    from public.customers c
    left join public.balances b on b.customer_id = c.id
    left join public.due_dates dd on dd.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
    group by c.id, c.is_active, dd.due_date, dd.grace_period_1, dd.grace_period_2, dd.grace_period_3
  ),
  status_counts as (
    select
      count(*) as total_custs,
      count(*) filter (where total_due_yer > 0 and (remaining_days is null or remaining_days >= 0) and is_active = true) as active_cnt,
      count(*) filter (where total_due_yer > 0 and remaining_days < 0 and is_active = true) as overdue_cnt,
      count(*) filter (where total_due_yer <= 0 or is_active = false) as settled_cnt
    from cust_calc
  )
  select jsonb_build_array(
    jsonb_build_object(
      'status', 'active',
      'status_label', 'عملاء نشطون',
      'count', sc.active_cnt,
      'percentage', case when sc.total_custs > 0 then round((sc.active_cnt::numeric / sc.total_custs * 100)::numeric, 2) else 0 end
    ),
    jsonb_build_object(
      'status', 'overdue',
      'status_label', 'عملاء متعثرون',
      'count', sc.overdue_cnt,
      'percentage', case when sc.total_custs > 0 then round((sc.overdue_cnt::numeric / sc.total_custs * 100)::numeric, 2) else 0 end
    ),
    jsonb_build_object(
      'status', 'settled',
      'status_label', 'عملاء مسددون',
      'count', sc.settled_cnt,
      'percentage', case when sc.total_custs > 0 then round((sc.settled_cnt::numeric / sc.total_custs * 100)::numeric, 2) else 0 end
    )
  )
  into v_customers_by_status
  from status_counts sc;

  -- 3) أداء مسؤولي التحصيل
  with collector_list as (
    select distinct u.id as user_id, u.full_name as collector_name
    from public.users u
    where (v_target_user_id is null or u.id = v_target_user_id)
      and (
        exists (select 1 from public.customers c where c.assigned_user_id = u.id)
        or exists (select 1 from public.collections col where col.user_id = u.id)
        or exists (select 1 from public.roles r where r.id = u.role_id and r.name_role in ('مسؤول التحصيل', 'مستخدم مخصص'))
      )
  ),
  collector_debts as (
    select
      c.assigned_user_id as user_id,
      count(distinct c.id) as customer_count,
      coalesce(sum(
        case
          when p_currency = 'USD' then (b.debit - b.credit) * v_rate_usd
          when p_currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
          when p_currency = 'YER' then (b.debit - b.credit)
          else
            case
              when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd
              when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
              else (b.debit - b.credit)
            end
        end
      ), 0) as total_due_yer
    from public.customers c
    left join public.balances b on b.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_currency is null or p_currency = 'ALL' or p_currency = '' or b.currency = p_currency)
    group by c.assigned_user_id
  ),
  collector_collections as (
    select
      coalesce(col.user_id, c.assigned_user_id) as user_id,
      coalesce(sum(case
        when p_currency is null or p_currency = 'ALL' or p_currency = '' then col.amount_yer
        when col.currency = p_currency then col.amount_yer
        else 0
      end), 0) as total_collected_yer
    from public.collections col
    join public.customers c on c.id = col.customer_id
    where (v_target_user_id is null or col.user_id = v_target_user_id or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_start_date is null or col.collected_date >= p_start_date)
      and (p_end_date is null or col.collected_date <= p_end_date)
    group by coalesce(col.user_id, c.assigned_user_id)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', cl.user_id,
      'collector_name', cl.collector_name,
      'total_due_yer', coalesce(cd.total_due_yer, 0),
      'total_collected_yer', coalesce(cc.total_collected_yer, 0),
      'customer_count', coalesce(cd.customer_count, 0),
      'collection_rate', case
        when (coalesce(cc.total_collected_yer, 0) + coalesce(cd.total_due_yer, 0)) > 0 then
          round((coalesce(cc.total_collected_yer, 0) / (coalesce(cc.total_collected_yer, 0) + coalesce(cd.total_due_yer, 0)) * 100)::numeric, 2)
        else 0
      end
    ) order by coalesce(cc.total_collected_yer, 0) desc, coalesce(cd.total_due_yer, 0) desc
  ), '[]'::jsonb)
  into v_collector_performance
  from collector_list cl
  left join collector_debts cd on cd.user_id = cl.user_id
  left join collector_collections cc on cc.user_id = cl.user_id;

  -- 4) تطور التحصيل الشهري (آخر 6 أشهر)
  v_end_month := date_trunc('month', coalesce(p_end_date, current_date))::date;
  v_start_month := (v_end_month - interval '5 months')::date;

  with months as (
    select generate_series(v_start_month, v_end_month, '1 month'::interval)::date as m_start
  ),
  monthly_data as (
    select
      to_char(m.m_start, 'YYYY-MM') as month_str,
      case extract(month from m.m_start)
        when 1 then 'يناير'
        when 2 then 'فبراير'
        when 3 then 'مارس'
        when 4 then 'أبريل'
        when 5 then 'مايو'
        when 6 then 'يونيو'
        when 7 then 'يوليو'
        when 8 then 'أغسطس'
        when 9 then 'سبتمبر'
        when 10 then 'أكتوبر'
        when 11 then 'نوفمبر'
        when 12 then 'ديسمبر'
      end || ' ' || to_char(m.m_start, 'YYYY') as month_lbl,
      coalesce(sum(
        case
          when p_currency is null or p_currency = 'ALL' or p_currency = '' then col.amount_yer
          when col.currency = p_currency then col.amount_yer
          else 0
        end
      ), 0) as m_collected_yer
    from months m
    left join public.collections col on
      col.collected_date >= m.m_start
      and col.collected_date < (m.m_start + interval '1 month')::date
      and (v_target_user_id is null or col.user_id = v_target_user_id)
    group by m.m_start
    order by m.m_start
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', md.month_str,
      'month_label', md.month_lbl,
      'collected_yer', md.m_collected_yer,
      'target_or_due_yer', v_total_debt_all,
      'collection_rate', case
        when (md.m_collected_yer + v_total_debt_all) > 0 then
          round((md.m_collected_yer / (md.m_collected_yer + v_total_debt_all) * 100)::numeric, 2)
        else 0
      end
    )
  ), '[]'::jsonb)
  into v_monthly_trend
  from monthly_data md;

  -- 5) توزيع المديونيات حسب فئة العميل
  with cat_debts as (
    select
      c.customer_category_id as cat_id,
      coalesce(cat.category_name, 'بدون فئة') as cat_name,
      coalesce(cat.color, '#64748B') as cat_color,
      count(distinct c.id) as cust_cnt,
      coalesce(sum(
        case
          when p_currency = 'USD' then (b.debit - b.credit) * v_rate_usd
          when p_currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
          when p_currency = 'YER' then (b.debit - b.credit)
          else
            case
              when b.currency = 'USD' then (b.debit - b.credit) * v_rate_usd
              when b.currency = 'SAR' then (b.debit - b.credit) * v_rate_sar
              else (b.debit - b.credit)
            end
        end
      ), 0) as cat_debt_yer
    from public.customers c
    left join public.customer_categories cat on cat.id = c.customer_category_id
    left join public.balances b on b.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_currency is null or p_currency = 'ALL' or p_currency = '' or b.currency = p_currency)
    group by c.customer_category_id, cat.category_name, cat.color
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category_id', cd.cat_id,
      'category_name', cd.cat_name,
      'category_color', cd.cat_color,
      'total_debt_yer', cd.cat_debt_yer,
      'customer_count', cd.cust_cnt,
      'percentage', case
        when v_total_debt_all > 0 then round((cd.cat_debt_yer / v_total_debt_all * 100)::numeric, 2)
        else 0
      end
    ) order by cd.cat_debt_yer desc
  ), '[]'::jsonb)
  into v_category_debt
  from cat_debts cd;

  -- 6) أعلى 10 عملاء مديونية (التركيز الائتماني)
  with top_debtors_calc as (
    select
      c.id as cust_id,
      c.customer_number as cust_num,
      c.customer_name as cust_name,
      c.is_active,
      cat.category_name as cat_name,
      cat.color as cat_color,
      u.full_name as assigned_name,
      (dd.due_date + coalesce(dd.grace_period_1,0) + coalesce(dd.grace_period_2,0) + coalesce(dd.grace_period_3,0) - v_ref_date) as rem_days,
      coalesce(public.calc_total_due_yer(
        coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
        v_rate_usd,
        v_rate_sar
      ), 0) as due_yer
    from public.customers c
    left join public.customer_categories cat on cat.id = c.customer_category_id
    left join public.users u on u.id = c.assigned_user_id
    left join public.balances b on b.customer_id = c.id
    left join public.due_dates dd on dd.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
    group by c.id, c.customer_number, c.customer_name, c.is_active, cat.category_name, cat.color, u.full_name, dd.due_date, dd.grace_period_1, dd.grace_period_2, dd.grace_period_3
    having coalesce(public.calc_total_due_yer(
      coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
      coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
      coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
      v_rate_usd,
      v_rate_sar
    ), 0) > 0
    order by due_yer desc
    limit 10
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'customer_id', t.cust_id,
      'customer_number', t.cust_num,
      'customer_name', t.cust_name,
      'category_name', t.cat_name,
      'category_color', t.cat_color,
      'assigned_user_name', t.assigned_name,
      'total_due_yer', t.due_yer,
      'debt_percentage', case
        when v_total_debt_all > 0 then round((t.due_yer / v_total_debt_all * 100)::numeric, 2)
        else 0
      end,
      'status', case
        when t.due_yer <= 0 or t.is_active = false then 'settled'
        when t.rem_days < 0 then 'overdue'
        else 'active'
      end
    )
  ), '[]'::jsonb)
  into v_top_10_debtors
  from top_debtors_calc t;

  return jsonb_build_object(
    'debt_by_currency', coalesce(v_debt_by_currency, '[]'::jsonb),
    'customers_by_status', coalesce(v_customers_by_status, '[]'::jsonb),
    'collector_performance', coalesce(v_collector_performance, '[]'::jsonb),
    'monthly_collection_trend', coalesce(v_monthly_trend, '[]'::jsonb),
    'category_debt', coalesce(v_category_debt, '[]'::jsonb),
    'top_10_debtors', coalesce(v_top_10_debtors, '[]'::jsonb)
  );
end;
$$;
