import { useState, useEffect, useMemo } from 'react';
import {
  useSettings,
  useUpdateSettings,
  useCategories,
  useSaveCategory,
  useCustomers,
  useSettingsActivityLogs,
  useUserDirectory,
} from '@/lib/queries';
import { useProfile } from '@/features/auth/AuthContext';
import { canManageSettings } from '@/lib/permissions';
import { useToast, errorMessage } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { NOTIFICATION_META, type NotificationType } from '@/lib/logic/notifications';
import {
  NOTIF_ICONS,
  IconPlus,
  IconBuilding,
  IconBell,
  IconExchange,
  IconTag,
  IconHistory,
  IconCalculator,
  IconArchive,
} from '@/components/ui/Icons';
import { BackupRestoreCenter } from './backups/BackupRestoreCenter';
import type { AppSettings, CustomerCategory } from '@/types/models';

type SettingsTab = 'general' | 'alerts' | 'currencies' | 'categories' | 'audit' | 'backups';

export function SettingsScreen() {
  const profile = useProfile();
  const toast = useToast();
  const { data: settings, isLoading, isError } = useSettings();
  const updateSettings = useUpdateSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [form, setForm] = useState<Partial<AppSettings>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; existing: CustomerCategory | null }>({
    open: false,
    existing: null,
  });

  const isAllowed = canManageSettings(profile);

  // Initialize form when settings load
  useEffect(() => {
    if (settings) {
      setForm({
        company_name: settings.company_name ?? 'مكتب الدكتور أيمن لخدمات الدواجن',
        system_name: settings.system_name ?? 'Smart Collection Platform',
        language: settings.language ?? 'ar',
        direction: settings.direction ?? 'rtl',
        date_format: settings.date_format ?? 'YYYY-MM-DD',
        internal_email_domain: settings.internal_email_domain ?? 'dr-ayman.local',
        days_before_due_alert: settings.days_before_due_alert ?? 3,
        no_followup_days_limit: settings.no_followup_days_limit ?? 14,
        overdue_alert_days: settings.overdue_alert_days ?? 35,
        shopping_status_label: settings.shopping_status_label ?? 'يسوق الآن',
        promise_keyword: settings.promise_keyword ?? 'وعد',
        alert_due_soon_enabled: settings.alert_due_soon_enabled ?? true,
        alert_due_today_enabled: settings.alert_due_today_enabled ?? true,
        alert_shopping_now_enabled: settings.alert_shopping_now_enabled ?? true,
        alert_promise_enabled: settings.alert_promise_enabled ?? true,
        alert_stale_enabled: settings.alert_stale_enabled ?? true,
        alert_escalated_enabled: settings.alert_escalated_enabled ?? true,
        exchange_rate_usd: settings.exchange_rate_usd ?? 530,
        exchange_rate_sar: settings.exchange_rate_sar ?? 141,
        currencies_config: settings.currencies_config ?? [
          { code: 'YER', name: 'ريال يمني', symbol: 'ر.ي', rate: 1, is_base: true, is_active: true },
          { code: 'USD', name: 'دولار أمريكي', symbol: '$', rate: settings.exchange_rate_usd ?? 530, is_base: false, is_active: true },
          { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س', rate: settings.exchange_rate_sar ?? 141, is_base: false, is_active: true },
        ],
      });
      setErrors({});
    }
  }, [settings]);

  // Check if form is dirty
  const isDirty = useMemo(() => {
    if (!settings) return false;
    const initial: Partial<AppSettings> = {
      company_name: settings.company_name ?? 'مكتب الدكتور أيمن لخدمات الدواجن',
      system_name: settings.system_name ?? 'Smart Collection Platform',
      language: settings.language ?? 'ar',
      direction: settings.direction ?? 'rtl',
      date_format: settings.date_format ?? 'YYYY-MM-DD',
      internal_email_domain: settings.internal_email_domain ?? 'dr-ayman.local',
      days_before_due_alert: settings.days_before_due_alert ?? 3,
      no_followup_days_limit: settings.no_followup_days_limit ?? 14,
      overdue_alert_days: settings.overdue_alert_days ?? 35,
      shopping_status_label: settings.shopping_status_label ?? 'يسوق الآن',
      promise_keyword: settings.promise_keyword ?? 'وعد',
      alert_due_soon_enabled: settings.alert_due_soon_enabled ?? true,
      alert_due_today_enabled: settings.alert_due_today_enabled ?? true,
      alert_shopping_now_enabled: settings.alert_shopping_now_enabled ?? true,
      alert_promise_enabled: settings.alert_promise_enabled ?? true,
      alert_stale_enabled: settings.alert_stale_enabled ?? true,
      alert_escalated_enabled: settings.alert_escalated_enabled ?? true,
      exchange_rate_usd: settings.exchange_rate_usd ?? 530,
      exchange_rate_sar: settings.exchange_rate_sar ?? 141,
    };

    return Object.keys(initial).some((k) => {
      const key = k as keyof AppSettings;
      return form[key] !== initial[key];
    });
  }, [form, settings]);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!form.company_name?.trim()) errs.company_name = 'اسم المنشأة مطلوب';
    if (!form.system_name?.trim()) errs.system_name = 'اسم النظام مطلوب';
    if (!form.shopping_status_label?.trim()) errs.shopping_status_label = 'مسمى حالة التسويق مطلوب';
    if (!form.promise_keyword?.trim()) errs.promise_keyword = 'الكلمة المفتاحية لوعد السداد مطلوبة';

    const usd = Number(form.exchange_rate_usd);
    if (!Number.isFinite(usd) || usd <= 0) {
      errs.exchange_rate_usd = 'سعر صرف الدولار يجب أن يكون رقماً موجباً أكبر من صفر';
    }

    const sar = Number(form.exchange_rate_sar);
    if (!Number.isFinite(sar) || sar <= 0) {
      errs.exchange_rate_sar = 'سعر صرف الريال السعودي يجب أن يكون رقماً موجباً أكبر من صفر';
    }

    const dueAlert = Number(form.days_before_due_alert);
    if (!Number.isInteger(dueAlert) || dueAlert < 0) {
      errs.days_before_due_alert = 'أيام التنبيه قبل الاستحقاق يجب أن تكون 0 أو أكثر';
    }

    const noFollow = Number(form.no_followup_days_limit);
    if (!Number.isInteger(noFollow) || noFollow < 1) {
      errs.no_followup_days_limit = 'أيام عدم المتابعة يجب أن تكون 1 على الأقل';
    }

    const overdue = Number(form.overdue_alert_days);
    if (!Number.isInteger(overdue) || overdue < 1) {
      errs.overdue_alert_days = 'عتبة التعثر الشديد يجب أن تكون 1 على الأقل';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) {
      toast.show('يرجى تصحيح أخطاء الإدخال الموضحة');
      return;
    }

    try {
      const payload: Partial<AppSettings> = {
        company_name: form.company_name?.trim(),
        system_name: form.system_name?.trim(),
        language: form.language,
        direction: form.direction,
        date_format: form.date_format,
        internal_email_domain: form.internal_email_domain?.trim(),
        days_before_due_alert: Number(form.days_before_due_alert),
        no_followup_days_limit: Number(form.no_followup_days_limit),
        overdue_alert_days: Number(form.overdue_alert_days),
        shopping_status_label: form.shopping_status_label?.trim(),
        promise_keyword: form.promise_keyword?.trim(),
        alert_due_soon_enabled: form.alert_due_soon_enabled,
        alert_due_today_enabled: form.alert_due_today_enabled,
        alert_shopping_now_enabled: form.alert_shopping_now_enabled,
        alert_promise_enabled: form.alert_promise_enabled,
        alert_stale_enabled: form.alert_stale_enabled,
        alert_escalated_enabled: form.alert_escalated_enabled,
        exchange_rate_usd: Number(form.exchange_rate_usd),
        exchange_rate_sar: Number(form.exchange_rate_sar),
        currencies_config: [
          { code: 'YER', name: 'ريال يمني', symbol: 'ر.ي', rate: 1, is_base: true, is_active: true },
          { code: 'USD', name: 'دولار أمريكي', symbol: '$', rate: Number(form.exchange_rate_usd), is_base: false, is_active: true },
          { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س', rate: Number(form.exchange_rate_sar), is_base: false, is_active: true },
        ],
      };

      await updateSettings.mutateAsync(payload);
      toast.show('تم حفظ الإعدادات بنجاح وتوثيق العملية في سجل التدقيق');
    } catch (e) {
      toast.show(errorMessage(e));
    }
  }

  function handleReset() {
    if (settings) {
      setForm({
        company_name: settings.company_name ?? 'مكتب الدكتور أيمن لخدمات الدواجن',
        system_name: settings.system_name ?? 'Smart Collection Platform',
        language: settings.language ?? 'ar',
        direction: settings.direction ?? 'rtl',
        date_format: settings.date_format ?? 'YYYY-MM-DD',
        internal_email_domain: settings.internal_email_domain ?? 'dr-ayman.local',
        days_before_due_alert: settings.days_before_due_alert ?? 3,
        no_followup_days_limit: settings.no_followup_days_limit ?? 14,
        overdue_alert_days: settings.overdue_alert_days ?? 35,
        shopping_status_label: settings.shopping_status_label ?? 'يسوق الآن',
        promise_keyword: settings.promise_keyword ?? 'وعد',
        alert_due_soon_enabled: settings.alert_due_soon_enabled ?? true,
        alert_due_today_enabled: settings.alert_due_today_enabled ?? true,
        alert_shopping_now_enabled: settings.alert_shopping_now_enabled ?? true,
        alert_promise_enabled: settings.alert_promise_enabled ?? true,
        alert_stale_enabled: settings.alert_stale_enabled ?? true,
        alert_escalated_enabled: settings.alert_escalated_enabled ?? true,
        exchange_rate_usd: settings.exchange_rate_usd ?? 530,
        exchange_rate_sar: settings.exchange_rate_sar ?? 141,
      });
      setErrors({});
      toast.show('تم التراجع عن التعديلات غير المحفوظة');
    }
  }

  if (!isAllowed) {
    return (
      <div className="empty-state p-8 text-center">
        <div className="mb-2 text-base font-bold text-red-600">غير مصرّح</div>
        <p className="text-[13px] text-gray-500">
          هذه الشاشة مخصصة لمدير النظام فقط للتحكم في الإعدادات المركزية والقواعد التشغيلية.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="empty-state">جارٍ تحميل الإعدادات المركزية…</div>;
  }

  if (isError || !settings) {
    return <div className="empty-state text-red-600">تعذّر تحميل الإعدادات من الخادم.</div>;
  }

  return (
    <div className="space-y-6 pb-20">
      {/* ------------------------------------------------ Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">الإعدادات المركزية وقواعد النظام</h1>
            <Pill tone="blue">مدير النظام</Pill>
            {isDirty && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 animate-pulse">
                تعديلات غير محفوظة
              </span>
            )}
          </div>
          <p className="text-[13px] text-gray-500 mt-1">
            إدارة المتغيرات التشغيلية، عتبات التنبيه، أسعار الصرف، وفئات العملاء مع التوثيق الكامل في سجل التدقيق.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ Tabs Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        <TabButton
          active={activeTab === 'general'}
          onClick={() => setActiveTab('general')}
          label="الإعدادات العامة"
          icon={<IconBuilding className="h-4 w-4" />}
        />
        <TabButton
          active={activeTab === 'alerts'}
          onClick={() => setActiveTab('alerts')}
          label="المتابعة والتنبيهات"
          icon={<IconBell className="h-4 w-4" />}
        />
        <TabButton
          active={activeTab === 'currencies'}
          onClick={() => setActiveTab('currencies')}
          label="العملات وأسعار الصرف"
          icon={<IconExchange className="h-4 w-4" />}
        />
        <TabButton
          active={activeTab === 'categories'}
          onClick={() => setActiveTab('categories')}
          label="فئات العملاء والحوافز"
          icon={<IconTag className="h-4 w-4" />}
        />
        <TabButton
          active={activeTab === 'audit'}
          onClick={() => setActiveTab('audit')}
          label="سجل تدقيق الإعدادات"
          icon={<IconHistory className="h-4 w-4" />}
        />
        <TabButton
          active={activeTab === 'backups'}
          onClick={() => setActiveTab('backups')}
          label="النسخ الاحتياطي والاستعادة"
          icon={<IconArchive className="h-4 w-4" />}
        />
      </div>

      {/* ------------------------------------------------ Tab Contents */}
      {activeTab === 'general' && (
        <GeneralSettingsTab form={form} setForm={setForm} errors={errors} />
      )}

      {activeTab === 'alerts' && (
        <AlertsSettingsTab form={form} setForm={setForm} errors={errors} />
      )}

      {activeTab === 'currencies' && (
        <CurrenciesSettingsTab form={form} setForm={setForm} errors={errors} />
      )}

      {activeTab === 'categories' && (
        <CategoriesSettingsTab
          onOpenAdd={() => setCategoryModal({ open: true, existing: null })}
          onOpenEdit={(cat) => setCategoryModal({ open: true, existing: cat })}
        />
      )}

      {activeTab === 'audit' && <AuditTrailTab />}

      {activeTab === 'backups' && <BackupRestoreCenter />}

      {/* ------------------------------------------------ Floating / Sticky Save Bar */}
      {isDirty && (
        <div className="fixed bottom-4 left-4 right-4 md:left-8 md:right-72 z-40 flex items-center justify-between rounded-xl bg-navy-900/95 backdrop-blur-md p-4 text-white shadow-2xl border border-navy-700 transition-all">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 rounded-full bg-amber-400 animate-ping" />
            <span className="text-sm font-semibold">توجد تعديلات غير محفوظة على الإعدادات</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
              onClick={handleReset}
              disabled={updateSettings.isPending}
            >
              إلغاء التغييرات
            </button>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
              onClick={() => void handleSave()}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? 'جارٍ الحفظ…' : 'حفظ التغييرات الآن'}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Category Modal */}
      {categoryModal.open && (
        <CategoryManageModal
          existing={categoryModal.existing}
          onClose={() => setCategoryModal({ open: false, existing: null })}
        />
      )}
    </div>
  );
}

