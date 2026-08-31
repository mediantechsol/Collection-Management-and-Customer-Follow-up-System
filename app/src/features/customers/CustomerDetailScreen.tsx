import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProfile } from '@/features/auth/AuthContext';
import {
  useCollections,
  useCustomer,
  useEscalateCustomer,
  useFollowups,
  useNotifications,
  useSettings,
  useUserNames,
} from '@/lib/queries';
import { CustomerModal } from './CustomerModal';
import { FollowupModal } from '@/features/followups/FollowupModal';
import { CollectionModal } from '@/features/collections/CollectionModal';
import { CategoryDot, DuePill, NotificationPill, Pill } from '@/components/ui/Pill';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { classifyDue } from '@/lib/logic/dates';
import { CURRENCY_LABELS, fmt } from '@/lib/logic/money';
import { isCollector, screenAction } from '@/lib/permissions';
import {
  downloadAttachment,
  getSignedAttachmentUrl,
  isImageFile,
  isPdfFile,
} from '@/lib/storage';

/**
 * ملف العميل الكامل — كما طلبه صاحب المشروع حرفياً: البيانات الشخصية، أرقام
 * التواصل، الضمانات، الأرصدة المستحقة بكل عملة، تفاصيل المديونية، مسؤول
 * التحصيل، وسجل تاريخي لكل المتابعات السابقة مع المرفقات والمستندات.
 */
