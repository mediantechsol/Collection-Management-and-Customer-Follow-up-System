import { fmt } from '@/lib/logic/money';
import type { AnalyticsFilters, AnalyticsKPIs, AnalyticsChartsData } from '@/types/models';
import type { UserProfile } from '@/lib/permissions';

interface PrintParams {
  kpis?: AnalyticsKPIs;
  chartsData?: AnalyticsChartsData;
  filters: AnalyticsFilters;
  profile?: UserProfile | null;
}

export function printAnalyticsReportToPdf({ kpis, chartsData, filters, profile }: PrintParams) {
  const printDate = new Date().toLocaleString('ar-YE', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  // إنشاء إطار طباعة منعزل ونظيف تماماً لتجنب أي صفحات بيضاء فارغة
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const debtors = chartsData?.top_10_debtors ?? [];
  const collectors = chartsData?.collector_performance ?? [];
  const currencies = chartsData?.debt_by_currency ?? [];

  const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>تقرير التحصيل والتحليل المالي - ${filters.startDate} إلى ${filters.endDate}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #111827;
      background: #ffffff;
      padding: 10px;
    }
    .mono {
      font-family: monospace;
      direction: ltr;
      display: inline-block;
    }
    .header {
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge {
      border: 1px solid #374151;
      padding: 3px 8px;
      border-radius: 4px;
      background: #f9fafb;
      font-weight: bold;
      font-size: 10.5px;
    }
    .filters-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
    }
    .section-title {
      font-size: 11.5px;
      font-weight: bold;
      color: #111827;
      border-right: 4px solid #2563eb;
      padding-right: 6px;
      margin-bottom: 6px;
      margin-top: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 10.5px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 5px 6px;
      text-align: right;
    }
    th {
      background: #f3f4f6;
      font-weight: bold;
      color: #374151;
    }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .font-bold { font-weight: bold; }
    .page-break-avoid {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signatures {
      border: 1px solid #d1d5db;
      background: #f9fafb;
      border-radius: 6px;
      padding: 10px;
      margin-top: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 100px;
      gap: 10px;
      text-align: center;
      margin-top: 8px;
    }
    .sig-space {
      margin-bottom: 30px;
      color: #6b7280;
      font-weight: 600;
    }
    .stamp-box {
      height: 55px;
      border: 2px dashed #9ca3af;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9.5px;
      color: #6b7280;
    }
    .pill {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 9999px;
      font-size: 9.5px;
      font-weight: bold;
    }
    .pill-green { background: #dcfce7; color: #166534; }
    .pill-red { background: #fee2e2; color: #991b1b; }
    .pill-blue { background: #dbeafe; color: #1e40af; }
  </style>
</head>
<body>
  <!-- الترويسة -->
  <div class="header">
    <div>
      <div style="font-size: 14px; font-weight: 800;">نظام إدارة التحصيل ومتابعة العملاء</div>
      <div style="font-size: 10.5px; color: #4b5563;">التقرير التحليلي الشامل للمديونيات ومتابعة التحصيل</div>
    </div>
    <div>
      <span class="badge">تقرير رسمي معتمد</span>
    </div>
    <div style="text-align: left; font-size: 10px; color: #4b5563;">
      <div>التاريخ: ${printDate}</div>
      <div>المستخرج: ${profile?.full_name ?? '—'} (${profile?.role_name ?? '—'})</div>
    </div>
  </div>

  <!-- بيانات الفلترة -->
  <div class="filters-box">
    <div><strong>فترة التقرير:</strong> <span class="mono">${filters.startDate} إلى ${filters.endDate}</span></div>
    <div><strong>العملة المحددة:</strong> ${filters.currency === 'ALL' ? 'كافة العملات' : (filters.currency ?? 'الكل')}</div>
    <div><strong>حالة الاستخراج:</strong> <span style="color: #047857; font-weight: bold;">مكتمل ومحدّث</span></div>
  </div>

  <!-- 1. ملخص المؤشرات -->
  <div class="page-break-avoid">
    <div class="section-title" style="border-right-color: #2563eb;">أولاً: ملخص المؤشرات المالية والتحصيل</div>
    <table>
      <thead>
        <tr>
          <th class="text-center">إجمالي المديونية (ر.ي)</th>
          <th class="text-center">المبالغ المحصلة (ر.ي)</th>
          <th class="text-center">نسبة التحصيل العامة</th>
          <th class="text-center">عملاء منتظمون</th>
          <th class="text-center">عملاء متعثرون</th>
          <th class="text-center">عملاء مسددون</th>
        </tr>
      </thead>
      <tbody>
        <tr style="text-align: center; font-weight: 600;">
          <td class="font-bold"><span class="mono">${fmt(kpis?.total_debt_yer)}</span> ر.ي</td>
          <td class="font-bold" style="color: #047857;"><span class="mono">${fmt(kpis?.total_collected_period_yer)}</span> ر.ي</td>
          <td class="font-bold" style="color: #2563eb;"><span class="mono">${kpis?.team_collection_rate ?? 0}%</span></td>
          <td><span class="mono">${kpis?.active_customers_count ?? 0}</span></td>
          <td style="color: #dc2626;"><span class="mono">${kpis?.overdue_customers_count ?? 0}</span></td>
          <td style="color: #047857;"><span class="mono">${kpis?.settled_customers_count ?? 0}</span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 2. أداء المحصلين والعملات -->
  <div class="page-break-avoid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
    <div>
      <div class="section-title" style="border-right-color: #059669;">ثانياً: أداء مسؤولي التحصيل</div>
      <table>
        <thead>
          <tr>
            <th>المحصل</th>
            <th class="text-center">العملاء</th>
            <th class="text-left">المستحق (ر.ي)</th>
            <th class="text-left">المحصل (ر.ي)</th>
            <th class="text-center">الإنجاز</th>
          </tr>
        </thead>
        <tbody>
          ${collectors.length === 0 ? '<tr><td colspan="5" class="text-center" style="color: #9ca3af;">لا توجد بيانات</td></tr>' :
            collectors.map(c => `
              <tr>
                <td class="font-bold">${c.collector_name}</td>
                <td class="text-center mono">${c.customer_count}</td>
                <td class="text-left mono">${fmt(c.total_due_yer)}</td>
                <td class="text-left mono font-bold" style="color: #047857;">${fmt(c.total_collected_yer)}</td>
                <td class="text-center mono font-bold">${c.collection_rate}%</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>

    <div>
      <div class="section-title" style="border-right-color: #d97706;">ثالثاً: توزيع المديونيات حسب العملة</div>
      <table>
        <thead>
          <tr>
            <th>العملة</th>
            <th class="text-left">المبلغ الأصلي</th>
            <th class="text-left">المعادل (ر.ي)</th>
            <th class="text-center">النسبة %</th>
          </tr>
        </thead>
        <tbody>
          ${currencies.length === 0 ? '<tr><td colspan="4" class="text-center" style="color: #9ca3af;">لا توجد بيانات</td></tr>' :
            currencies.map(curr => `
              <tr>
                <td class="font-bold">${curr.currency_name}</td>
                <td class="text-left mono">${fmt(curr.amount_original)} ${curr.currency}</td>
                <td class="text-left mono font-bold">${fmt(curr.amount_yer)}</td>
                <td class="text-center mono font-bold">${curr.percentage}%</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- 3. أعلى 10 عملاء مديونية -->
  <div class="page-break-avoid">
    <div class="section-title" style="border-right-color: #4f46e5;">رابعاً: كشف أعلى 10 عملاء مديونية (التركيز الائتماني)</div>
    <table>
      <thead>
        <tr>
          <th class="text-center" style="width: 25px;">#</th>
          <th>العميل</th>
          <th class="text-center">رقم العميل</th>
          <th>الفئة</th>
          <th>مسؤول التحصيل</th>
          <th class="text-left">المديونية (ر.ي)</th>
          <th class="text-center">نسبة الدين</th>
          <th class="text-center">الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${debtors.length === 0 ? '<tr><td colspan="8" class="text-center" style="color: #9ca3af;">لا توجد بيانات عملاء مديونية</td></tr>' :
          debtors.map((d, idx) => `
            <tr>
              <td class="text-center mono font-bold">${idx + 1}</td>
              <td class="font-bold">${d.customer_name}</td>
              <td class="text-center mono" style="color: #6b7280;">#${d.customer_number}</td>
              <td>${d.category_name ?? '—'}</td>
              <td>${d.assigned_user_name ?? '—'}</td>
              <td class="text-left mono font-bold">${fmt(d.total_due_yer)} ر.ي</td>
              <td class="text-center mono">${d.debt_percentage}%</td>
              <td class="text-center">
                <span class="pill ${d.status === 'settled' ? 'pill-green' : d.status === 'overdue' ? 'pill-red' : 'pill-blue'}">
                  ${d.status === 'settled' ? 'مسدد' : d.status === 'overdue' ? 'متعثر' : 'منتظم'}
                </span>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table>
  </div>

  <!-- 4. الاعتمادات والتوقيعات والختم -->
  <div class="signatures">
    <div style="font-weight: bold; text-align: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 6px;">
      التوقيعات والاعتمادات الرسمية
    </div>
    <div class="sig-grid">
      <div>
        <div class="sig-space">مسؤول التحصيل</div>
        <div style="border-top: 1px solid #9ca3af; padding-top: 2px;">التوقيع: ....................</div>
      </div>
      <div>
        <div class="sig-space">المحاسب المسؤول</div>
        <div style="border-top: 1px solid #9ca3af; padding-top: 2px;">التوقيع: ....................</div>
      </div>
      <div>
        <div class="sig-space">مدير النظام / الإدارة</div>
        <div style="border-top: 1px solid #9ca3af; padding-top: 2px;">الاعتماد: ....................</div>
      </div>
      <div>
        <div class="stamp-box">موضع الختم الرسمي</div>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // الانتظار حتى اكتمال تحميل المحتوى ثم استدعاء الطباعة
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 250);
}