/* ============================================================ Tab Button */
function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold transition-all ${
        active
          ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-200'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ============================================================ 1. General Tab */
function GeneralSettingsTab({
  form,
  setForm,
  errors,
}: {
  form: Partial<AppSettings>;
  setForm: React.Dispatch<React.SetStateAction<Partial<AppSettings>>>;
  errors: Record<string, string>;
}) {
  return (
    <div className="card space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900">بيانات المنشأة والهوية العامة</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          البيانات الأساسية التي تظهر في ترويسة التقارير وواجهة النظام.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="field">
          <label className="text-xs font-bold text-gray-700">اسم المنشأة / المكتب *</label>
          <input
            type="text"
            className={`input ${errors.company_name ? 'border-red-500 ring-1 ring-red-500' : ''}`}
            placeholder="مثال: مكتب الدكتور أيمن لخدمات الدواجن"
            value={form.company_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
          />
          {errors.company_name && <p className="text-[11px] text-red-600 mt-1">{errors.company_name}</p>}
        </div>

        <div className="field">
          <label className="text-xs font-bold text-gray-700">اسم النظام / المنصة *</label>
          <input
            type="text"
            className={`input ${errors.system_name ? 'border-red-500 ring-1 ring-red-500' : ''}`}
            placeholder="مثال: Smart Collection Platform"
            value={form.system_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, system_name: e.target.value }))}
          />
          {errors.system_name && <p className="text-[11px] text-red-600 mt-1">{errors.system_name}</p>}
        </div>

        <div className="field">
          <label className="text-xs font-bold text-gray-700">لغة النظام والواجهة</label>
          <select
            className="input"
            value={form.language ?? 'ar'}
            onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
          >
            <option value="ar">العربية (Arabic)</option>
            <option value="en">English (الإنجليزية)</option>
          </select>
        </div>

        <div className="field">
          <label className="text-xs font-bold text-gray-700">اتجاه الواجهة الافتراضي</label>
          <select
            className="input"
            value={form.direction ?? 'rtl'}
            onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
          >
            <option value="rtl">من اليمين إلى اليسار (RTL)</option>
            <option value="ltr">من اليسار إلى اليمين (LTR)</option>
          </select>
        </div>

        <div className="field">
          <label className="text-xs font-bold text-gray-700">تنسيق التاريخ المعتمد</label>
          <select
            className="input"
            value={form.date_format ?? 'YYYY-MM-DD'}
            onChange={(e) => setForm((f) => ({ ...f, date_format: e.target.value }))}
          >
            <option value="YYYY-MM-DD">YYYY-MM-DD (مثال: 2026-08-31)</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY (مثال: 31/08/2026)</option>
            <option value="DD-MM-YYYY">DD-MM-YYYY (مثال: 31-08-2026)</option>
          </select>
        </div>

        <div className="field">
          <label className="text-xs font-bold text-gray-700">النطاق البريدي الداخلي للموظفين</label>
          <input
            type="text"
            dir="ltr"
            className="input text-left"
            placeholder="dr-ayman.local"
            value={form.internal_email_domain ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, internal_email_domain: e.target.value }))}
          />
          <p className="text-[11px] text-gray-500 mt-1">
            يُستخدم لتوليد معرفات المصادقة للموظفين عند تسجيل الدخول باسم المستخدم.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ 2. Alerts Tab */
