import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { IconUpload } from '@/components/ui/Icons';
import {
  useExcelImports,
  useImportBalances,
  useImportCustomers,
  useUserDirectory,
  useUserNames,
} from '@/lib/queries';
import { parseBalancesSheet, type ParseResult } from '@/lib/excel/balances';
import { parseCustomersWorkbook, type CustomersParseResult } from '@/lib/excel/customers';
import { normalizeArabic } from '@/lib/excel/normalize';
import { fmt } from '@/lib/logic/money';

type Mode = 'balances' | 'customers';
type Grid = unknown[][];

/**
 * شاشة الاستيراد — مستوردان.
 *
 * التوثيق المعروض هنا صُحِّح بعد فحص ملف العميل الفعلي: النموذج الأولي كان
 * يخبر المستخدم أن أقسام العملات تبدأ في الصفوف 1 و651 و1041، والصحيح أن
 * رؤوس الأعمدة في الصفوف 11 و652 و1042 (الأرقام القديمة كانت لصفوف العناوين).
 * والأهم: المحلّل لم يعد يعتمد على أرقام صفوف إطلاقاً.
 */
export function ImportScreen() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('balances');

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          className={`btn ${mode === 'balances' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setMode('balances')}
        >
          استيراد الأرصدة
        </button>
        <button
          type="button"
          className={`btn ${mode === 'customers' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setMode('customers')}
        >
          استيراد بيانات العملاء والاستحقاق
        </button>
      </div>

      {mode === 'balances' ? <BalancesImport toastError={toast.error} /> : <CustomersImport />}

      <ImportHistory />
    </>
  );
}

/* ============================================================ استيراد الأرصدة */

