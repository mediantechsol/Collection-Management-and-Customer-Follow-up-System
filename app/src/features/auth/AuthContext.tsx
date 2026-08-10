/**
 * المصادقة الحقيقية عبر Supabase Auth — بديل attemptLogin() في النموذج الأولي
 * الذي كان يقارن كلمة المرور كنص صريح مخزّن في كود الواجهة.
 *
 * تسلسل الدخول:
 *   1) اسم المستخدم ← إيميل داخلي ← signInWithPassword.
 *   2) جلب الملف الشخصي (الدور والصلاحيات) من public.users.
 *   3) رفض المستخدم "موقوف" وإنهاء جلسته فوراً.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, translateAuthError, usernameToEmail } from '@/lib/supabase';
import type { RoleName, ScreenKey, ScreenPermissions, UserProfile } from '@/lib/permissions';

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface ProfileRow {
  id: string;
  full_name: string;
  username: string;
  phone: string | null;
  role_id: string;
  status: 'نشط' | 'موقوف';
  allowed_screens: string[] | null;
  allowed_category_ids: string[] | null;
  screen_permissions: ScreenPermissions | null;
  roles: { name_role: RoleName } | null;
}

async function fetchProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, full_name, username, phone, role_id, status, allowed_screens, allowed_category_ids, screen_permissions, roles!inner(name_role)',
    )
    .eq('id', userId)
    .single<ProfileRow>();

  if (error) throw new Error(translateAuthError(error.message));
  if (!data) throw new Error('لم يُعثر على ملف المستخدم');

  return {
    id: data.id,
    full_name: data.full_name,
    username: data.username,
    phone: data.phone,
    role_id: data.role_id,
    role_name: data.roles?.name_role ?? 'مستخدم مخصص',
    status: data.status,
    allowed_screens: (data.allowed_screens ?? []) as ScreenKey[],
    allowed_category_ids: data.allowed_category_ids ?? [],
    screen_permissions: data.screen_permissions ?? {},
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // يمنع سباقاً بين استعادة الجلسة عند الإقلاع وبين تسجيل دخول يدوي متزامن
  const loadingProfileFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    loadingProfileFor.current = userId;
    try {
      const p = await fetchProfile(userId);
      if (loadingProfileFor.current !== userId) return;

      if (p.status !== 'نشط') {
        await supabase.auth.signOut();
        setProfile(null);
        setSession(null);
        setError('هذا المستخدم موقوف — راجع مدير النظام');
        return;
      }
      setProfile(p);
    } catch (e) {
      // فشل جلب الملف الشخصي مع وجود جلسة صالحة يعني حساب مصادقة بلا ملف
      // (أو RLS تمنعه) — لا نُبقي المستخدم في حالة نصف مسجّل.
      await supabase.auth.signOut();
      setProfile(null);
      setSession(null);
      setError(e instanceof Error ? e.message : 'تعذّر تحميل بيانات المستخدم');
    }
  }, []);

  // استعادة الجلسة عند فتح التطبيق + متابعة تغيّرات المصادقة
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_OUT' || !newSession?.user) {
        setProfile(null);
        loadingProfileFor.current = null;
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: usernameToEmail(username),
          password,
        });
        if (signInError) throw new Error(translateAuthError(signInError.message));
        if (!data.user) throw new Error('تعذّر تسجيل الدخول');

        setSession(data.session);
        await loadProfile(data.user.id);

        // يُسجَّل داخل قاعدة البيانات بـ auth.uid() ولا يمكن تزويره من الواجهة
        await supabase.rpc('log_auth_event', { p_action: 'login' });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذّر تسجيل الدخول');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.rpc('log_auth_event', { p_action: 'logout' });
    } catch {
      // تسجيل الخروج يجب أن ينجح حتى لو فشل كتابة السجل
    }
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo<AuthState>(
    () => ({ session, profile, loading, error, signIn, signOut, refreshProfile }),
    [session, profile, loading, error, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider');
  return ctx;
}

/** الملف الشخصي مضموناً — للاستخدام داخل الشاشات المحمية فقط. */
export function useProfile(): UserProfile {
  const { profile } = useAuth();
  if (!profile) throw new Error('لا يوجد مستخدم مسجّل دخول');
  return profile;
}
