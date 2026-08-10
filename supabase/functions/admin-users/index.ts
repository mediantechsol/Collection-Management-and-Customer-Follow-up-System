// ============================================================================
// Edge Function: admin-users
//
// إنشاء وتعديل حسابات المصادقة. هذه العمليات تحتاج service_role key، وهو مفتاح
// يتجاوز كل سياسات RLS — لذلك لا يوجد ولا يجوز أن يوجد في كود الواجهة إطلاقاً.
// الواجهة تستدعي هذه الدالة بـ JWT المستخدم الحالي، والدالة:
//   1) تتحقق أن المستدعي مسجّل دخول فعلاً (بمفتاح anon، لا service_role).
//   2) تتحقق أن دوره "مدير النظام" وحالته "نشط" من قاعدة البيانات.
//   3) عندها فقط تستخدم service_role لتنفيذ العملية.
//
// الموظفون لا يملكون بريداً إلكترونياً حقيقياً، فيُولَّد إيميل داخلي من اسم
// المستخدم: <username>@<INTERNAL_EMAIL_DOMAIN>
//
// النشر:
//   supabase functions deploy admin-users
//   supabase secrets set INTERNAL_EMAIL_DOMAIN=dr-ayman.local
// (SUPABASE_URL و SUPABASE_ANON_KEY و SUPABASE_SERVICE_ROLE_KEY تُحقن تلقائياً)
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMAIL_DOMAIN = Deno.env.get('INTERNAL_EMAIL_DOMAIN') ?? 'dr-ayman.local';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** اسم المستخدم: حروف إنجليزية وأرقام و . _ - فقط، حتى ينتج إيميل صالح دائماً */
function isValidUsername(u: unknown): u is string {
  return typeof u === 'string' && /^[a-zA-Z0-9._-]{3,40}$/.test(u);
}

function emailFor(username: string) {
  return `${username.toLowerCase()}@${EMAIL_DOMAIN}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'الطريقة غير مدعومة' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'مطلوب تسجيل دخول' }, 401);
  }

  // (1) التحقق من هوية المستدعي — بمفتاح anon وبالـ JWT الخاص به
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'جلسة غير صالحة' }, 401);

  // (2) التحقق من الدور والحالة من قاعدة البيانات (لا من الـ JWT — قابل للتلاعب)
  const { data: profile, error: profErr } = await asCaller
    .from('users')
    .select('id, status, roles!inner(name_role)')
    .eq('id', userData.user.id)
    .single();

  if (profErr || !profile) return json({ error: 'تعذّر التحقق من الصلاحيات' }, 403);

  const roleName = (profile as { roles: { name_role: string } }).roles?.name_role;
  if (roleName !== 'مدير النظام' || profile.status !== 'نشط') {
    return json({ error: 'غير مصرّح: إدارة المستخدمين مقتصرة على مدير النظام' }, 403);
  }

  // (3) من هنا فقط نستخدم service_role
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'صيغة الطلب غير صالحة' }, 400);
  }

  const action = body.action;

  try {
    // ---------------------------------------------------------------- إنشاء
    if (action === 'create') {
      const { username, password, full_name, phone, role_id } = body as {
        username?: string; password?: string; full_name?: string;
        phone?: string; role_id?: string;
      };

      if (!isValidUsername(username)) {
        return json({ error: 'اسم المستخدم يجب أن يكون حروفاً إنجليزية/أرقاماً (3-40 خانة)' }, 400);
      }
      if (typeof password !== 'string' || password.length < 8) {
        return json({ error: 'كلمة المرور يجب ألا تقل عن 8 خانات' }, 400);
      }
      if (!full_name || !role_id) {
        return json({ error: 'الاسم الكامل والدور مطلوبان' }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: emailFor(username),
        password,
        email_confirm: true, // لا يوجد بريد حقيقي لإرسال رابط تأكيد إليه
        user_metadata: { username, full_name, phone: phone ?? null },
      });
      if (createErr) return json({ error: createErr.message }, 400);

      // الـ trigger أنشأ الملف الشخصي بحالة "موقوف" ودور "مستخدم مخصص".
      // نضبط الدور والبيانات هنا، وتبقى الحالة "موقوف" حتى يفعّلها المدير
      // صراحة بعد ضبط الشاشات والفئات — أأمن افتراض ممكن.
      const { error: updErr } = await admin
        .from('users')
        .update({ full_name, phone: phone ?? null, role_id })
        .eq('id', created.user.id);
      if (updErr) return json({ error: updErr.message }, 400);

      return json({ ok: true, id: created.user.id, email: emailFor(username) });
    }

    // ------------------------------------------------------- تغيير كلمة المرور
    if (action === 'reset_password') {
      const { user_id, password } = body as { user_id?: string; password?: string };
      if (!user_id) return json({ error: 'معرّف المستخدم مطلوب' }, 400);
      if (typeof password !== 'string' || password.length < 8) {
        return json({ error: 'كلمة المرور يجب ألا تقل عن 8 خانات' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ------------------------------------------------- تعطيل/تفعيل حساب المصادقة
    // العميل طلب صراحة: لا يُحذف مستخدم غادر العمل، بل يُوقف حسابه للحفاظ على
    // سجل أعماله التاريخي — لذلك لا يوجد إجراء delete هنا إطلاقاً.
    if (action === 'set_status') {
      const { user_id, status } = body as { user_id?: string; status?: string };
      if (!user_id || (status !== 'نشط' && status !== 'موقوف')) {
        return json({ error: 'قيم غير صالحة' }, 400);
      }
      // ban_duration يمنع تسجيل الدخول فوراً حتى لو كانت للمستخدم جلسة قائمة
      const { error: banErr } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: status === 'موقوف' ? '87600h' : 'none',
      });
      if (banErr) return json({ error: banErr.message }, 400);

      const { error } = await admin.from('users').update({ status }).eq('id', user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'إجراء غير معروف' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'خطأ غير متوقع' }, 500);
  }
});
