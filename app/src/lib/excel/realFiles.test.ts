/**
 * اختبار تكامل على ملفات العميل الحقيقية.
 *
 * الملفات في مجلد "المصادر/" خارج المستودع (مستثناة في .gitignore لأنها تحوي
 * بيانات عملاء حقيقية)، لذلك يتخطّى هذا الملف نفسه تلقائياً إن لم تكن موجودة،
 * ولا يكسر البناء على أي جهاز آخر.
 *
 * قيمته: يثبت أن المحلّلين يعملان على الملف الفعلي بكل أخطائه الإملائية
 * ومسافاته الزائدة وتطويله — وهذا ما فشل فيه النموذج الأولي.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseBalancesSheet } from './balances';
import { parseCustomersWorkbook } from './customers';

const SOURCES = join(process.cwd(), '..', 'المصادر');
const BALANCES_FILE = join(SOURCES, 'ارصدة العملاء ايمن.xlsx');
const FOLLOWUP_FILE = join(SOURCES, 'متابعه العملاء.xlsm');

function sheetGrid(path: string, sheetName: string): unknown[][] {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`الشيت غير موجود: ${sheetName} (المتاح: ${wb.SheetNames.join(', ')})`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
}

describe.skipIf(!existsSync(BALANCES_FILE))('ملف الأرصدة الحقيقي', () => {
  it('يقرأ الأقسام الثلاثة ويحدّد عملاتها من عمود الملاحظات', () => {
    const grid = sheetGrid(BALANCES_FILE, 'ارصدة العملاء');
    const r = parseBalancesSheet(grid);

    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.sections).toHaveLength(3);

    // رؤوس الأقسام في الصفوف 11 / 652 / 1042 — وليس 1/651/1041 كما كان
    // مكتوباً في توثيق النموذج الأولي
    expect(r.sections.map((s) => s.headerRow)).toEqual([11, 652, 1042]);
    expect(r.sections.map((s) => s.currency)).toEqual(['YER', 'USD', 'SAR']);
    expect(r.sections.every((s) => s.source === 'ملاحظات')).toBe(true);
  });

  it('يستخرج صفوف البيانات الفعلية بأرقام عملاء مطبَّعة', () => {
    const r = parseBalancesSheet(sheetGrid(BALANCES_FILE, 'ارصدة العملاء'));

    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.customer_number).toMatch(/^\d+$/);
      expect(row.customer_name.length).toBeGreaterThan(0);
      expect(['YER', 'USD', 'SAR']).toContain(row.currency);
    }
  });
});

describe.skipIf(!existsSync(FOLLOWUP_FILE))('ملف متابعة العملاء الحقيقي', () => {
  it('يقرأ الشيتين ويدمجهما على رقم العميل المطبَّع', () => {
    const result = parseCustomersWorkbook({
      profiles: sheetGrid(FOLLOWUP_FILE, 'بيانات العملاء'),
      followups: sheetGrid(FOLLOWUP_FILE, 'متابعة العملاء'),
    });

    expect(result.ok).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);

    // شيت البيانات يكتب الرقم '00001' وشيت المتابعة يكتبه 1 — الدمج يعتمد
    // على التطبيع، فبدونه لن يتطابق أي عميل بين الشيتين
    expect(result.stats.merged).toBeGreaterThan(0);
  });

  it('يستخرج أسماء مسؤولي التحصيل الحقيقيين', () => {
    const result = parseCustomersWorkbook({
      followups: sheetGrid(FOLLOWUP_FILE, 'متابعة العملاء'),
    });
    // الأسماء الواردة فعلياً في عمود "مسئول متابعة التحصيل"
    expect(result.assignees.length).toBeGreaterThan(0);
    expect(result.assignees).toContain('ايمن');
  });

  it('يقرأ تواريخ الاستحقاق بصيغة ISO بلا انزياح يوم', () => {
    const result = parseCustomersWorkbook({
      followups: sheetGrid(FOLLOWUP_FILE, 'متابعة العملاء'),
    });
    const withDates = result.rows.filter((r) => r.due_date);
    expect(withDates.length).toBeGreaterThan(0);
    for (const r of withDates) {
      expect(r.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
