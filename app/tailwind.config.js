/** @type {import('tailwindcss').Config} */
// الألوان منقولة حرفياً من متغيّرات :root في النموذج الأولي
// (legacy/frontend/collection-system.html:10-25) للحفاظ على نفس الهوية البصرية.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: {
          50: '#EAF2FE', 100: '#D3E4FC', 500: '#3B6FF0',
          600: '#2F5FE0', 700: '#2447B8', 900: '#0E1636',
        },
        navy: { 700: '#1A2554', 800: '#121A42', 900: '#0B1130' },
        gray: {
          25: '#FAFBFC', 50: '#F5F6F8', 100: '#ECEEF1', 200: '#DDE1E6',
          300: '#C3C9D1', 500: '#8A93A0', 600: '#5F6874', 700: '#414952', 900: '#1B2027',
        },
        green: { 50: '#EAFBF0', 500: '#16A34A' },
        amber: { 50: '#FEF6E7', 500: '#D97706' },
        red: { 50: '#FDECEC', 500: '#DC2626' },
        // ألوان أنواع التنبيهات الستة — نفس اللون على البطاقة والشارة
        notif: {
          'before-fg': '#E23F6B', 'before-bg': '#FDEAF1',
          'today-fg': '#E23F3F', 'today-bg': '#FDEAEA',
          'shopping-fg': '#EF8C3C', 'shopping-bg': '#FDEEE0',
          'promise-fg': '#3E7BFA', 'promise-bg': '#EAF1FE',
          'stale-fg': '#DFA22E', 'stale-bg': '#FCF3DE',
          'escalate-fg': '#8B5CF6', 'escalate-bg': '#F1ECFE',
        },
      },
      fontFamily: {
        sans: ["'IBM Plex Sans Arabic'", 'system-ui', 'sans-serif'],
        mono: ["'IBM Plex Mono'", 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '12px', sm: '8px' },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)',
        md: '0 4px 14px rgba(16,24,40,.08)',
      },
    },
  },
  plugins: [],
};
