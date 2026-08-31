import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { AppLayout } from '@/features/layout/AppLayout';
import { RequireScreen } from '@/features/layout/RequireScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { FollowupsScreen } from '@/features/followups/FollowupsScreen';
import { CustomersScreen } from '@/features/customers/CustomersScreen';
import { CustomerDetailScreen } from '@/features/customers/CustomerDetailScreen';
import { NotificationsScreen } from '@/features/notifications/NotificationsScreen';
import { CollectionsScreen } from '@/features/collections/CollectionsScreen';
import { PerformanceScreen } from '@/features/performance/PerformanceScreen';
import { UsersScreen } from '@/features/users/UsersScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { defaultScreen } from '@/lib/permissions';

/**
 * شاشة الاستيراد وحدها تحمّل مكتبة xlsx (~430 كيلوبايت). فصلها يعني أن مسؤول
 * التحصيل الذي يفتح النظام من جواله في الميدان لا ينزّلها إطلاقاً — يستخدمها
 * المحاسب والمدير فقط، وعند الحاجة.
 */
const ImportScreen = lazy(() =>
  import('@/features/import/ImportScreen').then((m) => ({ default: m.ImportScreen })),
);

export default function App() {
  const { profile, loading } = useAuth();

  if (loading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-[13px] text-gray-500">
        جارٍ التحميل…
      </div>
    );
  }

  if (!profile) return <LoginScreen />;

  const first = defaultScreen(profile);

  // مستخدم نشط بلا أي شاشة مسموحة: كان هذا ينتج إعادة توجيه لا نهائية
  // (وجهة افتراضية "dashboard" يرفضها الحارس فيعيد التوجيه إليها ثانية).
  // الحساب الجديد يُنشأ هكذا افتراضاً، فالرسالة الصريحة هي السلوك الصحيح.
  if (!first) return <NoScreensScreen />;

  const home = `/${first}`;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to={home} replace />} />

        <Route element={<RequireScreen screen="dashboard" />}>
          <Route path="/dashboard" element={<DashboardScreen />} />
        </Route>
        <Route element={<RequireScreen screen="followups" />}>
          <Route path="/followups" element={<FollowupsScreen />} />
        </Route>
        <Route element={<RequireScreen screen="customers" />}>
          <Route path="/customers" element={<CustomersScreen />} />
          <Route path="/customers/:id" element={<CustomerDetailScreen />} />
        </Route>
        <Route element={<RequireScreen screen="notifications" />}>
          <Route path="/notifications" element={<NotificationsScreen />} />
        </Route>
        <Route element={<RequireScreen screen="collections" />}>
          <Route path="/collections" element={<CollectionsScreen />} />
        </Route>
        <Route element={<RequireScreen screen="import" />}>
          <Route
            path="/import"
            element={
              <Suspense fallback={<div className="empty-state">جارٍ تحميل أدوات الاستيراد…</div>}>
                <ImportScreen />
              </Suspense>
            }
          />
        </Route>
        <Route element={<RequireScreen screen="performance" />}>
          <Route path="/performance" element={<PerformanceScreen />} />
        </Route>
        <Route element={<RequireScreen screen="users" />}>
          <Route path="/users" element={<UsersScreen />} />
        </Route>
        <Route element={<RequireScreen screen="settings" />}>
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>

        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}

function NoScreensScreen() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
      <h1 className="text-base font-bold">لا توجد شاشات مسموحة لحسابك</h1>
      <p className="max-w-sm text-[13px] text-gray-500">
        حسابك مفعّل لكن لم تُحدَّد له أي شاشة بعد. راجع مدير النظام ليضبط صلاحياتك من شاشة
        «المستخدمون والصلاحيات».
      </p>
      <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
        تسجيل الخروج
      </button>
    </div>
  );
}