function BalancesImport({ toastError }: { toastError: (m: string) => void }) {
  const toast = useToast();
  const importBalances = useImportBalances();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ result: ParseResult; fileName: string } | null>(null);
  const [deriveCollections, setDeriveCollections] = useState(true);

  async function onFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: null,
      }) as Grid;
      setPreview({ result: parseBalancesSheet(grid), fileName: file.name });
    } catch (e) {
      toastError(`تعذّرت قراءة الملف: ${errorMessage(e)}`);
    }
  }

  async function commit() {
    if (!preview?.result.ok) return;
    try {
      const res = await importBalances.mutateAsync({
        fileName: preview.fileName,
        rows: preview.result.rows.map((r) => ({
          customer_number: r.customer_number,
          customer_name: r.customer_name,
          currency: r.currency,
          debit: r.debit,
          credit: r.credit,
        })),
        deriveCollections,
      });
      toast.show(
        `تم استيراد ${res.rows} سجل • عملاء جدد: ${res.new_customers} • دفعات مشتقّة: ${res.collections}`,
      );
      setPreview(null);
    } catch (e) {
      toastError(errorMessage(e));
    }
  }

  return (
    <>
      <h2 className="section-title">اشتراطات بنية ملف الأرصدة</h2>
      <div className="table-wrap px-4 py-4 text-[13px] leading-7">
        <p className="mb-2.5">
          يجب أن يبدأ كل قسم عملة بصف رؤوس أعمدة يحوي هذه الأعمدة الخمسة:
        </p>
        <div className="mono mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12.5px]">
          رقم العميل | اسم العميل | مدين | دائن | ملاحظات
        </div>
        <ul className="list-inside list-disc space-y-1 text-xs text-gray-600">
          <li>
            <b>لا يعتمد النظام على أرقام صفوف ثابتة.</b> يبحث عن صفوف الرؤوس أينما كانت،
            ويتحمّل المسافات الزائدة في العناوين.
          </li>
          <li>
            تُحدَّد العملة من عمود «ملاحظات» في كل صف (ريال يمني / دولار امريكي / ريال سعودي)،
            ثم من عنوان القسم، ثم من ترتيب الأقسام كاحتياط أخير.
          </li>
          <li>
            الملف لقطة تراكمية كاملة: الأرصدة <b>تُستبدل</b> ولا تُضاف، فاستيراد نفس الملف
            مرتين لا يضاعف المديونية.
          </li>
          <li>
            زيادة عمود «دائن» عن الاستيراد السابق تُسجَّل تلقائياً كدفعة محصّلة بانتظار اعتماد المحاسب.
          </li>
        </ul>
      </div>

      <h2 className="section-title">رفع ملف الأرصدة</h2>
      <label
        className="dropzone block"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void onFile(f);
        }}
      >
        <IconUpload className="mx-auto mb-2 h-6 w-6 text-gray-400" />
        اسحب ملف Excel هنا أو اضغط للاختيار
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </label>

      {preview && (
        <Modal
          open
          wide
          title={`معاينة الاستيراد — ${preview.fileName}`}
          onClose={() => setPreview(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setPreview(null)}>
                إلغاء
              </button>
              {preview.result.ok && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void commit()}
                  disabled={importBalances.isPending}
                >
                  {importBalances.isPending
                    ? 'جارٍ الاستيراد…'
                    : `تأكيد الاستيراد (${preview.result.rows.length} صف)`}
                </button>
              )}
            </>
          }
        >
          <ParseMessages ok={preview.result.ok} errors={preview.result.errors} warnings={preview.result.warnings} />

          <div className="mb-3 flex flex-wrap gap-4 text-[13px]">
            <span>يمني: <b>{preview.result.counts.YER}</b></span>
            <span>دولار: <b>{preview.result.counts.USD}</b></span>
            <span>سعودي: <b>{preview.result.counts.SAR}</b></span>
            <span>الإجمالي: <b>{preview.result.rows.length}</b> صف</span>
          </div>

          <div className="mb-3 rounded-md bg-gray-50 p-3 text-xs">
            <p className="mb-1 font-semibold">الأقسام المكتشفة:</p>
            {preview.result.sections.map((s) => (
              <p key={s.headerRow} className="text-gray-600">
                رؤوس الأعمدة في الصف {s.headerRow} ← {s.currency} (حُدِّدت من: {s.source})
              </p>
            ))}
          </div>

          <label className="mb-3 flex items-start gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={deriveCollections}
              onChange={(e) => setDeriveCollections(e.target.checked)}
            />
            <span>
              اشتقاق الدفعات المحصّلة من زيادة الجانب الدائن.
              <br />
              <span className="text-gray-500">
                أزل هذا الخيار في <b>أول استيراد ترحيلي</b> فقط، حتى لا تُحسب الأرصدة الدائنة
                التاريخية كتحصيل جديد.
              </span>
            </span>
          </label>

          {preview.result.rows.length > 0 && (
            <div className="table-wrap max-h-56 overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>رقم العميل</th>
                    <th>الاسم</th>
                    <th>العملة</th>
                    <th>مدين</th>
                    <th>دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.result.rows.slice(0, 10).map((r) => (
                    <tr key={`${r.customer_number}-${r.currency}-${r.source_row}`}>
                      <td className="mono">{r.customer_number}</td>
                      <td>{r.customer_name}</td>
                      <td>{r.currency}</td>
                      <td className="mono">{fmt(r.debit)}</td>
                      <td className="mono">{fmt(r.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-gray-500">
            تُعرض أول 10 صفوف من {preview.result.rows.length}
          </p>
        </Modal>
      )}
    </>
  );
}

/* ============================================================ استيراد بيانات العملاء */

function CustomersImport() {
  const toast = useToast();
  const importCustomers = useImportCustomers();
  const { data: directory = [] } = useUserDirectory();
  const [preview, setPreview] = useState<{ result: CustomersParseResult; fileName: string } | null>(
    null,
  );

  /** يبحث عن الشيت باسمه بغضّ النظر عن المسافات وأشكال الحروف. */
  function findSheet(wb: XLSX.WorkBook, name: string): Grid | undefined {
    const target = normalizeArabic(name);
    const match = wb.SheetNames.find((n) => normalizeArabic(n) === target);
    if (!match) return undefined;
    return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[match], {
      header: 1,
      raw: true,
      defval: null,
    }) as Grid;
  }

  async function onFile(file: File) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const result = parseCustomersWorkbook({
        profiles: findSheet(wb, 'بيانات العملاء'),
        followups: findSheet(wb, 'متابعة العملاء'),
      });
      setPreview({ result, fileName: file.name });
    } catch (e) {
      toast.error(`تعذّرت قراءة الملف: ${errorMessage(e)}`);
    }
  }

  async function commit() {
    if (!preview?.result.ok) return;
    try {
      const res = await importCustomers.mutateAsync({
        fileName: preview.fileName,
        rows: preview.result.rows,
      });
      toast.show(
        `تم استيراد ${res.rows} عميل • جدد: ${res.new_customers} • تواريخ استحقاق: ${res.due_dates}`,
      );
      if (res.unmatched_assignees?.length) {
        toast.error(`مسؤولون لم يُطابَقوا: ${res.unmatched_assignees.join('، ')}`);
      }
      setPreview(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const knownNames = new Set(directory.flatMap((u) => [u.full_name, u.username]));

  return (
    <>
      <h2 className="section-title">استيراد بيانات العملاء وتواريخ الاستحقاق</h2>
      <div className="table-wrap px-4 py-4 text-[13px] leading-7">
        <p className="mb-2">
          ارفع ملف <b>«متابعه العملاء»</b> (بصيغة .xlsm أو .xlsx). يقرأ النظام منه شيتين:
        </p>
        <ul className="list-inside list-disc space-y-1 text-xs text-gray-600">
          <li>
            <b>بيانات العملاء</b>: رقم العميل، الاسم، الجوال 1 و2، الضامن/الضمانة، الحالة.
          </li>
          <li>
            <b>متابعة العملاء</b>: تاريخ الاستحقاق، المهل الثلاث، مسؤول متابعة التحصيل، الملاحظات.
          </li>
          <li>
            يُدمج الشيتان على رقم العميل بعد تطبيعه، لأن الأول يكتبه «00001» والثاني يكتبه 1.
          </li>
          <li>
            الحقول الفارغة في الملف <b>لا تمسح</b> القيم الموجودة في النظام.
          </li>
        </ul>
      </div>

      <label
        className="dropzone block"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void onFile(f);
        }}
      >
        <IconUpload className="mx-auto mb-2 h-6 w-6 text-gray-400" />
        اسحب ملف متابعة العملاء هنا أو اضغط للاختيار
        <input
          type="file"
          accept=".xlsx,.xls,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </label>

      {preview && (
        <Modal
          open
          wide
          title={`معاينة الاستيراد — ${preview.fileName}`}
          onClose={() => setPreview(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setPreview(null)}>
                إلغاء
              </button>
              {preview.result.ok && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void commit()}
                  disabled={importCustomers.isPending}
                >
                  {importCustomers.isPending
                    ? 'جارٍ الاستيراد…'
                    : `تأكيد الاستيراد (${preview.result.rows.length} عميل)`}
                </button>
              )}
            </>
          }
        >
          <ParseMessages
            ok={preview.result.ok}
            errors={preview.result.errors}
            warnings={preview.result.warnings}
          />

          <div className="mb-3 flex flex-wrap gap-4 text-[13px]">
            <span>من شيت البيانات: <b>{preview.result.stats.fromProfiles}</b></span>
            <span>من شيت المتابعة: <b>{preview.result.stats.fromFollowups}</b></span>
            <span>مدموجون: <b>{preview.result.stats.merged}</b></span>
            <span>بتاريخ استحقاق: <b>{preview.result.stats.withDueDate}</b></span>
          </div>

          {preview.result.assignees.length > 0 && (
            <div className="mb-3 rounded-md bg-gray-50 p-3 text-xs">
              <p className="mb-1.5 font-semibold">مسؤولو التحصيل في الملف:</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.result.assignees.map((a) => (
                  <Pill key={a} tone={knownNames.has(a) ? 'green' : 'amber'}>
                    {a} {knownNames.has(a) ? '✓' : '— لا يوجد مستخدم بهذا الاسم'}
                  </Pill>
                ))}
              </div>
              <p className="mt-2 text-gray-500">
                الأسماء غير المطابقة لن تُربط بأي مستخدم. أنشئ لهم حسابات بنفس الاسم الكامل من شاشة
                «المستخدمون» ثم أعد الاستيراد لربط عملائهم.
              </p>
            </div>
          )}

          <div className="table-wrap max-h-56 overflow-y-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم العميل</th>
                  <th>الاسم</th>
                  <th>المسؤول</th>
                  <th>الاستحقاق</th>
                  <th>المهل</th>
                </tr>
              </thead>
              <tbody>
                {preview.result.rows.slice(0, 10).map((r) => (
                  <tr key={r.customer_number}>
                    <td className="mono">{r.customer_number}</td>
                    <td>{r.customer_name}</td>
                    <td>{r.assigned_name ?? '—'}</td>
                    <td className="mono">{r.due_date ?? '—'}</td>
                    <td className="mono">
                      {r.grace_1}/{r.grace_2}/{r.grace_3}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">
            تُعرض أول 10 صفوف من {preview.result.rows.length}
          </p>
        </Modal>
      )}
    </>
  );
}

