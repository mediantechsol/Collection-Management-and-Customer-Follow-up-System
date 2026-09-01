import { describe, expect, it } from 'vitest';
import { qk } from './queries';
import type { AnalyticsFilters, AnalyticsKPIs, AnalyticsChartsData } from '@/types/models';

describe('qk.analytics keys', () => {
  it('يولّد مفاتيح استعلام ثابتة للملخص والمخططات', () => {
    const filters: AnalyticsFilters = {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      userId: 'user-1',
      categoryId: 'cat-1',
      currency: 'USD',
    };

    expect(qk.analytics.all).toEqual(['analytics']);
    expect(qk.analytics.summary(filters)).toEqual(['analytics', 'summary', filters]);
    expect(qk.analytics.charts(filters)).toEqual(['analytics', 'charts', filters]);
    expect(qk.analytics.summary()).toEqual(['analytics', 'summary', {}]);
  });
});

describe('Analytics Calculations & Schema Validation', () => {
  it('يحسب نسبة التحصيل بدقة ويتفادى القسمة على صفر', () => {
    function calcRate(collected: number, debt: number): number {
      const total = collected + debt;
      if (total <= 0) return 0;
      return Math.round((collected / total) * 10000) / 100;
    }

    expect(calcRate(0, 0)).toBe(0);
    expect(calcRate(25000, 75000)).toBe(25);
    expect(calcRate(50000, 50000)).toBe(50);
    expect(calcRate(100000, 0)).toBe(100);
    expect(calcRate(33333, 66667)).toBe(33.33);
  });

  it('يتطابق مع هيكل بيانات KPIs المعتمد', () => {
    const sampleKpis: AnalyticsKPIs = {
      total_debt_yer: 150000000,
      total_collected_period_yer: 30000000,
      active_customers_count: 120,
      overdue_customers_count: 25,
      settled_customers_count: 15,
      team_collection_rate: 16.67,
    };

    expect(sampleKpis.total_debt_yer).toBeGreaterThan(0);
    expect(sampleKpis.active_customers_count + sampleKpis.overdue_customers_count + sampleKpis.settled_customers_count).toBe(160);
  });

  it('يتطابق مع هيكل المخططات البيانية الـ 6', () => {
    const sampleCharts: AnalyticsChartsData = {
      debt_by_currency: [
        { currency: 'YER', currency_name: 'ريال يمني', amount_original: 50000000, amount_yer: 50000000, percentage: 50 },
        { currency: 'USD', currency_name: 'دولار أمريكي', amount_original: 50000, amount_yer: 26500000, percentage: 26.5 },
        { currency: 'SAR', currency_name: 'ريال سعودي', amount_original: 166666, amount_yer: 23500000, percentage: 23.5 },
      ],
      customers_by_status: [
        { status: 'active', status_label: 'عملاء نشطون', count: 120, percentage: 75 },
        { status: 'overdue', status_label: 'عملاء متعثرون', count: 25, percentage: 15.63 },
        { status: 'settled', status_label: 'عملاء مسددون', count: 15, percentage: 9.38 },
      ],
      collector_performance: [
        {
          user_id: 'u-1',
          collector_name: 'أحمد المحصل',
          total_due_yer: 50000000,
          total_collected_yer: 15000000,
          customer_count: 45,
          collection_rate: 23.08,
        },
      ],
      monthly_collection_trend: [
        {
          month: '2026-01',
          month_label: 'يناير 2026',
          collected_yer: 12000000,
          target_or_due_yer: 100000000,
          collection_rate: 10.71,
        },
      ],
      category_debt: [
        {
          category_id: 'cat-1',
          category_name: 'فئة أ',
          category_color: '#3B82F6',
          total_debt_yer: 80000000,
          customer_count: 50,
          percentage: 80,
        },
      ],
      top_10_debtors: [
        {
          customer_id: 'c-1',
          customer_name: 'شركة الأمل للتجارة',
          customer_number: '1001',
          category_name: 'فئة أ',
          category_color: '#3B82F6',
          assigned_user_name: 'أحمد المحصل',
          total_due_yer: 15000000,
          debt_percentage: 15,
          status: 'overdue',
        },
      ],
    };

    expect(sampleCharts.debt_by_currency.length).toBe(3);
    expect(sampleCharts.customers_by_status.length).toBe(3);
    expect(sampleCharts.collector_performance.length).toBe(1);
    expect(sampleCharts.monthly_collection_trend.length).toBe(1);
    expect(sampleCharts.category_debt.length).toBe(1);
    expect(sampleCharts.top_10_debtors.length).toBe(1);
  });
});
