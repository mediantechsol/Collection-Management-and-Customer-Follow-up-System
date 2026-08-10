import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useProfile } from '@/features/auth/AuthContext';
import { useNotifications } from '@/lib/queries';
import { IconLogout, IconMenu, IconClose, SCREEN_ICONS } from '@/components/ui/Icons';
import { allowedScreens, isAdmin, isAccountant, SCREEN_LABELS, type ScreenKey } from '@/lib/permissions';

/**
 * الهيكل العام: قائمة جانبية + شريط علوي.
 * على الجوال تتحوّل القائمة إلى درج منزلق (كانت في النموذج الأولي تنكمش إلى
 * أيقونات بلا تسميات، وهو غير عملي على شاشة صغيرة).
 */
export function AppLayout() {
  const profile = useProfile();
  const { signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const screens = allowedScreens(profile).filter((s): s is ScreenKey => s in SCREEN_LABELS);
  const currentScreen = location.pathname.split('/')[1] as ScreenKey | undefined;
  const title = currentScreen && SCREEN_LABELS[currentScreen] ? SCREEN_LABELS[currentScreen] : '';

  const { data: notifications } = useNotifications();
  const unread = (notifications ?? []).filter(
    (n) =>
      n.status !== 'تم التعامل' &&
      (isAdmin(profile) || isAccountant(profile) || n.user_id === profile.id),
  ).length;

  const initials = (profile.full_name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

  const nav = (
    <nav className="flex flex-1 flex-col">
      <div className="mb-2.5 border-b border-white/10 px-[18px] pb-[18px] text-center">
        <div className="relative mx-auto mb-2 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-[#6C4CF5] text-lg font-bold text-white">
          {initials}
          <span className="absolute bottom-px left-px h-[11px] w-[11px] rounded-full border-2 border-navy-800 bg-green-500" />
        </div>
        <div className="text-[13.5px] font-bold text-white">{profile.full_name}</div>
        <div className="mt-0.5 text-[11px] text-[#8E9BD1]">{profile.role_name}</div>
      </div>

      {screens.map((key) => {
        const Icon = SCREEN_ICONS[key];
        return (
          <NavLink
            key={key}
            to={`/${key}`}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `mx-2.5 my-0.5 flex items-center gap-2.5 rounded-[10px] px-4 py-2.5 text-[13px] transition-colors ${
                isActive
                  ? 'bg-blue-600 font-semibold text-white shadow-[0_2px_8px_rgba(47,95,224,.4)]'
                  : 'text-[#AEB9E0] hover:bg-white/[.07] hover:text-white'
              }`
            }
          >
            <Icon className="h-[17px] w-[17px] shrink-0 opacity-85" />
            <span>{SCREEN_LABELS[key]}</span>
            {key === 'notifications' && unread > 0 && (
              <span className="ms-auto min-w-4 rounded-full bg-notif-today-fg px-1.5 py-px text-center text-[10px] font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
        );
      })}

      <div className="mt-auto px-2.5 pt-2.5">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-4 py-2.5 text-[13px] text-[#8E9BD1] hover:bg-white/[.07] hover:text-white"
        >
          <IconLogout className="h-[17px] w-[17px]" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* ------------------------------------------------ القائمة على سطح المكتب */}
      <aside className="hidden w-[238px] shrink-0 flex-col bg-gradient-to-b from-navy-700 to-navy-900 py-[18px] md:flex">
        {nav}
      </aside>

      {/* ------------------------------------------------ درج الجوال */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-[260px] flex-col bg-gradient-to-b from-navy-700 to-navy-900 py-[18px] pt-safe">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="إغلاق القائمة"
              className="mb-2 self-start px-4 text-white/70"
            >
              <IconClose className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3.5 pt-safe md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="md:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="فتح القائمة"
            >
              <IconMenu className="h-5 w-5 text-gray-700" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold md:text-[19px]">{title}</h1>
              <div className="hidden text-[11.5px] text-gray-500 md:block">
                الرئيسية / {title}
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-[3px] text-[11px] font-semibold text-blue-700">
            {profile.role_name}
          </span>
        </header>

        <main className="flex-1 overflow-x-hidden p-4 pb-safe md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
