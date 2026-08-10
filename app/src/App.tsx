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

  const home = `/${defaultScreen(profile)}`;

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

        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}
