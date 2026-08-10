-- ============================================================================
-- سجل التدقيق (Audit Trail) — يُكتب داخل قاعدة البيانات حصراً
--
-- في النموذج الأولي كانت الواجهة تكتب في activity_logs بأي قيم تشاء
-- (logActivity في JS)، أي أن السجل كان قابلاً للتزوير من أدوات المطوّر.
-- هنا لا توجد سياسة insert أصلاً، والكتابة تتم عبر triggers بـ security definer.
--
-- العمليات الجماعية (الاستيراد) تُعطّل التدقيق الصفّي وتكتب سطراً ملخّصاً
-- واحداً بدل ~700 سطر، عبر الإعداد app.skip_audit داخل معاملة الاستيراد.
-- ============================================================================

-- ⚠️ دالة داخلية فقط: تُستدعى من دوال أخرى بـ security definer (الاستيراد،
-- رفع الحالة). لا تُمنح لأي دور تطبيقي — لو مُنحت لصار بإمكان أي مستخدم كتابة
-- أي سطر في سجل التدقيق، وهي بالضبط الثغرة التي يعالجها هذا الملف.
create or replace function public.write_activity_log(
  p_action_type text,
  p_table_name  text,
  p_record_id   text,
  p_old_value   jsonb default null,
  p_new_value   jsonb default null
) returns void language sql security definer set search_path = public as $$
  insert into public.activity_logs(user_id, action_type, table_name, record_id, old_value, new_value)
  values (auth.uid(), p_action_type, p_table_name, p_record_id, p_old_value, p_new_value);
$$;

revoke all on function public.write_activity_log(text, text, text, jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_id     text;
  v_old    jsonb;
  v_new    jsonb;
begin
  -- تخطّي التدقيق الصفّي أثناء عمليات الاستيراد الجماعية
  if coalesce(current_setting('app.skip_audit', true), 'off') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_action := 'create'; v_new := to_jsonb(new); v_id := new.id::text;
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := new.id::text;
  else
    v_action := 'delete'; v_old := to_jsonb(old); v_id := old.id::text;
  end if;

  insert into public.activity_logs(user_id, action_type, table_name, record_id, old_value, new_value)
  values (auth.uid(), v_action, tg_table_name, v_id, v_old, v_new);

  return coalesce(new, old);
end;
$$;

create trigger trg_audit_customers
  after insert or update or delete on public.customers
  for each row execute function public.audit_row();

create trigger trg_audit_users
  after insert or update or delete on public.users
  for each row execute function public.audit_row();

create trigger trg_audit_followups
  after insert on public.followups
  for each row execute function public.audit_row();

create trigger trg_audit_collections
  after insert or update or delete on public.collections
  for each row execute function public.audit_row();

create trigger trg_audit_incentive_payments
  after insert or update or delete on public.incentive_payments
  for each row execute function public.audit_row();

create trigger trg_audit_categories
  after insert or update or delete on public.customer_categories
  for each row execute function public.audit_row();

create trigger trg_audit_due_dates
  after insert or update or delete on public.due_dates
  for each row execute function public.audit_row();

-- ----------------------------------------------------------------------------
-- تسجيل الدخول/الخروج — الحدث الوحيد الذي لا يمكن التقاطه بـ trigger،
-- فتستدعيه الواجهة صراحة. القيم المقبولة مقيّدة حتى لا يُحقن أي فعل آخر.
-- ----------------------------------------------------------------------------
create or replace function public.log_auth_event(p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_action not in ('login','logout') then
    raise exception 'قيمة غير مسموحة: %', p_action;
  end if;
  if auth.uid() is null then
    return;
  end if;
  insert into public.activity_logs(user_id, action_type, table_name, record_id)
  values (auth.uid(), p_action, 'users', auth.uid()::text);
end;
$$;

revoke all on function public.log_auth_event(text) from public, anon;
grant execute on function public.log_auth_event(text) to authenticated;
