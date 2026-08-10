/**
 * جدول متجاوب: جدول حقيقي على الشاشات المتوسطة فما فوق، وبطاقات على الجوال.
 *
 * العميل اشترط أن يعمل النظام على الكمبيوتر والآيفون والأندرويد، وجداول
 * النظام تصل إلى 10 أعمدة — وهي غير قابلة للقراءة على شاشة جوال مهما تمرّرت
 * أفقياً. لذلك يتحوّل كل صف إلى بطاقة "عنوان الحقل: القيمة".
 */

import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** لا يظهر كسطر مستقل في بطاقة الجوال (يُدمج في العنوان مثلاً). */
  hideOnCard?: boolean;
  align?: 'start' | 'end';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  /** عنوان البطاقة على الجوال — عادةً اسم العميل. */
  cardTitle?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => ReactNode;
  empty?: string;
  loading?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  cardTitle,
  onRowClick,
  actions,
  empty = 'لا توجد بيانات',
  loading = false,
}: Props<T>) {
  if (loading) {
    return (
      <div className="table-wrap">
        <div className="empty-state">جارٍ التحميل…</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="table-wrap">
        <div className="empty-state">{empty}</div>
      </div>
    );
  }

  return (
    <>
      {/* ---------------------------------------------------- شاشات كبيرة */}
      <div className="table-wrap hidden md:block">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                {actions && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={keyOf(row)}
                  className={onRowClick ? 'row-click' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === 'end' ? 'text-left' : undefined}>
                      {c.render(row)}
                    </td>
                  ))}
                  {actions && (
                    <td onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
                      <div className="flex gap-1.5">{actions(row)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------------------------------- الجوال */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {rows.map((row) => (
          <div key={keyOf(row)} className="card p-3.5">
            {cardTitle && (
              <button
                type="button"
                className="mb-2 block w-full text-right text-[14px] font-bold text-gray-900"
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {cardTitle(row)}
              </button>
            )}
            <div className="flex flex-col gap-1">
              {columns
                .filter((c) => !c.hideOnCard)
                .map((c) => (
                  <div key={c.key} className="info-row">
                    <span className="k">{c.label}</span>
                    <span className="v">{c.render(row)}</span>
                  </div>
                ))}
            </div>
            {actions && <div className="mt-2.5 flex flex-wrap gap-1.5">{actions(row)}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