/* ============================================================ مشترك */

function ParseMessages({
  ok,
  errors,
  warnings,
}: {
  ok: boolean;
  errors: string[];
  warnings: string[];
}) {
  return (
    <>
      <div className="mb-2.5">
        {ok ? (
          <Pill tone="green">الملف مقروء ومطابق للبنية المطلوبة</Pill>
        ) : (
          <Pill tone="red">يوجد أخطاء — لا يمكن الاستيراد</Pill>
        )}
      </div>
      {errors.length > 0 && (
        <div className="mb-2.5 rounded-md bg-red-50 p-2.5 text-xs text-red-500">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-2.5 rounded-md bg-amber-50 p-2.5 text-xs text-amber-500">
          {warnings.slice(0, 8).map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          {warnings.length > 8 && <p>+ {warnings.length - 8} تحذير إضافي</p>}
        </div>
      )}
    </>
  );
}

function ImportHistory() {
  const { data: imports = [] } = useExcelImports();
  const userNames = useUserNames();

  return (
    <>
      <h2 className="section-title">سجل عمليات الاستيراد</h2>
      <div className="table-wrap">
        {imports.length === 0 ? (
          <div className="empty-state">لا توجد عمليات استيراد بعد</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الملف</th>
                  <th>النوع</th>
                  <th>الصفوف</th>
                  <th>بواسطة</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td>{i.file_name}</td>
                    <td>{i.file_type === 'balances' ? 'أرصدة' : 'بيانات عملاء'}</td>
                    <td className="mono">{i.rows_count}</td>
                    <td>{i.imported_by ? userNames.get(i.imported_by) ?? '—' : '—'}</td>
                    <td className="mono whitespace-nowrap text-xs">
                      {new Date(i.import_date).toLocaleString('ar-EG')}
                    </td>
                    <td>
                      <Pill
                        tone={i.status === 'نجاح' ? 'green' : i.status === 'تحذير' ? 'amber' : 'red'}
                      >
                        {i.status}
                      </Pill>
                    </td>
                    <td className="text-xs text-gray-600">{i.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
