import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { useAdminUserAction, useCategories, useSaveUserPermissions } from '@/lib/queries';
import {
  ACTION_CATALOG,
  FIELD_CATALOG,
  SCREENS,
  SCREEN_LABELS,
  roleDefaultAction,
  type RoleName,
  type ScreenKey,
  type ScreenPermissions,
} from '@/lib/permissions';
import type { AppUser, Role } from '@/types/models';

interface Props {
  existing: AppUser | null;
  roles: Role[];
  onClose: () => void;
}

/**
 * إضافة/تعديل مستخدم وصلاحياته.
 *
 * الإنشاء وتغيير كلمة المرور يمران عبر Edge Function admin-users (تحتاج
 * service_role)، أما الصلاحيات فتُحفظ مباشرة في public.users لأن سياسة RLS
 * تسمح بذلك للمدير فقط.
 *
 * المستخدم الجديد يُنشأ دائماً بحالة "موقوف" — يفعّله المدير بعد ضبط شاشاته
 * وفئاته، فلا يوجد حساب فعّال بلا صلاحيات مضبوطة ولو للحظة.
 */
export function UserModal({ existing, roles, onClose }: Props) {
  const toast = useToast();
  const { data: categories = [] } = useCategories();
  const savePermissions = useSaveUserPermissions();
  const adminAction = useAdminUserAction();

  const isEdit = !!existing;

  const [form, setForm] = useState({
    username: existing?.username ?? '',
    password: '',
    full_name: existing?.full_name ?? '',
    phone: existing?.phone ?? '',
    role_id: existing?.role_id ?? roles[0]?.id ?? '',
  });

  const [screens, setScreens] = useState<ScreenKey[]>(
    existing ? (existing.allowed_screens ?? []) : [...SCREENS],
  );
  const [categoryIds, setCategoryIds] = useState<string[]>(existing?.allowed_category_ids ?? []);
  const [permissions, setPermissions] = useState<ScreenPermissions>(
    existing?.screen_permissions ?? {},
  );

  const roleName = (roles.find((r) => r.id === form.role_id)?.name_role ?? 'مستخدم مخصص') as RoleName;

  const toggleScreen = (key: ScreenKey) =>
    setScreens((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));

  const toggleCategory = (id: string) =>
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  function actionValue(screen: ScreenKey, action: string): boolean {
    const explicit = permissions[screen]?.actions;
    if (explicit && Object.prototype.hasOwnProperty.call(explicit, action)) return !!explicit[action];
    return roleDefaultAction(roleName, screen, action);
  }

  function setAction(screen: ScreenKey, action: string, value: boolean) {
    setPermissions((prev) => ({
      ...prev,
      [screen]: {
        ...prev[screen],
        actions: { ...(prev[screen]?.actions ?? {}), [action]: value },
      },
    }));
  }

  function fieldVisible(screen: ScreenKey, field: string): boolean {
    return !permissions[screen]?.hidden_fields?.includes(field);
  }

  function setFieldVisible(screen: ScreenKey, field: string, visible: boolean) {
    setPermissions((prev) => {
      const hidden = new Set(prev[screen]?.hidden_fields ?? []);
      if (visible) hidden.delete(field);
      else hidden.add(field);
      return { ...prev, [screen]: { ...prev[screen], hidden_fields: [...hidden] } };
    });
  }

  const busy = savePermissions.isPending || adminAction.isPending;

  async function save() {
    if (!form.full_name.trim()) {
      toast.error('الاسم الكامل مطلوب');
      return;
    }

    try {
      if (isEdit) {
        await savePermissions.mutateAsync({
          id: existing.id,
          values: {
            full_name: form.full_name.trim(),
            phone: form.phone.trim() || null,
            role_id: form.role_id,
            allowed_screens: screens,
            allowed_category_ids: categoryIds,
            screen_permissions: permissions,
          },
        });

        if (form.password) {
          await adminAction.mutateAsync({
            action: 'reset_password',
            user_id: existing.id,
            password: form.password,
          });
        }
        toast.show('تم حفظ الصلاحيات');
      } else {
        if (!/^[a-zA-Z0-9._-]{3,40}$/.test(form.username)) {
          toast.error('اسم المستخدم: حروف إنجليزية وأرقام فقط (3-40 خانة)');
          return;
        }
        if (form.password.length < 8) {
          toast.error('كلمة المرور يجب ألا تقل عن 8 خانات');
          return;
        }

        const created = (await adminAction.mutateAsync({
          action: 'create',
          username: form.username,
          password: form.password,
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          role_id: form.role_id,
        })) as { id: string };

        await savePermissions.mutateAsync({
          id: created.id,
          values: {
            allowed_screens: screens,
            allowed_category_ids: categoryIds,
            screen_permissions: permissions,
          },
        });
        toast.show('تم إنشاء المستخدم — فعّله من زر «تنشيط» بعد مراجعة صلاحياته');
      }
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Modal
      open
      wide
      title={isEdit ? `تعديل — ${existing.full_name}` : 'مستخدم جديد'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <div className="field">
          <label>الاسم الكامل</label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />
          {!isEdit && (
            <p className="mt-1 text-[11px] text-gray-500">
              اكتبه مطابقاً لاسم المسؤول في ملف Excel ليُربط عملاؤه تلقائياً عند الاستيراد.
            </p>
          )}
        </div>
        <div className="field">
          <label>اسم المستخدم (للدخول)</label>
          <input
            type="text"
            dir="ltr"
            className="text-left"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            disabled={isEdit}
          />
        </div>
        <div className="field">
          <label>الجوال</label>
          <input
            type="tel"
            dir="ltr"
            className="text-left"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>الدور</label>
          <select
            value={form.role_id}
            onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name_role}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>{isEdit ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور'}</label>
        <input
          type="password"
          dir="ltr"
          className="text-left"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          placeholder="8 خانات على الأقل"
        />
      </div>

      {/* -------------------------------------------------- الشاشات */}
      <h3 className="mb-2 mt-4 border-t border-gray-100 pt-3.5 text-[13px] font-bold">
        الشاشات المسموحة
      </h3>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {SCREENS.map((key) => (
          <label key={key} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={screens.includes(key)}
              onChange={() => toggleScreen(key)}
            />
            {SCREEN_LABELS[key]}
          </label>
        ))}
      </div>

      {/* -------------------------------------------------- الفئات */}
      <h3 className="mb-2 text-[13px] font-bold">فئات العملاء المسموحة</h3>
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1.5">
        {categories.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={categoryIds.includes(c.id)}
              onChange={() => toggleCategory(c.id)}
            />
            {c.category_name}
          </label>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-gray-500">
        عدم اختيار أي فئة يعني السماح بكل الفئات.
      </p>

      {/* -------------------------------------------------- الإجراءات والأعمدة */}
      <h3 className="mb-2 text-[13px] font-bold">صلاحيات دقيقة لكل شاشة</h3>
      <p className="mb-2 text-[11px] text-gray-500">
        الإجراءات غير المحدَّدة تتبع افتراضي الدور «{roleName}». إخفاء الأعمدة تجميلي فقط ولا يمنع
        قراءة الحقل عبر واجهة البيانات.
      </p>

      <div className="space-y-2">
        {SCREENS.filter((s) => ACTION_CATALOG[s] || FIELD_CATALOG[s]).map((screen) => {
          const actions = ACTION_CATALOG[screen] ?? [];
          const fields = FIELD_CATALOG[screen] ?? [];
          return (
            <div key={screen} className="rounded-md border border-gray-200 px-3 py-2.5">
              <div className="mb-2 text-[12.5px] font-bold">{SCREEN_LABELS[screen]}</div>

              {actions.length > 0 && (
                <>
                  <div className="mb-1.5 text-[11px] font-semibold text-gray-500">
                    الإجراءات المسموحة
                  </div>
                  <div className="mb-2.5 flex flex-wrap gap-x-3.5 gap-y-1">
                    {actions.map((a) => (
                      <label key={a.key} className="flex items-center gap-1.5 text-xs font-normal">
                        <input
                          type="checkbox"
                          checked={actionValue(screen, a.key)}
                          onChange={(e) => setAction(screen, a.key, e.target.checked)}
                        />
                        {a.label}
                      </label>
                    ))}
                  </div>
                </>
              )}

              {fields.length > 0 && (
                <>
                  <div className="mb-1.5 text-[11px] font-semibold text-gray-500">
                    الأعمدة الظاهرة في الجدول
                  </div>
                  <div className="flex flex-wrap gap-x-3.5 gap-y-1">
                    {fields.map((f) => (
                      <label key={f.key} className="flex items-center gap-1.5 text-xs font-normal">
                        <input
                          type="checkbox"
                          checked={fieldVisible(screen, f.key)}
                          onChange={(e) => setFieldVisible(screen, f.key, e.target.checked)}
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