function AlertsSettingsTab({
  form,
  setForm,
  errors,
}: {
  form: Partial<AppSettings>;
  setForm: React.Dispatch<React.SetStateAction<Partial<AppSettings>>>;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      {/* Rules Card */}
      <div className="card space-y-5">
        <div>
          <h2 className="text-base font-bold text-gray-900">عتبات وقواعد المتابعة والاستحقاق</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            الضوابط الزمنية التي تُبنى عليها تنبيهات التحصيل وتصنيفات التعثر اليومية.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="field">
            <label className="text-xs font-bold text-gray-700">أيام التنبيه قبل الاستحقاق *</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={30}
                className={`input pr-3 pl-12 font-mono text-left ${
                  errors.days_before_due_alert ? 'border-red-500 ring-1 ring-red-500' : ''
                }`}
                value={form.days_before_due_alert ?? 3}
                onChange={(e) =>
                  setForm((f) => ({ ...f, days_before_due_alert: parseInt(e.target.value, 10) || 0 }))
                }
              />
              <span className="absolute left-3 top-2.5 text-xs text-gray-400 pointer-events-none">أيام</span>
            </div>
            {errors.days_before_due_alert && (
              <p className="text-[11px] text-red-600 mt-1">{errors.days_before_due_alert}</p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              الافتراضي: 3 أو 5 أيام قبل حلول تاريخ الاستحقاق الفعلي للعميل.
            </p>
          </div>

          <div className="field">
            <label className="text-xs font-bold text-gray-700">أيام اعتبار العميل غير متابع *</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={90}
                className={`input pr-3 pl-12 font-mono text-left ${
                  errors.no_followup_days_limit ? 'border-red-500 ring-1 ring-red-500' : ''
                }`}
                value={form.no_followup_days_limit ?? 14}
                onChange={(e) =>
                  setForm((f) => ({ ...f, no_followup_days_limit: parseInt(e.target.value, 10) || 0 }))
                }
              />
              <span className="absolute left-3 top-2.5 text-xs text-gray-400 pointer-events-none">يوماً</span>
            </div>
            {errors.no_followup_days_limit && (
              <p className="text-[11px] text-red-600 mt-1">{errors.no_followup_days_limit}</p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              إطلاق تنبيه «لم تتم متابعته» عند مرور هذه المدة دون أي تواصل مسجل.
            </p>
          </div>

          <div className="field">
            <label className="text-xs font-bold text-gray-700">عتبة التعثر الشديد بالأيام *</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={365}
                className={`input pr-3 pl-12 font-mono text-left ${
                  errors.overdue_alert_days ? 'border-red-500 ring-1 ring-red-500' : ''
                }`}
                value={form.overdue_alert_days ?? 35}
                onChange={(e) =>
                  setForm((f) => ({ ...f, overdue_alert_days: parseInt(e.target.value, 10) || 0 }))
                }
              />
              <span className="absolute left-3 top-2.5 text-xs text-gray-400 pointer-events-none">يوماً</span>
            </div>
            {errors.overdue_alert_days && (
              <p className="text-[11px] text-red-600 mt-1">{errors.overdue_alert_days}</p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              المدة المعتمدة لتمييز العميل المتعثر شديد الخطورة (مفتاح: مرور 35 يوماً).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 pt-2 border-t border-gray-100">
          <div className="field">
            <label className="text-xs font-bold text-gray-700">الكلمة المفتاحية لوعد السداد *</label>
            <input
              type="text"
              className={`input ${errors.promise_keyword ? 'border-red-500 ring-1 ring-red-500' : ''}`}
              placeholder="وعد"
              value={form.promise_keyword ?? 'وعد'}
              onChange={(e) => setForm((f) => ({ ...f, promise_keyword: e.target.value }))}
            />
            {errors.promise_keyword && (
              <p className="text-[11px] text-red-600 mt-1">{errors.promise_keyword}</p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              الكلمة التي يبحث عنها النظام في نتيجة المتابعة لتوليد تنبيه موعد الوعد (مثل "وعد").
            </p>
          </div>

          <div className="field">
            <label className="text-xs font-bold text-gray-700">مسمى حالة التسويق *</label>
            <input
              type="text"
              className={`input ${errors.shopping_status_label ? 'border-red-500 ring-1 ring-red-500' : ''}`}
              placeholder="يسوق الآن"
              value={form.shopping_status_label ?? 'يسوق الآن'}
              onChange={(e) => setForm((f) => ({ ...f, shopping_status_label: e.target.value }))}
            />
            {errors.shopping_status_label && (
              <p className="text-[11px] text-red-600 mt-1">{errors.shopping_status_label}</p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              النص المطابق لحالة العميل النشط في السوق لتوليد تنبيه التسويق.
            </p>
          </div>
        </div>
      </div>

      {/* Alert Toggles Card */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">خيارات تفعيل وتعطيل أنواع التنبيهات</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            التحكم في التنبيهات التي يتم توليدها آلياً أو إتاحتها للمسؤولين.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AlertToggleCard
            type="before_due"
            title="تنبيه اقتراب موعد الاستحقاق"
            description={`يولد تنبيهاً قبل موعد الاستحقاق بـ ${form.days_before_due_alert ?? 3} أيام`}
            checked={form.alert_due_soon_enabled ?? true}
            onChange={(checked) => setForm((f) => ({ ...f, alert_due_soon_enabled: checked }))}
          />

          <AlertToggleCard
            type="due_today"
            title="تنبيه يوم الاستحقاق"
            description="يولد تنبيهاً عند حلول تاريخ الاستحقاق الفعلي اليوم"
            checked={form.alert_due_today_enabled ?? true}
            onChange={(checked) => setForm((f) => ({ ...f, alert_due_today_enabled: checked }))}
          />

          <AlertToggleCard
            type="shopping_now"
            title="تنبيه عميل يسوق الآن"
            description="يولد تنبيهاً للعملاء الذين حالتهم مسجلة كـ «يسوق الآن»"
            checked={form.alert_shopping_now_enabled ?? true}
            onChange={(checked) => setForm((f) => ({ ...f, alert_shopping_now_enabled: checked }))}
          />

          <AlertToggleCard
            type="promise_today"
            title="تنبيه وعد بالسداد اليوم"
            description="يولد تنبيهاً عند حلول موعد المتابعة الذي يحمل وعد سداد مسجل"
            checked={form.alert_promise_enabled ?? true}
            onChange={(checked) => setForm((f) => ({ ...f, alert_promise_enabled: checked }))}
          />

          <AlertToggleCard
            type="stale"
            title="تنبيه عدم المتابعة"
            description={`يولد تنبيهاً عند انقطاع التواصل لأكثر من ${form.no_followup_days_limit ?? 14} يوماً`}
            checked={form.alert_stale_enabled ?? true}
            onChange={(checked) => setForm((f) => ({ ...f, alert_stale_enabled: checked }))}
          />

          <AlertToggleCard
            type="escalated"
            title="تنبيه الحالات المرفوعة للمدير"
            description="تفعيل استقبال البلاغات والحالات المستعجلة المرفوعة من المحصلين"
            checked={form.alert_escalated_enabled ?? true}
            onChange={(checked) => setForm((f) => ({ ...f, alert_escalated_enabled: checked }))}
          />
        </div>
      </div>
    </div>
  );
}

function AlertToggleCard({
  type,
  title,
  description,
  checked,
  onChange,
}: {
  type: NotificationType;
  title: string;
  description: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  const meta = NOTIFICATION_META[type];
  const Icon = NOTIF_ICONS[meta.icon];

  return (
    <div
      className={`flex items-start justify-between p-3.5 rounded-xl border transition-all ${
        checked ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: meta.bg, color: meta.fg }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[13px] font-bold text-gray-900">{title}</div>
          <div className="text-[11.5px] text-gray-500 mt-0.5">{description}</div>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
      </label>
    </div>
  );
}

/* ============================================================ 3. Currencies Tab */
function CurrenciesSettingsTab({
  form,
  setForm,
  errors,
}: {
  form: Partial<AppSettings>;
  setForm: React.Dispatch<React.SetStateAction<Partial<AppSettings>>>;
  errors: Record<string, string>;
}) {
  // Quick calculator test state
  const [calcUsd, setCalcUsd] = useState('100');
  const [calcSar, setCalcSar] = useState('1000');

  const usdRate = Number(form.exchange_rate_usd) || 0;
  const sarRate = Number(form.exchange_rate_sar) || 0;

  const usdCalcYer = (Number(calcUsd) || 0) * usdRate;
  const sarCalcYer = (Number(calcSar) || 0) * sarRate;

  return (
    <div className="space-y-6">
      {/* Exchange Rates Form */}
      <div className="card space-y-5">
        <div>
          <h2 className="text-base font-bold text-gray-900">أسعار الصرف مقابل الريال اليمني (YER)</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            تُستخدم هذه الأسعار لتحويل المديونيات والدفعات والأرصدة بالدولار والريال السعودي إلى معادلها بالريال اليمني.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-blue-900">الدولار الأمريكي (USD)</span>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                1 USD = {usdRate} YER
              </span>
            </div>
            <div className="field">
              <label className="text-xs font-bold text-gray-700">سعر الصرف (ريال يمني لكل 1 دولار) *</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min={1}
                  dir="ltr"
                  className={`input font-mono text-left font-bold pr-3 pl-14 ${
                    errors.exchange_rate_usd ? 'border-red-500 ring-1 ring-red-500' : ''
                  }`}
                  value={form.exchange_rate_usd ?? 530}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, exchange_rate_usd: parseFloat(e.target.value) || 0 }))
                  }
                />
                <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-400">YER</span>
              </div>
              {errors.exchange_rate_usd && (
                <p className="text-[11px] text-red-600 mt-1">{errors.exchange_rate_usd}</p>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-900">الريال السعودي (SAR)</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                1 SAR = {sarRate} YER
              </span>
            </div>
            <div className="field">
              <label className="text-xs font-bold text-gray-700">سعر الصرف (ريال يمني لكل 1 ريال سعودي) *</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min={1}
                  dir="ltr"
                  className={`input font-mono text-left font-bold pr-3 pl-14 ${
                    errors.exchange_rate_sar ? 'border-red-500 ring-1 ring-red-500' : ''
                  }`}
                  value={form.exchange_rate_sar ?? 141}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, exchange_rate_sar: parseFloat(e.target.value) || 0 }))
                  }
                />
                <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-400">YER</span>
              </div>
              {errors.exchange_rate_sar && (
                <p className="text-[11px] text-red-600 mt-1">{errors.exchange_rate_sar}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Currencies Catalog Table */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">دليل العملات المدعومة في النظام</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            العملات الثلاث المعتمدة في شيتات الحسابات وجداول التحصيل.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>رمز العملة</th>
                <th>اسم العملة</th>
                <th>العلامة</th>
                <th>سعر الصرف المقابل</th>
                <th>النوع</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono font-bold text-blue-700">YER</td>
                <td>الريال اليمني</td>
                <td>ر.ي</td>
                <td className="font-mono">1.00</td>
                <td>
                  <Pill tone="blue">العملة الأساسية (Base)</Pill>
                </td>
                <td>
                  <Pill tone="green">نشطة</Pill>
                </td>
              </tr>
              <tr>
                <td className="font-mono font-bold text-emerald-700">USD</td>
                <td>الدولار الأمريكي</td>
                <td>$</td>
                <td className="font-mono font-bold text-gray-900">{usdRate.toLocaleString()} YER</td>
                <td>عملة أجنبية</td>
                <td>
                  <Pill tone="green">نشطة</Pill>
                </td>
              </tr>
              <tr>
                <td className="font-mono font-bold text-purple-700">SAR</td>
                <td>الريال السعودي</td>
                <td>ر.س</td>
                <td className="font-mono font-bold text-gray-900">{sarRate.toLocaleString()} YER</td>
                <td>عملة أجنبية</td>
                <td>
                  <Pill tone="green">نشطة</Pill>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Calculator Sandbox */}
      <div className="card bg-gradient-to-br from-gray-50 to-blue-50/30 border-dashed space-y-4">
        <div className="flex items-center gap-2">
          <IconCalculator className="h-5 w-5 text-blue-600 shrink-0" />
          <h3 className="text-sm font-bold text-gray-900">حاسبة التحويل الفوري السريعة</h3>
          <span className="text-xs text-gray-500">(أداة تجربة للتحقق من دقة أسعار الصرف الحالية)</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200">
            <div className="field mb-0 flex-1">
              <label className="text-[11px] text-gray-500">المبلغ بالدولار ($)</label>
              <input
                type="number"
                dir="ltr"
                className="input py-1 text-sm font-mono text-left"
                value={calcUsd}
                onChange={(e) => setCalcUsd(e.target.value)}
              />
            </div>
            <div className="text-xl text-gray-400">➔</div>
            <div className="flex-1 text-left">
              <div className="text-[11px] text-gray-500">المعادل بالريال اليمني</div>
              <div className="font-mono text-base font-bold text-blue-700">
                {usdCalcYer.toLocaleString()} ر.ي
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200">
            <div className="field mb-0 flex-1">
              <label className="text-[11px] text-gray-500">المبلغ بالريال السعودي (ر.س)</label>
              <input
                type="number"
                dir="ltr"
                className="input py-1 text-sm font-mono text-left"
                value={calcSar}
                onChange={(e) => setCalcSar(e.target.value)}
              />
            </div>
            <div className="text-xl text-gray-400">➔</div>
            <div className="flex-1 text-left">
              <div className="text-[11px] text-gray-500">المعادل بالريال اليمني</div>
              <div className="font-mono text-base font-bold text-emerald-700">
                {sarCalcYer.toLocaleString()} ر.ي
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ 4. Categories Tab */
function CategoriesSettingsTab({
  onOpenAdd,
  onOpenEdit,
}: {
  onOpenAdd: () => void;
  onOpenEdit: (c: CustomerCategory) => void;
}) {
  const { data: categories = [], isLoading } = useCategories();
  const { data: customers = [] } = useCustomers();

  // Map customer counts by category
  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      if (c.customer_category_id) {
        map.set(c.customer_category_id, (map.get(c.customer_category_id) ?? 0) + 1);
      }
    }
    return map;
  }, [customers]);

  return (
    <div className="card space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">إدارة فئات العملاء ونسب الحوافز</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            تحديد تصنيفات العملاء، ألوان التمييز، ونسبة الحافز % المخصصة لموظفي التحصيل عند اعتماد الدفعات.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary self-start sm:self-auto"
          onClick={onOpenAdd}
        >
          <IconPlus className="h-4 w-4" />
          <span>إضافة فئة جديدة</span>
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state">جارٍ تحميل الفئات…</div>
      ) : categories.length === 0 ? (
        <div className="empty-state">لا توجد فئات عملاء بعد. أضف فئتك الأولى للبدء.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الفئة ولون التمييز</th>
                <th>نسبة الحافز %</th>
                <th>عدد العملاء</th>
                <th>الحالة</th>
                <th className="text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50/80">
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-4 w-4 rounded-full border border-black/10 shrink-0 shadow-sm"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-bold text-gray-900">{cat.category_name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                      {cat.incentive_rate}%
                    </span>
                  </td>
                  <td>
                    <span className="font-mono text-gray-700 font-semibold">
                      {countMap.get(cat.id) ?? 0} عميل
                    </span>
                  </td>
                  <td>
                    {cat.is_active ? (
                      <Pill tone="green">نشطة</Pill>
                    ) : (
                      <Pill tone="gray">موقوفة</Pill>
                    )}
                  </td>
                  <td className="text-left">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => onOpenEdit(cat)}
                    >
                      تعديل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================ 5. Audit Trail Tab */
function AuditTrailTab() {
  const { data: logs = [], isLoading } = useSettingsActivityLogs(100);
  const directory = useUserDirectory();

  const userMap = useMemo(() => {
    return new Map((directory.data ?? []).map((u) => [u.id, u.full_name]));
  }, [directory.data]);

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">سجل تدقيق وتغييرات الإعدادات (Audit Log)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          سجل غير قابل للتعديل يوثق آلياً عبر قاعدة البيانات كافة عمليات تعديل الإعدادات والأسعار والعتبات.
        </p>
      </div>

      {isLoading ? (
        <div className="empty-state">جارٍ تحميل سجل التدقيق…</div>
      ) : logs.length === 0 ? (
        <div className="empty-state">لا توجد عمليات تعديل سابقة مسجلة في سجل الإعدادات.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>المستخدم المسؤول</th>
                <th>نوع العملية</th>
                <th>التاريخ والوقت</th>
                <th>تفاصيل التغيير (القيم السابقة ➔ الجديدة)</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const userName = log.user_id ? userMap.get(log.user_id) ?? 'مدير النظام' : 'النظام الآلي';
                return (
                  <tr key={log.id} className="text-xs">
                    <td className="font-bold text-gray-900 whitespace-nowrap">{userName}</td>
                    <td>
                      <Pill tone={log.action_type === 'create' ? 'green' : log.action_type === 'delete' ? 'red' : 'blue'}>
                        {log.action_type}
                      </Pill>
                    </td>
                    <td className="font-mono text-gray-600 whitespace-nowrap" dir="ltr">
                      {new Date(log.created_at).toLocaleString('ar-YE')}
                    </td>
                    <td>
                      <LogDiffView oldValue={log.old_value} newValue={log.new_value} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LogDiffView({ oldValue, newValue }: { oldValue: unknown; newValue: unknown }) {
  if (!oldValue && !newValue) return <span className="text-gray-400">—</span>;

  const oldObj = (typeof oldValue === 'object' && oldValue !== null ? oldValue : {}) as Record<string, unknown>;
  const newObj = (typeof newValue === 'object' && newValue !== null ? newValue : {}) as Record<string, unknown>;

  const changedKeys = Object.keys({ ...oldObj, ...newObj }).filter((k) => {
    if (k === 'updated_at' || k === 'id') return false;
    return JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k]);
  });

  if (changedKeys.length === 0) {
    return <span className="text-gray-400">تعديل عام بدون تغيير في الحقول الأساسية</span>;
  }

  return (
    <div className="flex flex-wrap gap-2 max-w-xl">
      {changedKeys.map((key) => {
        const oldVal = oldObj[key];
        const newVal = newObj[key];
        return (
          <div key={key} className="rounded bg-gray-100 px-2 py-1 text-[11px]">
            <span className="font-semibold text-gray-800">{key}: </span>
            <span className="text-red-700 line-through mr-1 font-mono">
              {String(oldVal !== undefined ? oldVal : '—')}
            </span>
            <span className="text-gray-400"> ➔ </span>
            <span className="text-emerald-700 font-bold font-mono">
              {String(newVal !== undefined ? newVal : '—')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================ Category Modal */
function CategoryManageModal({
  existing,
  onClose,
}: {
  existing: CustomerCategory | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const saveCategory = useSaveCategory();

  const [name, setName] = useState(existing?.category_name ?? '');
  const [color, setColor] = useState(existing?.color ?? '#2563EB');
  const [incentiveRate, setIncentiveRate] = useState(String(existing?.incentive_rate ?? 0));
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    if (!name.trim()) {
      setError('اسم الفئة مطلوب');
      return;
    }

    const rate = Number(incentiveRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError('نسبة الحافز يجب أن تكون رقماً بين 0% و 100%');
      return;
    }

    try {
      await saveCategory.mutateAsync({
        id: existing?.id,
        values: {
          category_name: name.trim(),
          color,
          incentive_rate: rate,
          is_active: isActive,
        },
      });
      toast.show(existing ? 'تم تحديث فئة العميل' : 'تمت إضافة فئة العميل الجديدة');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      open
      title={existing ? `تعديل فئة — ${existing.category_name}` : 'إضافة فئة عملاء جديدة'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={saveCategory.isPending}
          >
            {saveCategory.isPending ? 'جارٍ الحفظ…' : existing ? 'حفظ التعديلات' : 'إضافة الفئة'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <div className="field">
          <label className="text-xs font-bold text-gray-700">اسم الفئة *</label>
          <input
            type="text"
            className="input"
            placeholder="مثال: دجاج لاحم - فئة أ"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label className="text-xs font-bold text-gray-700">نسبة الحافز % (0 - 100) *</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              dir="ltr"
              className="input font-mono text-left font-bold"
              value={incentiveRate}
              onChange={(e) => setIncentiveRate(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="text-xs font-bold text-gray-700">لون الفئة</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-14 cursor-pointer rounded border border-gray-300 p-1"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <span className="font-mono text-xs text-gray-600 uppercase">{color}</span>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer pt-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>فئة نشطة ومتاحة لتعيين العملاء</span>
        </label>
      </div>
    </Modal>
  );
}
