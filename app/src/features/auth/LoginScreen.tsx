import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthContext';

/**
 * شاشة الدخول — مصادقة حقيقية عبر Supabase Auth.
 *
 * فرق جوهري عن النموذج الأولي: لا توجد هنا أي كلمة مرور ولا قائمة حسابات
 * تجريبية معروضة تحت النموذج. كلمات المرور تُدار في auth.users ولا يعرفها
 * كود الواجهة إطلاقاً.
 */
export function LoginScreen() {
  const { signIn, error, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    try {
      await signIn(username, password);
    } catch {
      // الرسالة تُعرض من حالة السياق
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || loading;

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-900 p-4">
      <div className="w-full max-w-[380px] rounded-xl bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        <h1 className="text-base font-bold">نظام إدارة التحصيل ومتابعة العملاء</h1>
        <p className="mb-5 mt-0.5 text-xs text-gray-500">مكتب الدكتور أيمن لخدمات الدواجن</p>

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="username">اسم المستخدم</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              dir="ltr"
              className="text-left"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password">كلمة المرور</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              className="text-left"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>

          {error && (
            <div role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-500">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary mt-1.5 w-full py-2.5" disabled={busy}>
            {busy ? 'جارٍ التحقق…' : 'تسجيل الدخول'}
          </button>
        </form>

        <p className="mt-5 border-t border-gray-100 pt-3.5 text-[11px] leading-relaxed text-gray-500">
          نسيت كلمة المرور؟ راجع مدير النظام — هو وحده من يستطيع إعادة تعيينها.
        </p>
      </div>
    </div>
  );
}
