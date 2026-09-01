import { useState } from 'react';
import { useProfile } from '@/features/auth/AuthContext';
import { useCategories, useUserDirectory } from '@/lib/queries';
import { isAdmin, isAccountant } from '@/lib/permissions';
import { todayStr, addDays } from '@/lib/logic/dates';
import { IconFilter, IconRefresh } from '@/components/ui/Icons';
import type { AnalyticsFilters, Currency } from '@/types/models';

interface Props {
  filters: AnalyticsFilters;
  onChange: (filters: AnalyticsFilters) => void;
}

type PeriodPreset = 'today' | 'week' | 'month' | 'quarter' | 'custom';

function getPresetDates(preset: PeriodPreset): { startDate?: string; endDate?: string } {
  const today = todayStr();
  const d = new Date();

  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'week': {
      const day = d.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
      // في العالم العربي يبدأ الأسبوع السبت (day = 6)
      const diff = (day + 1) % 7;
      const start = addDays(today, -diff);
      return { startDate: start, endDate: today };
    }
    case 'month': {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
      return {
        startDate: `${y}-${m}-01`,
        endDate: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    case 'quarter': {
      const y = d.getFullYear();
      const q = Math.floor(d.getMonth() / 3);
      const startMonth = q * 3;
      const endMonth = startMonth + 2;
      const startM = String(startMonth + 1).padStart(2, '0');
      const endM = String(endMonth + 1).padStart(2, '0');
      const lastDay = new Date(y, endMonth + 1, 0).getDate();
      return {
        startDate: `${y}-${startM}-01`,
        endDate: `${y}-${endM}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    case 'custom':
    default:
      return {};
  }
}

export function ReportsFilterBar({ filters, onChange }: Props) {
  const profile = useProfile();
  const canFilterCollectors = isAdmin(profile) || isAccountant(profile);

  const { data: directory = [] } = useUserDirectory();
  const { data: categories = [] } = useCategories();

  const [preset, setPreset] = useState<PeriodPreset>('month');

  // استخراج مسؤولي التحصيل فقط للقائمة المنسدلة
  const collectors = directory.filter(
    (u) => u.name_role === 'مسؤول التحصيل' || u.name_role === 'مستخدم مخصص',
  );

  const handlePresetChange = (newPreset: PeriodPreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const { startDate, endDate } = getPresetDates(newPreset);
      onChange({
        ...filters,
        startDate,
        endDate,
      });
    }
  };

  const handleReset = () => {
    setPreset('month');
    const { startDate, endDate } = getPresetDates('month');
    onChange({
      startDate,
      endDate,
      userId: undefined,
      categoryId: undefined,
      currency: 'ALL',
    });
  };

  return (
    <div className="card mb-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <IconFilter className="h-4 w-4" />
          </span>
          <span className="text-[13.5px] font-bold text-gray-800">شريط الفلاتر والتحليل</span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          <span>إعادة ضبط الفلاتر</span>
          <IconRefresh className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. فلتر الفترة الزمنية */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">الفترة الزمنية</label>
          <select
            value={preset}
            onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="today">اليوم</option>
            <option value="week">هذا الأسبوع</option>
            <option value="month">هذا الشهر (افتراضي)</option>
            <option value="quarter">الربع الحالي</option>
            <option value="custom">فترة مخصصة…</option>
          </select>
        </div>

        {/* 2. فلتر مسؤول التحصيل */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">مسؤول التحصيل</label>
          {canFilterCollectors ? (
            <select
              value={filters.userId ?? ''}
              onChange={(e) =>
                onChange({ ...filters, userId: e.target.value ? e.target.value : undefined })
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">جميع مسؤولي التحصيل</option>
              {collectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.name_role})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              disabled
              value={profile.full_name}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 shadow-sm cursor-not-allowed"
              title="بياناتك محصورة بحسابك الشخصي فقط"
            />
          )}
        </div>

        {/* 3. فلتر فئة العميل */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">فئة العميل</label>
          <select
            value={filters.categoryId ?? ''}
            onChange={(e) =>
              onChange({ ...filters, categoryId: e.target.value ? e.target.value : undefined })
            }
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">كل فئات العملاء</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.category_name}
              </option>
            ))}
          </select>
        </div>

        {/* 4. فلتر العملة */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">العملة</label>
          <select
            value={filters.currency ?? 'ALL'}
            onChange={(e) =>
              onChange({ ...filters, currency: (e.target.value as Currency | 'ALL') })
            }
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="ALL">كل العملات (معادل بالريال)</option>
            <option value="YER">ريال يمني (YER)</option>
            <option value="USD">دولار أمريكي (USD)</option>
            <option value="SAR">ريال سعودي (SAR)</option>
          </select>
        </div>
      </div>

      {/* حقول التاريخ المخصص إذا تم اختيار "فترة مخصصة" */}
      {preset === 'custom' && (
        <div className="mt-3.5 grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">من تاريخ</label>
            <input
              type="date"
              value={filters.startDate ?? ''}
              onChange={(e) => onChange({ ...filters, startDate: e.target.value || undefined })}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">إلى تاريخ</label>
            <input
              type="date"
              value={filters.endDate ?? ''}
              onChange={(e) => onChange({ ...filters, endDate: e.target.value || undefined })}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
