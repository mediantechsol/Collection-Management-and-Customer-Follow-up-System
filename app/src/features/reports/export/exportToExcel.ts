import * as XLSX from 'xlsx';
import type { AnalyticsFilters, AnalyticsKPIs, AnalyticsChartsData } from '@/types/models';
import type { UserProfile } from '@/lib/permissions';

interface ExportParams {
  kpis?: AnalyticsKPIs;
  chartsData?: AnalyticsChartsData;
  filters: AnalyticsFilters;
  profile?: UserProfile | null;
}

export function exportAnalyticsToExcel({ kpis, chartsData, filters, profile }: ExportParams) {
  const wb = XLSX.utils.book_new();

  // 1. ورقة ملخص المؤشرات العامة
  const summaryRows = [
    { 'البيان': 'تاريخ ووقت استخراج التقرير', 'القيمة': new Date().toLocaleString('ar-YE') },
    { 'البيان': 'اسم المستخدم المستخرج', 'القيمة': profile?.full_name ?? '—' },
    { 'البيان': 'الدور الوظيفي', 'القيمة': profile?.role_name ?? '—' },
    { 'البيان': 'فترة التقرير من', 'القيمة': filters.startDate },
    { 'البيان': 'فترة التقرير إلى', 'القيمة': filters.endDate },
    { 'البيان': 'فلتر العملة المحدد', 'القيمة': filters.currency === 'ALL' ? 'كافة العملات' : (filters.currency ?? 'الكل') },
    { 'البيان': '----------------------------------------', 'القيمة': '----------------------------------------' },
    { 'البيان': 'إجمالي المديونية الكلية (معادل ر.ي)', 'القيمة': kpis?.total_debt_yer ?? 0 },
    { 'البيان': 'إجمالي المبالغ المحصلة في الفترة (ر.ي)', 'القيمة': kpis?.total_collected_period_yer ?? 0 },
    { 'البيان': 'نسبة التحصيل العامة (%)', 'القيمة': `${kpis?.team_collection_rate ?? 0}%` },
    { 'البيان': 'عدد العملاء المنتظمين', 'القيمة': kpis?.active_customers_count ?? 0 },
    { 'البيان': 'عدد العملاء المتعثرين', 'القيمة': kpis?.overdue_customers_count ?? 0 },
    { 'البيان': 'عدد العملاء المسددين بالكامل', 'القيمة': kpis?.settled_customers_count ?? 0 },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'المؤشرات العامة');

  // 2. ورقة تفاصيل أعلى 10 عملاء مديونية
  const debtorsRows = (chartsData?.top_10_debtors ?? []).map((d, i) => ({
    'الرتبة': i + 1,
    'رقم العميل': d.customer_number,
    'اسم العميل': d.customer_name,
    'الفئة': d.category_name ?? '—',
    'مسؤول التحصيل': d.assigned_user_name ?? '—',
    'إجمالي المديونية (ر.ي)': d.total_due_yer,
    'نسبة المديونية من الإجمالي (%)': `${d.debt_percentage}%`,
    'حالة السداد': d.status === 'settled' ? 'مسدد' : d.status === 'overdue' ? 'متعثر' : 'منتظم',
  }));
  const wsDebtors = XLSX.utils.json_to_sheet(debtorsRows.length > 0 ? debtorsRows : [{ 'ملاحظة': 'لا توجد بيانات عملاء' }]);
  XLSX.utils.book_append_sheet(wb, wsDebtors, 'أعلى 10 عملاء مديونية');

  // 3. ورقة أداء مسؤولي التحصيل
  const collectorsRows = (chartsData?.collector_performance ?? []).map((c) => ({
    'اسم المحصل': c.collector_name,
    'عدد العملاء المسندين': c.customer_count,
    'إجمالي المستحق (ر.ي)': c.total_due_yer,
    'إجمالي المحصل (ر.ي)': c.total_collected_yer,
    'نسبة الإنجاز والتحصيل (%)': `${c.collection_rate}%`,
  }));
  const wsCollectors = XLSX.utils.json_to_sheet(collectorsRows.length > 0 ? collectorsRows : [{ 'ملاحظة': 'لا توجد بيانات محصلين' }]);
  XLSX.utils.book_append_sheet(wb, wsCollectors, 'أداء مسؤولي التحصيل');

  // 4. ورقة توزيع العملات
  const currencyRows = (chartsData?.debt_by_currency ?? []).map((curr) => ({
    'رمز العملة': curr.currency,
    'اسم العملة': curr.currency_name,
    'المبلغ بالعملة الأصلية': curr.amount_original,
    'المعادل بالريال اليمني': curr.amount_yer,
    'الوزن النسبي في الدين (%)': `${curr.percentage}%`,
  }));
  const wsCurrency = XLSX.utils.json_to_sheet(currencyRows.length > 0 ? currencyRows : [{ 'ملاحظة': 'لا توجد بيانات عملات' }]);
  XLSX.utils.book_append_sheet(wb, wsCurrency, 'توزيع العملات');

  // 5. ورقة توزيع مديونيات الفئات
  const categoryRows = (chartsData?.category_debt ?? []).map((cat) => ({
    'اسم الفئة': cat.category_name,
    'عدد العملاء': cat.customer_count,
    'إجمالي المديونية (ر.ي)': cat.total_debt_yer,
    'النسبة المئوية (%)': `${cat.percentage}%`,
  }));
  const wsCategories = XLSX.utils.json_to_sheet(categoryRows.length > 0 ? categoryRows : [{ 'ملاحظة': 'لا توجد بيانات فئات' }]);
  XLSX.utils.book_append_sheet(wb, wsCategories, 'مديونيات الفئات');

  // اسم الملف مع التواريخ
  const fileName = `تقرير_التحصيل_والتحليل_المالي_${filters.startDate}_إلى_${filters.endDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
