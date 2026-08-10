/**
 * عميل Supabase الوحيد في التطبيق.
 *
 * ⚠️ anon key فقط. مفتاح service_role يتجاوز كل سياسات RLS ولا يوجد له مكان
 * في كود يُرسل للمتصفح — العمليات التي تحتاجه (إنشاء حساب، تغيير كلمة مرور،
 * إيقاف حساب) تمر عبر Edge Function admin-users.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'إعدادات Supabase ناقصة: انسخ app/.env.example إلى app/.env.local واملأ ' +
      'VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY من لوحة تحكم المشروع.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** النطاق الداخلي المستخدم لتحويل اسم المستخدم إلى إيميل مصادقة. */
export const INTERNAL_EMAIL_DOMAIN =
  import.meta.env.VITE_INTERNAL_EMAIL_DOMAIN || 'dr-ayman.local';

/**
 * الموظفون لا يملكون بريداً إلكترونياً، فيدخلون باسم المستخدم فقط ونحن نحوّله
 * إلى الإيميل الداخلي الذي أُنشئ به الحساب في Edge Function admin-users.
 * يجب أن يبقى هذا التحويل مطابقاً تماماً لما هناك (تحويل لحروف صغيرة).
 */
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** ترجمة أخطاء Supabase الشائعة إلى رسائل عربية مفهومة للموظف. */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'اسم المستخدم أو كلمة المرور غير صحيحة';
  if (m.includes('email not confirmed')) return 'الحساب غير مفعّل — راجع مدير النظام';
  if (m.includes('user is banned')) return 'هذا الحساب موقوف — راجع مدير النظام';
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'محاولات كثيرة متتالية — انتظر قليلاً ثم أعد المحاولة';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'تعذّر الاتصال بالخادم — تحقق من الإنترنت';
  }
  return message;
}