export function CustomerDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profile = useProfile();
  const toast = useToast();

  const { data: customer, isLoading, isError } = useCustomer(id);
  const { data: followups = [] } = useFollowups(id);
  const { data: notifications = [] } = useNotifications();
  const { data: collections = [] } = useCollections();
  const { data: settings } = useSettings();
  const userNames = useUserNames();
  const escalate = useEscalateCustomer();

  const [editOpen, setEditOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);

  // حالة معاينة الصور المرفقة
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);

  if (isLoading) return <div className="empty-state">جارٍ التحميل…</div>;

  // RLS تُرجع صفراً من الصفوف لعميل خارج نطاق المستخدم — فالنتيجة الفارغة
  // هنا تعني إما عدم وجوده أو عدم أحقية رؤيته، ولا نفرّق بينهما للمستخدم.
  if (isError || !customer) {
    return (
      <div className="empty-state">
        العميل غير موجود، أو لا تملك صلاحية مشاهدته (خارج نطاق العملاء أو الفئات المسموحة لك).
      </div>
    );
  }

  const notifSettings = {
    daysBeforeDueAlert: settings?.days_before_due_alert ?? 3,
    noFollowupDaysLimit: settings?.no_followup_days_limit ?? 14,
  };

  const customerNotifs = notifications.filter((n) => n.customer_id === customer.id);
  const customerCollections = collections.filter((c) => c.customer_id === customer.id);
  const totalCollected = customerCollections
    .filter((c) => c.confirmed_at)
    .reduce((s, c) => s + c.amount_yer, 0);

  const canEdit = screenAction(profile, 'customers', 'edit');
  const canAddFollowup = screenAction(profile, 'followups', 'create');
  const canAddCollection = screenAction(profile, 'collections', 'create');

  async function onEscalate() {
    try {
      await escalate.mutateAsync({ customerId: customer!.id });
      toast.show('تم رفع الحالة للمدير');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function handleOpenAttachment(followupId: string, path: string, name?: string | null) {
    try {
      setLoadingAttachmentId(followupId);
      const url = await getSignedAttachmentUrl(path);
      const fileName = name || path.split('/').pop() || 'مرفق';

      if (isImageFile(fileName) || isImageFile(path)) {
        setPreviewImage({ url, title: fileName });
      } else {
        // فتح ملف PDF في تبويب جديد
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingAttachmentId(null);
    }
  }

  async function handleDownloadAttachment(followupId: string, path: string, name?: string | null) {
    try {
      setLoadingAttachmentId(followupId);
      await downloadAttachment(path, name || undefined);
      toast.show('تم بدء تحميل الملف');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingAttachmentId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className="mb-3.5 text-[13px] font-semibold text-blue-600"
        onClick={() => navigate('/customers')}
      >
        → رجوع للعملاء
      </button>

      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{customer.customer_name}</h2>
            <p className="mono mt-0.5 text-xs text-gray-500">
              رقم العميل: {customer.customer_number}
            </p>
            {customer.category_name && (
              <p className="mt-1.5 text-xs text-gray-600">
                <CategoryDot color={customer.category_color} />
                {customer.category_name}
              </p>
            )}
          </div>
          <div className="text-start sm:text-end">
            <p className="text-[11px] text-gray-500">إجمالي المستحق بالريال</p>
            <p className="mono text-[22px] font-bold text-blue-700">{fmt(customer.total_due_yer)}</p>
            {totalCollected > 0 && (
              <p className="mono mt-1 text-[11px] text-green-500">
                محصَّل معتمد: {fmt(totalCollected)}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------- العمود الأيمن */}
        <div className="lg:col-span-2">
          <h3 className="section-title">بيانات العميل</h3>
          <div className="table-wrap px-4 py-3.5">
            <InfoRow label="الجوال 1" value={customer.mobile_1} tel />
            <InfoRow label="الجوال 2" value={customer.mobile_2} tel />
            <InfoRow label="الضامن / الضمانة" value={customer.guarantor} />
            <InfoRow label="الحالة" value={customer.status_customer} />
            <InfoRow label="فئة العميل" value={customer.category_name} />
            <InfoRow
              label="مسؤول المتابعة"
              value={customer.assigned_user_id ? userNames.get(customer.assigned_user_id) ?? null : null}
            />
            <InfoRow label="وصف العميل" value={customer.description} />
          </div>

          <h3 className="section-title">الأرصدة حسب العملة</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>العملة</th>
                  <th>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{CURRENCY_LABELS.USD}</td>
                  <td className="mono">{fmt(customer.usd)}</td>
                </tr>
                <tr>
                  <td>{CURRENCY_LABELS.SAR}</td>
                  <td className="mono">{fmt(customer.sar)}</td>
                </tr>
                <tr>
                  <td>{CURRENCY_LABELS.YER}</td>
                  <td className="mono">{fmt(customer.yer)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="section-title">سجل المتابعات ({followups.length})</h3>
          <div className="table-wrap">
            {followups.length === 0 ? (
              <div className="empty-state">لا توجد متابعات مسجّلة</div>
            ) : (
              followups.map((f) => {
                const hasAttachment = Boolean(f.attachment_url);
                const isLoadingThis = loadingAttachmentId === f.id;
                const attachName = f.attachment_name || 'مرفق المتابعة';
                const isImg = isImageFile(attachName) || (f.attachment_url ? isImageFile(f.attachment_url) : false);
                const isPdf = isPdfFile(attachName) || (f.attachment_url ? isPdfFile(f.attachment_url) : false);

                return (
                  <div key={f.id} className="border-b border-gray-100 px-3.5 py-3 last:border-b-0">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-[13px] font-semibold">
                        {f.type_followup} — {userNames.get(f.user_id) ?? '—'}
                      </span>
                      <span className="mono text-xs text-gray-500">
                        {f.followup_date} {f.followup_time?.slice(0, 5) ?? ''}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-gray-700">{f.contact_result || '—'}</p>
                    {f.details && <p className="mt-0.5 text-xs text-gray-500">{f.details}</p>}

                    {/* عرض المرفق في السطر إن وُجد */}
                    {hasAttachment && f.attachment_url && (
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs dark:border-blue-900/40 dark:bg-blue-950/20">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-base">{isImg ? '🖼️' : isPdf ? '📄' : '📎'}</span>
                          <span className="truncate font-medium text-blue-900 dark:text-blue-200">
                            {attachName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleOpenAttachment(f.id, f.attachment_url!, f.attachment_name)}
                            disabled={isLoadingThis}
                            className="btn btn-outline py-0.5 px-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50"
                          >
                            {isLoadingThis ? 'جارٍ التحميل…' : isImg ? 'معاينة الصورة' : 'فتح المستند'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownloadAttachment(f.id, f.attachment_url!, f.attachment_name)}
                            disabled={isLoadingThis}
                            className="btn btn-outline py-0.5 px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-zinc-700"
                            title="تحميل الملف إلى الجهاز"
                          >
                            تحميل ⬇
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
                      {f.next_followup_date && <span>الموعد القادم: {f.next_followup_date}</span>}
                      {f.level_seriousness && <span>الجدية: {f.level_seriousness}</span>}
                      {f.expected_collection_amount > 0 && (
                        <span>متوقع تحصيله: {fmt(f.expected_collection_amount)}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <h3 className="section-title">الدفعات المحصّلة ({customerCollections.length})</h3>
          <div className="table-wrap">
            {customerCollections.length === 0 ? (
              <div className="empty-state">لا توجد دفعات مسجّلة</div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>المبلغ</th>
                      <th>بالريال</th>
                      <th>المصدر</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerCollections.map((c) => (
                      <tr key={c.id}>
                        <td className="mono">{c.collected_date}</td>
                        <td className="mono">
                          {fmt(c.amount)} {c.currency}
                        </td>
                        <td className="mono">{fmt(c.amount_yer)}</td>
                        <td>{c.source === 'import' ? 'استيراد' : 'يدوي'}</td>
                        <td>
                          {c.confirmed_at ? (
                            <Pill tone="green">معتمدة</Pill>
                          ) : (
                            <Pill tone="amber">بانتظار الاعتماد</Pill>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------- العمود الأيسر */}
        <div>
          <h3 className="section-title">الاستحقاق</h3>
          <div className="table-wrap px-4 py-3.5">
            {customer.due_date ? (
              <>
                <InfoRow label="تاريخ الاستحقاق" value={customer.due_date} mono />
                <InfoRow label="المهل (1/2/3)" value={`${customer.grace_1 ?? 0} / ${customer.grace_2 ?? 0} / ${customer.grace_3 ?? 0}`} mono />
                <InfoRow label="تاريخ الاستحقاق الجديد" value={customer.new_due_date} mono />
                <div className="info-row">
                  <span className="k">الأيام المتبقية</span>
                  <span className="v">
                    <span
                      className={`mono ${(customer.remaining_days ?? 0) < 0 ? 'text-red-500' : ''}`}
                    >
                      {customer.remaining_days ?? '—'}
                    </span>
                  </span>
                </div>
                <div className="info-row">
                  <span className="k">الحالة</span>
                  <span className="v">
                    <DuePill
                      status={classifyDue(customer.remaining_days, {
                        daysBeforeDueAlert: settings?.days_before_due_alert ?? 3,
                        overdueAlertDays: settings?.overdue_alert_days ?? 35,
                      })}
                    />
                  </span>
                </div>
              </>
            ) : (
              <div className="empty-state">لا يوجد تاريخ استحقاق مسجّل</div>
            )}
          </div>

          <h3 className="section-title">التنبيهات ({customerNotifs.length})</h3>
          <div className="table-wrap">
            {customerNotifs.length === 0 ? (
              <div className="empty-state">لا توجد تنبيهات</div>
            ) : (
              customerNotifs.map((n) => (
                <div key={n.id} className="log-line items-center justify-between">
                  <NotificationPill type={n.notification_type} settings={notifSettings} />
                  <span className="mono text-gray-500">{n.notification_date}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-3.5 flex flex-col gap-2">
            {canAddFollowup && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setFollowupOpen(true)}
              >
                تسجيل متابعة
              </button>
            )}
            {canAddCollection && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCollectionOpen(true)}
              >
                تسجيل دفعة محصّلة
              </button>
            )}
            {canEdit && (
              <button type="button" className="btn btn-outline" onClick={() => setEditOpen(true)}>
                تعديل بيانات العميل
              </button>
            )}
            {isCollector(profile) && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void onEscalate()}
                disabled={escalate.isPending}
              >
                رفع الحالة للمدير
              </button>
            )}
          </div>
        </div>
      </div>

      {editOpen && <CustomerModal open existing={customer} onClose={() => setEditOpen(false)} />}
      {followupOpen && (
        <FollowupModal
          open
          customerId={customer.id}
          customerName={customer.customer_name}
          onClose={() => setFollowupOpen(false)}
        />
      )}
      {collectionOpen && (
        <CollectionModal
          open
          customer={customer}
          onClose={() => setCollectionOpen(false)}
        />
      )}

      {/* نافذة معاينة الصور المرفقة */}
      {previewImage && (
        <Modal
          open={Boolean(previewImage)}
          title={`معاينة المرفق: ${previewImage.title}`}
          onClose={() => setPreviewImage(null)}
          wide
          footer={
            <div className="flex justify-between w-full">
              <a
                href={previewImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline text-xs"
              >
                فتح الصورة بالحجم الكامل ↗
              </a>
              <button
                type="button"
                className="btn btn-primary text-xs"
                onClick={() => setPreviewImage(null)}
              >
                إغلاق
              </button>
            </div>
          }
        >
          <div className="flex justify-center items-center max-h-[70vh] overflow-hidden bg-zinc-900/5 dark:bg-zinc-950 rounded-lg p-2">
            <img
              src={previewImage.url}
              alt={previewImage.title}
              className="max-h-[65vh] w-auto max-w-full rounded object-contain"
            />
          </div>
        </Modal>
      )}
    </>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  tel = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  tel?: boolean;
}) {
  return (
    <div className="info-row">
      <span className="k">{label}</span>
      <span className="v">
        {value ? (
          tel ? (
            <a href={`tel:${value}`} dir="ltr" className="mono text-blue-600">
              {value}
            </a>
          ) : (
            <span className={mono ? 'mono' : undefined}>{value}</span>
          )
        ) : (
          '—'
        )}
      </span>
    </div>
  );
}
