import { useState } from 'react';
import { useProfile } from '@/features/auth/AuthContext';
import { useAnalyticsKPIs, useAnalyticsCharts } from '@/lib/queries';
import { ReportsFilterBar } from '@/features/reports/ReportsFilterBar';
import { ReportsKpiCards } from '@/features/reports/ReportsKpiCards';
import { MonthlyCollectionTrendChart } from '@/features/reports/charts/MonthlyCollectionTrendChart';
import { CollectorPerformanceChart } from '@/features/reports/charts/CollectorPerformanceChart';
import { CurrencyDistributionChart } from '@/features/reports/charts/CurrencyDistributionChart';
import { CustomerStatusDistributionChart } from '@/features/reports/charts/CustomerStatusDistributionChart';
import { CategoryDebtChart } from '@/features/reports/charts/CategoryDebtChart';
import { TopDebtorsTable } from '@/features/reports/TopDebtorsTable';
import { PrintableReportView } from '@/features/reports/export/PrintableReportView';
import { exportAnalyticsToExcel } from '@/features/reports/export/exportToExcel';
import { IconDownload, IconPrinter } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import type { AnalyticsFilters } from '@/types/models';

function getCurrentMonthDates(): { startDate: string; endDate: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
  return {
    startDate: `${y}-${m}-01`,
    endDate: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function ReportsScreen() {
  const toast = useToast();
  const profile = useProfile();
  const initialDates = getCurrentMonthDates();

  const [filters, setFilters] = useState<AnalyticsFilters>({
    startDate: initialDates.startDate,
    endDate: initialDates.endDate,
    currency: 'ALL',
  });

  const { data: kpis, isLoading: loadingKpis } = useAnalyticsKPIs(filters);
  const { data: chartsData, isLoading: loadingCharts } = useAnalyticsCharts(filters);

  const handleExportExcel = () => {
    try {
      exportAnalyticsToExcel({ kpis, chartsData, filters, profile });
      toast.show('تم تصدير تقرير التحصيل والتحليل المالي إلى Excel بنجاح');
    } catch (err) {
      toast.error('حدث خطأ أثناء تصدير ملف Excel');
    }
  };

  const handleExportPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* رأس الشاشة مع أزرار التصدير */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 md:text-xl">
            التقارير التحليلية ولوحة المؤشرات
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            تحليل شامل لأداء التحصيل، مديونيات العملاء، والمؤشرات المالية التراكمية
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="btn btn-outline flex items-center gap-1.5 shadow-sm"
          >
            <IconDownload className="h-4 w-4 text-gray-600" />
            <span>تصدير Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="btn btn-primary flex items-center gap-1.5 shadow-sm"
          >
            <IconPrinter className="h-4 w-4" />
            <span>تقرير PDF</span>
          </button>
        </div>
      </div>

      {/* شريط الفلاتر والتحليل */}
      <ReportsFilterBar filters={filters} onChange={setFilters} />

      {/* بطاقات المؤشرات الـ 5 */}
      <ReportsKpiCards kpis={kpis} loading={loadingKpis} />

      {/* شبكة الرسوم البيانية التفاعلية الخمسة */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* المخطط 1: تطور نسب ومبالغ التحصيل الشهري */}
        <MonthlyCollectionTrendChart
          data={chartsData?.monthly_collection_trend ?? []}
          loading={loadingCharts}
        />

        {/* المخطط 2: مقارنة أداء مسؤولي التحصيل */}
        <CollectorPerformanceChart
          data={chartsData?.collector_performance ?? []}
          loading={loadingCharts}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* المخطط 3: توزيع المديونيات حسب العملة */}
        <CurrencyDistributionChart
          data={chartsData?.debt_by_currency ?? []}
          loading={loadingCharts}
        />

        {/* المخطط 4: توزيع العملاء حسب الحالة */}
        <CustomerStatusDistributionChart
          data={chartsData?.customers_by_status ?? []}
          loading={loadingCharts}
        />

        {/* المخطط 5: إجمالي المديونيات حسب فئة العميل */}
        <CategoryDebtChart
          data={chartsData?.category_debt ?? []}
          loading={loadingCharts}
        />
      </div>

      {/* جدول أعلى 10 عملاء مديونية */}
      <TopDebtorsTable
        debtors={chartsData?.top_10_debtors ?? []}
        loading={loadingCharts}
      />

      {/* مستند الطباعة والتصدير كـ PDF باللغة العربية مع التوقيعات والختم */}
      <PrintableReportView
        kpis={kpis}
        chartsData={chartsData}
        filters={filters}
        profile={profile}
      />
    </div>
  );
}
