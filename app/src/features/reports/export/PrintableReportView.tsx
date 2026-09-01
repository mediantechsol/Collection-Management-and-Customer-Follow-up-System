import { fmt } from '@/lib/logic/money';
import type { AnalyticsFilters, AnalyticsKPIs, AnalyticsChartsData } from '@/types/models';
import type { UserProfile } from '@/lib/permissions';

interface Props {
  kpis?: AnalyticsKPIs;
  chartsData?: AnalyticsChartsData;
  filters: AnalyticsFilters;
  profile?: UserProfile | null;
}

export function PrintableReportView({ kpis, chartsData, filters, profile }: Props) {
  const printDate = new Date().toLocaleString('ar-YE', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return (
    <div id="printable-report" className="hidden print:block print:p-6 text-gray-900 bg-white font-sans text-xs">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-report, #printable-report * {
            visibility: visible;
          }
          #printable-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            display: block !important;
          }
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          .page-break-avoid {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      {/* 1. الترويسة الرسمية للتقرير */}
      <div className="border-b-2 border-gray-900 pb-4 mb-4 flex items-center justify-between">
        <div className="text-right">
          <div className="text-base font-extrabold text-gray-900">نظام إدارة التحصيل ومتابعة العملاء</div>
          <div className="text-[11px] text-gray-600 mt-0.5">التقرير التحليلي الدوري للمديونيات ومتابعة التحصيل</div>
        </div>

        <div className="text-center">
          <div className="inline-block border border-gray-800 rounded px-3 py-1 bg-gray-50 text-xs font-bold">
            تقرير رسمي معتمد
          </div>
        </div>

        <div className="text-left text-[11px] text-gray-600 space-y-0.5 mono">
          <div>التاريخ: {printDate}</div>
          <div>المستخرج: {profile?.full_name ?? '—'} ({profile?.role_name ?? '—'})</div>
        </div>
      </div>

      {/* 2. بيانات الفلترة والنطاق الزمني */}
      <div className="bg-gray-50 border border-gray-200 rounded p-2.5 mb-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-gray-500 font-semibold">فترة التقرير: </span>
          <span className="font-bold mono">{filters.startDate} إلى {filters.endDate}</span>
        </div>
        <div>
          <span className="text-gray-500 font-semibold">العملة المحددة: </span>
          <span className="font-bold">{filters.currency === 'ALL' ? 'كافة العملات' : (filters.currency ?? 'الكل')}</span>
        </div>
        <div>
          <span className="text-gray-500 font-semibold">حالة الاستخراج: </span>
          <span className="font-bold text-emerald-800">مكتمل ومحدّث</span>
        </div>
      </div>

      {/* 3. ملخص المؤشرات التلخيصية */}
      <div className="mb-4 page-break-avoid">
        <h3 className="text-xs font-bold text-gray-900 border-r-4 border-blue-600 pr-2 mb-2">
          أولاً: ملخص المؤشرات المالية والتحصيل
        </h3>
        <table className="w-full border-collapse border border-gray-300 text-center text-xs">
          <thead>
            <tr className="bg-gray-100 text-gray-800 font-bold">
              <th className="border border-gray-300 p-2">إجمالي المديونية (ر.ي)</th>
              <th className="border border-gray-300 p-2">المبالغ المحصلة (ر.ي)</th>
              <th className="border border-gray-300 p-2">نسبة التحصيل العامة</th>
              <th className="border border-gray-300 p-2">عملاء منتظمون</th>
              <th className="border border-gray-300 p-2">عملاء متعثرون</th>
              <th className="border border-gray-300 p-2">عملاء مسددون</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold mono">
              <td className="border border-gray-300 p-2 font-bold text-gray-900">{fmt(kpis?.total_debt_yer)} ر.ي</td>
              <td className="border border-gray-300 p-2 font-bold text-emerald-700">{fmt(kpis?.total_collected_period_yer)} ر.ي</td>
              <td className="border border-gray-300 p-2 font-bold text-blue-700">{kpis?.team_collection_rate ?? 0}%</td>
              <td className="border border-gray-300 p-2 text-gray-800">{kpis?.active_customers_count ?? 0}</td>
              <td className="border border-gray-300 p-2 text-red-700">{kpis?.overdue_customers_count ?? 0}</td>
              <td className="border border-gray-300 p-2 text-emerald-700">{kpis?.settled_customers_count ?? 0}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4. جداول مقارنة الأداء وتوزيع العملات */}
      <div className="grid grid-cols-2 gap-4 mb-4 page-break-avoid">
        {/* أداء المحصلين */}
        <div>
          <h3 className="text-xs font-bold text-gray-900 border-r-4 border-emerald-600 pr-2 mb-2">
            ثانياً: أداء مسؤولي التحصيل
          </h3>
          <table className="w-full border-collapse border border-gray-300 text-xs text-right">
            <thead>
              <tr className="bg-gray-100 font-bold">
                <th className="border border-gray-300 p-1.5">المحصل</th>
                <th className="border border-gray-300 p-1.5 text-center">العملاء</th>
                <th className="border border-gray-300 p-1.5 text-left">المستحق (ر.ي)</th>
                <th className="border border-gray-300 p-1.5 text-left">المحصل (ر.ي)</th>
                <th className="border border-gray-300 p-1.5 text-center">الإنجاز</th>
              </tr>
            </thead>
            <tbody>
              {(chartsData?.collector_performance ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-gray-300 p-2 text-center text-gray-400">لا توجد بيانات</td>
                </tr>
              ) : (
                (chartsData?.collector_performance ?? []).map((c) => (
                  <tr key={c.user_id}>
                    <td className="border border-gray-300 p-1.5 font-semibold">{c.collector_name}</td>
                    <td className="border border-gray-300 p-1.5 text-center mono">{c.customer_count}</td>
                    <td className="border border-gray-300 p-1.5 text-left mono">{fmt(c.total_due_yer)}</td>
                    <td className="border border-gray-300 p-1.5 text-left mono font-semibold text-emerald-700">{fmt(c.total_collected_yer)}</td>
                    <td className="border border-gray-300 p-1.5 text-center mono font-bold">{c.collection_rate}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* توزيع العملات */}
        <div>
          <h3 className="text-xs font-bold text-gray-900 border-r-4 border-amber-600 pr-2 mb-2">
            ثالثاً: توزيع المديونيات حسب العملة
          </h3>
          <table className="w-full border-collapse border border-gray-300 text-xs text-right">
            <thead>
              <tr className="bg-gray-100 font-bold">
                <th className="border border-gray-300 p-1.5">العملة</th>
                <th className="border border-gray-300 p-1.5 text-left">المبلغ الأصلي</th>
                <th className="border border-gray-300 p-1.5 text-left">المعادل (ر.ي)</th>
                <th className="border border-gray-300 p-1.5 text-center">النسبة %</th>
              </tr>
            </thead>
            <tbody>
              {(chartsData?.debt_by_currency ?? []).map((curr) => (
                <tr key={curr.currency}>
                  <td className="border border-gray-300 p-1.5 font-semibold">{curr.currency_name}</td>
                  <td className="border border-gray-300 p-1.5 text-left mono">{fmt(curr.amount_original)} {curr.currency}</td>
                  <td className="border border-gray-300 p-1.5 text-left mono font-semibold">{fmt(curr.amount_yer)}</td>
                  <td className="border border-gray-300 p-1.5 text-center mono font-bold">{curr.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. جدول تفاصيل أعلى 10 عملاء مديونية */}
      <div className="mb-6 page-break-avoid">
        <h3 className="text-xs font-bold text-gray-900 border-r-4 border-indigo-600 pr-2 mb-2">
          رابعاً: كشف أعلى 10 عملاء مديونية (التركيز الائتماني)
        </h3>
        <table className="w-full border-collapse border border-gray-300 text-xs text-right">
          <thead>
            <tr className="bg-gray-100 font-bold">
              <th className="border border-gray-300 p-1.5 text-center w-8">#</th>
              <th className="border border-gray-300 p-1.5">العميل</th>
              <th className="border border-gray-300 p-1.5 text-center">رقم العميل</th>
              <th className="border border-gray-300 p-1.5">الفئة</th>
              <th className="border border-gray-300 p-1.5">مسؤول التحصيل</th>
              <th className="border border-gray-300 p-1.5 text-left">المديونية (ر.ي)</th>
              <th className="border border-gray-300 p-1.5 text-center">نسبة الدين</th>
              <th className="border border-gray-300 p-1.5 text-center">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(chartsData?.top_10_debtors ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="border border-gray-300 p-2 text-center text-gray-400">لا توجد بيانات</td>
              </tr>
            ) : (
              (chartsData?.top_10_debtors ?? []).map((d, idx) => (
                <tr key={d.customer_id}>
                  <td className="border border-gray-300 p-1.5 text-center font-bold mono">{idx + 1}</td>
                  <td className="border border-gray-300 p-1.5 font-semibold">{d.customer_name}</td>
                  <td className="border border-gray-300 p-1.5 text-center mono text-gray-600">#{d.customer_number}</td>
                  <td className="border border-gray-300 p-1.5 text-gray-700">{d.category_name ?? '—'}</td>
                  <td className="border border-gray-300 p-1.5 text-gray-700">{d.assigned_user_name ?? '—'}</td>
                  <td className="border border-gray-300 p-1.5 text-left mono font-bold">{fmt(d.total_due_yer)} ر.ي</td>
                  <td className="border border-gray-300 p-1.5 text-center mono">{d.debt_percentage}%</td>
                  <td className="border border-gray-300 p-1.5 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      d.status === 'settled' ? 'bg-green-100 text-green-800' : d.status === 'overdue' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {d.status === 'settled' ? 'مسدد' : d.status === 'overdue' ? 'متعثر' : 'منتظم'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 6. قسم التوقيعات والاعتمادات والختم الرسمي */}
      <div className="border border-gray-300 rounded p-4 bg-gray-50 page-break-avoid">
        <div className="text-xs font-bold text-gray-900 mb-6 text-center border-b border-gray-200 pb-2">
          التوقيعات والاعتمادات الرسمية
        </div>

        <div className="grid grid-cols-4 gap-4 text-center text-xs">
          <div>
            <div className="text-gray-500 font-semibold mb-12">مسؤول التحصيل</div>
            <div className="border-t border-gray-400 pt-1 text-gray-800 font-bold">التوقيع: ....................</div>
          </div>

          <div>
            <div className="text-gray-500 font-semibold mb-12">المحاسب المسؤول</div>
            <div className="border-t border-gray-400 pt-1 text-gray-800 font-bold">التوقيع: ....................</div>
          </div>

          <div>
            <div className="text-gray-500 font-semibold mb-12">مدير النظام / الإدارة</div>
            <div className="border-t border-gray-400 pt-1 text-gray-800 font-bold">الاعتماد: ....................</div>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="h-16 w-24 border-2 border-dashed border-gray-400 rounded flex items-center justify-center text-[11px] text-gray-400">
              موضع الختم الرسمي
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
