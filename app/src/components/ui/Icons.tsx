/** أيقونات SVG — منقولة كما هي عن النموذج الأولي (ICONS في السطر 663). */

import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

type Props = SVGProps<SVGSVGElement>;

export const IconDashboard = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconPhone = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.8 2.1z" />
  </svg>
);

export const IconUsers = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.1a4 4 0 0 1 0 7.8" />
  </svg>
);

export const IconBell = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const IconUpload = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
  </svg>
);

export const IconChart = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 3v18h18" />
    <rect x="7" y="12" width="3" height="6" />
    <rect x="12.5" y="8" width="3" height="10" />
    <rect x="18" y="5" width="3" height="13" />
  </svg>
);

export const IconShield = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const IconLogout = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const IconCalendar = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export const IconCalendarAlert = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M12 14v3" />
    <circle cx="12" cy="19.2" r=".4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconUserCheck = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M17 11l2 2 4-4" />
  </svg>
);

export const IconHandshake = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M11 12l3 3-2 2a2 2 0 1 1-3-3" />
    <path d="M14 15l2-2" />
    <path d="M2 11l5-5 4 3h3l4 4-3 3-2-1" />
    <path d="M22 11l-5-5-3 2" />
  </svg>
);

export const IconClock = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

export const IconEye = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconPlus = (p: Props) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconWallet = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M20 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h12" />
    <path d="M3 6v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4" />
    <path d="M17 12h4v4h-4a2 2 0 0 1 0-4z" />
  </svg>
);

export const IconMenu = (p: Props) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);

export const IconClose = (p: Props) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const IconArrow = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

export const IconSettings = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconBuilding = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v8h4" />
    <path d="M18 9h2a2 2 0 0 1 2 2v11h-4" />
    <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
  </svg>
);

export const IconTag = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
    <path d="M7 7h.01" />
  </svg>
);

export const IconExchange = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M7 10h14l-4-4" />
    <path d="M17 14H3l4 4" />
  </svg>
);

export const IconHistory = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

export const IconCalculator = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" x2="16" y1="6" y2="6" />
    <line x1="16" x2="16" y1="14" />
    <path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01" />
  </svg>
);

import type { IconName } from '@/lib/logic/notifications';
import type { ScreenKey } from '@/lib/permissions';

export const NOTIF_ICONS: Record<IconName, (p: Props) => JSX.Element> = {
  calendar: IconCalendar,
  calendarAlert: IconCalendarAlert,
  userCheck: IconUserCheck,
  handshake: IconHandshake,
  clock: IconClock,
  eye: IconEye,
};

export const SCREEN_ICONS: Record<ScreenKey, (p: Props) => JSX.Element> = {
  dashboard: IconDashboard,
  followups: IconPhone,
  customers: IconUsers,
  notifications: IconBell,
  collections: IconWallet,
  import: IconUpload,
  performance: IconChart,
  users: IconShield,
  settings: IconSettings,
};
