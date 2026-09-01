-- ============================================================================
-- ميزة التقارير التحليلية (V2 - Module 1: Analytics Reports)
-- دوال التجميع السريع (RPC) + عزل الصلاحيات والأمان المالي + تسجيل الشاشة
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) تسجيل شاشة "التقارير التحليلية" في جدول الشاشات المرجعي
-- ----------------------------------------------------------------------------
insert into public.app_screens (key, label, sort_order)
values ('reports', 'التقارير التحليلية', 6)
on conflict (key) do update
set label = excluded.label, sort_order = excluded.sort_order;

-- منح الشاشة افتراضياً لجميع المستخدمين الحاليين لتظهر في القائمة
update public.users
set allowed_screens = array_append(allowed_screens, 'reports')
where not ('reports' = any(allowed_screens));

-- ----------------------------------------------------------------------------
-- 2) دالة تجميع المؤشرات الرئيسية (Summary KPIs)
-- ----------------------------------------------------------------------------
create or replace function public.get_analytics_summary_kpis(
  p_start_date date default null,
  p_end_date date default null,
  p_user_id uuid default null,
  p_category_id uuid default null,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_active boolean;
  v_is_admin boolean;
  v_is_accountant boolean;
  v_target_user_id uuid;
  v_my_cats uuid[];
  v_rate_usd numeric;
  v_rate_sar numeric;

  v_total_debt_yer numeric := 0;
  v_total_collected_period_yer numeric := 0;
  v_active_count integer := 0;
  v_overdue_count integer := 0;
  v_settled_count integer := 0;
  v_team_collection_rate numeric := 0;
begin
  -- التحقق من حالة المستخدم
  v_is_active := public.is_active_user();
  if not v_is_active then
    raise exception 'غير مصرّح: حساب المستخدم غير نشط أو غير مسجّل دخول';
  end if;

  v_is_admin := public.is_admin();
  v_is_accountant := public.is_accountant();
  v_my_cats := public.my_allowed_category_ids();

  -- عزل الصلاحيات: مسؤول التحصيل يرى بياناته فقط ويتم تجاهل p_user_id
  if v_is_admin or v_is_accountant then
    v_target_user_id := p_user_id;
  else
    v_target_user_id := auth.uid();
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
      due.remaining_days
    from filtered_customers fc
    left join public.balances b on b.customer_id = fc.id
    left join public.customer_due_view due on due.customer_id = fc.id
    group by fc.id, fc.is_active, due.remaining_days
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
  where (v_target_user_id is null or col.user_id = v_target_user_id)
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

grant execute on function public.get_analytics_summary_kpis to authenticated;

-- ----------------------------------------------------------------------------
-- 3) دالة بيانات الرسوم البيانية التفاعلية (Charts & Analytical Breakdown)
-- ----------------------------------------------------------------------------
create or replace function public.get_analytics_charts_data(
  p_start_date date default null,
  p_end_date date default null,
  p_user_id uuid default null,
  p_category_id uuid default null,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_active boolean;
  v_is_admin boolean;
  v_is_accountant boolean;
  v_target_user_id uuid;
  v_my_cats uuid[];
  v_rate_usd numeric;
  v_rate_sar numeric;

  v_debt_by_currency jsonb;
  v_customers_by_status jsonb;
  v_collector_performance jsonb;
  v_monthly_collection_trend jsonb;
  v_category_debt jsonb;
  v_top_10_debtors jsonb;

  v_total_debt_all numeric := 0;
  v_start_month date;
  v_end_month date;
begin
  -- التحقق من حالة المستخدم
  v_is_active := public.is_active_user();
  if not v_is_active then
    raise exception 'غير مصرّح: حساب المستخدم غير نشط أو غير مسجّل دخول';
  end if;

  v_is_admin := public.is_admin();
  v_is_accountant := public.is_accountant();
  v_my_cats := public.my_allowed_category_ids();

  -- عزل الصلاحيات: مسؤول التحصيل يرى بياناته فقط ويتم تجاهل p_user_id
  if v_is_admin or v_is_accountant then
    v_target_user_id := p_user_id;
  else
    v_target_user_id := auth.uid();
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
      due.remaining_days
    from public.customers c
    left join public.balances b on b.customer_id = c.id
    left join public.customer_due_view due on due.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
    group by c.id, c.is_active, due.remaining_days
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
    select u.id as user_id, u.full_name as collector_name
    from public.users u
    join public.roles r on r.id = u.role_id
    where (r.name_role = 'مسؤول التحصيل' or r.name_role = 'مستخدم مخصص')
      and (v_target_user_id is null or u.id = v_target_user_id)
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
      col.user_id,
      coalesce(sum(case
        when p_currency is null or p_currency = 'ALL' or p_currency = '' then col.amount_yer
        when col.currency = p_currency then col.amount_yer
        else 0
      end), 0) as total_collected_yer
    from public.collections col
    join public.customers c on c.id = col.customer_id
    where (v_target_user_id is null or col.user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and (p_start_date is null or col.collected_date >= p_start_date)
      and (p_end_date is null or col.collected_date <= p_end_date)
    group by col.user_id
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

  -- 4) تطور التحصيل الشهري (آخر 6 أو 12 شهراً)
  v_end_month := date_trunc('month', coalesce(p_end_date, current_date))::date;
  v_start_month := date_trunc('month', coalesce(p_start_date, (v_end_month - interval '5 months')::date))::date;

  with month_series as (
    select generate_series(v_start_month, v_end_month, '1 month'::interval)::date as m_date
  ),
  month_collections as (
    select
      date_trunc('month', col.collected_date)::date as m_date,
      coalesce(sum(case
        when p_currency is null or p_currency = 'ALL' or p_currency = '' then col.amount_yer
        when col.currency = p_currency then col.amount_yer
        else 0
      end), 0) as collected_yer
    from public.collections col
    join public.customers c on c.id = col.customer_id
    where (v_target_user_id is null or col.user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
      and col.collected_date >= v_start_month
      and col.collected_date < (v_end_month + interval '1 month')::date
    group by date_trunc('month', col.collected_date)::date
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', to_char(ms.m_date, 'YYYY-MM'),
      'month_label', case to_char(ms.m_date, 'MM')
        when '01' then 'يناير'
        when '02' then 'فبراير'
        when '03' then 'مارس'
        when '04' then 'أبريل'
        when '05' then 'مايو'
        when '06' then 'يونيو'
        when '07' then 'يوليو'
        when '08' then 'أغسطس'
        when '09' then 'سبتمبر'
        when '10' then 'أكتوبر'
        when '11' then 'نوفمبر'
        when '12' then 'ديسمبر'
      end || ' ' || to_char(ms.m_date, 'YYYY'),
      'collected_yer', coalesce(mc.collected_yer, 0),
      'target_or_due_yer', v_total_debt_all,
      'collection_rate', case
        when (coalesce(mc.collected_yer, 0) + v_total_debt_all) > 0 then
          round((coalesce(mc.collected_yer, 0) / (coalesce(mc.collected_yer, 0) + v_total_debt_all) * 100)::numeric, 2)
        else 0
      end
    ) order by ms.m_date asc
  ), '[]'::jsonb)
  into v_monthly_collection_trend
  from month_series ms
  left join month_collections mc on mc.m_date = ms.m_date;

  -- 5) توزيع المديونيات حسب فئات العملاء
  with cat_debts as (
    select
      cat.id as category_id,
      coalesce(cat.category_name, 'غير محدد') as category_name,
      coalesce(cat.color, '#64748B') as category_color,
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
      ), 0) as total_debt_yer
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
    group by cat.id, cat.category_name, cat.color
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category_id', cd.category_id,
      'category_name', cd.category_name,
      'category_color', cd.category_color,
      'total_debt_yer', cd.total_debt_yer,
      'customer_count', cd.customer_count,
      'percentage', case
        when v_total_debt_all > 0 then round((cd.total_debt_yer / v_total_debt_all * 100)::numeric, 2)
        else 0
      end
    ) order by cd.total_debt_yer desc
  ), '[]'::jsonb)
  into v_category_debt
  from cat_debts cd;

  -- 6) أعلى 10 عملاء مديونية
  with top_debtors_calc as (
    select
      c.id as customer_id,
      c.customer_name,
      c.customer_number,
      cat.category_name,
      cat.color as category_color,
      u.full_name as assigned_user_name,
      coalesce(public.calc_total_due_yer(
        coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
        coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
        v_rate_usd,
        v_rate_sar
      ), 0) as total_due_yer,
      due.remaining_days,
      c.is_active
    from public.customers c
    left join public.customer_categories cat on cat.id = c.customer_category_id
    left join public.users u on u.id = c.assigned_user_id
    left join public.balances b on b.customer_id = c.id
    left join public.customer_due_view due on due.customer_id = c.id
    where (v_target_user_id is null or c.assigned_user_id = v_target_user_id)
      and (p_category_id is null or c.customer_category_id = p_category_id)
      and (
        array_length(v_my_cats, 1) is null
        or c.customer_category_id = any(v_my_cats)
      )
    group by c.id, c.customer_name, c.customer_number, cat.category_name, cat.color, u.full_name, due.remaining_days, c.is_active
    having coalesce(public.calc_total_due_yer(
      coalesce(sum(case when b.currency = 'USD' then (b.debit - b.credit) else 0 end), 0),
      coalesce(sum(case when b.currency = 'SAR' then (b.debit - b.credit) else 0 end), 0),
      coalesce(sum(case when b.currency = 'YER' then (b.debit - b.credit) else 0 end), 0),
      v_rate_usd,
      v_rate_sar
    ), 0) > 0
    order by total_due_yer desc
    limit 10
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'customer_id', tdc.customer_id,
      'customer_name', tdc.customer_name,
      'customer_number', tdc.customer_number,
      'category_name', tdc.category_name,
      'category_color', tdc.category_color,
      'assigned_user_name', tdc.assigned_user_name,
      'total_due_yer', tdc.total_due_yer,
      'debt_percentage', case
        when v_total_debt_all > 0 then round((tdc.total_due_yer / v_total_debt_all * 100)::numeric, 2)
        else 0
      end,
      'status', case
        when not tdc.is_active or tdc.total_due_yer <= 0 then 'settled'
        when tdc.remaining_days < 0 then 'overdue'
        else 'active'
      end
    )
  ), '[]'::jsonb)
  into v_top_10_debtors
  from top_debtors_calc tdc;

  return jsonb_build_object(
    'debt_by_currency', coalesce(v_debt_by_currency, '[]'::jsonb),
    'customers_by_status', coalesce(v_customers_by_status, '[]'::jsonb),
    'collector_performance', coalesce(v_collector_performance, '[]'::jsonb),
    'monthly_collection_trend', coalesce(v_monthly_collection_trend, '[]'::jsonb),
    'category_debt', coalesce(v_category_debt, '[]'::jsonb),
    'top_10_debtors', coalesce(v_top_10_debtors, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_analytics_charts_data to authenticated;
