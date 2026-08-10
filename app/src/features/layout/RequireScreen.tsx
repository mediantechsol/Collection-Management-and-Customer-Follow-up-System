import { Navigate, Outlet } from 'react-router-dom';
import { useProfile } from '@/features/auth/AuthContext';
import { defaultScreen, hasScreenAccess, type ScreenKey } from '@/lib/permissions';

/**
 * حارس الشاشة — يمنع فتح شاشة غير مسموحة عبر كتابة الرابط مباشرة.
 *
 * ⚠️ هذا ليس أمناً: المستخدم يستطيع تعديل حالة JS في متصفحه. الأمان الحقيقي
 * في سياسات RLS التي سترفض بياناته على أي حال — هذا يمنع فقط عرض شاشة فارغة
 * أو رسائل خطأ مربكة.
 */
export function RequireScreen({ screen }: { screen: ScreenKey }) {
  const profile = useProfile();

  if (!hasScreenAccess(profile, screen)) {
    return <Navigate to={`/${defaultScreen(profile)}`} replace />;
  }
  return <Outlet />;
}
