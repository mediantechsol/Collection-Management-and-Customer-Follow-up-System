import { useState } from 'react';
import { useProfile } from '@/features/auth/AuthContext';
import {
  useActivityLogs,
  useAdminUserAction,
  useCategories,
  useRoles,
  useSaveUserPermissions,
  useUsers,
} from '@/lib/queries';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pill } from '@/components/ui/Pill';
import { IconPlus } from '@/components/ui/Icons';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { UserModal } from './UserModal';
import { ActivityLogTable } from '@/features/common/ActivityLogTable';
import {
  SCREENS,
  SCREEN_LABELS,
  extractPermissionsBundle,
  isAdmin,
  screenAction,
  visibleFields,
} from '@/lib/permissions';
import type { AppUser } from '@/types/models';

/* ============================================================ مودال نسخ الصلاحيات إلى مستخدم آخر */

function CopyPermissionsModal({
  source,
  allUsers,
  onClose,
}: {
  source: AppUser;
  allUsers: AppUser[];
  onClose: () => void;
}) {
  const toast = useToast();
  const savePermissions = useSaveUserPermissions();
  const [targetId, setTargetId] = useState('');

  const targets = allUsers.filter((u) => u.id !== source.id && u.status === 'نشط');

  async function handleCopy() {
    const target = allUsers.find((u) => u.id === targetId);
    if (!target) return;

    const bundle = extractPermissionsBundle(source);

    try {
      await savePermissions.mutateAsync({
        id: target.id,
        values: {
          role_id: bundle.role_id,
          allowed_screens: bundle.allowed_screens,
          allowed_category_ids: bundle.allowed_category_ids,
          screen_permissions: bundle.screen_permissions,
        },
      });
      toast.show(`تم نسخ صلاحيات ${source.full_name} إلى ${target.full_name} بنجاح`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Modal
      open
      title={`نسخ صلاحيات ${source.full_name} إلى…`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!targetId || savePermissions.isPending}
            onClick={() => void handleCopy()}
          >
            {savePermissions.isPending ? 'جارٍ النسخ…' : 'نسخ وحفظ'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>اختر المستخدم المستهدف</label>
        <select
          id="copy-target-select"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">اختر مستخدم…</option>
          {targets.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} ({u.username})
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-gray-500">
        سيتم نسخ الدور والشاشات المسموحة وفئات العملاء ومصفوفة الصلاحيات الدقيقة وحفظها فوراً.
      </p>
    </Modal>
  );
}

/* ============================================================ شاشة المستخدمين */

/**
 * المستخدمون والصلاحيات.
 *
 * لا يوجد زر حذف مستخدم إطلاقاً — العميل اشترط صراحة: "منع حذف المستخدمين
 * الذين غادروا العمل؛ بل يتم إيقاف الحساب للحفاظ على سجل أعمالهم التاريخي".
 * الإيقاف هنا يوقف حساب المصادقة نفسه، لا مجرد علامة في الجدول.
 */
export function UsersScreen() {
  const profile = useProfile();
  const toast = useToast();

  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();
  const { data: categories = [] } = useCategories();
  const { data: logs = [] } = useActivityLogs(20);
  const adminAction = useAdminUserAction();

  const [modal, setModal] = useState<{ open: boolean; existing: AppUser | null }>({
    open: false,
    existing: null,
  });

  const [copySource, setCopySource] = useState<AppUser | null>(null);

  const canCreate = screenAction(profile, 'users', 'create');
  const canEdit = screenAction(profile, 'users', 'edit');
  const canDeactivate = screenAction(profile, 'users', 'deactivate');
  const fields = visibleFields(profile, 'users');
  const showCopyAction = isAdmin(profile);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name_role ?? '—';

  async function toggleStatus(u: AppUser) {
    const next = u.status === 'نشط' ? 'موقوف' : 'نشط';
    if (u.id === profile.id && next === 'موقوف') {
      toast.error('لا يمكنك إيقاف حسابك أنت');
      return;
    }
    try {
      await adminAction.mutateAsync({ action: 'set_status', user_id: u.id, status: next });
      toast.show(next === 'نشط' ? 'تم تنشيط الحساب' : 'تم إيقاف الحساب');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const allColumns: Record<string, Column<AppUser>> = {
    full_name: {
      key: 'full_name',
      label: 'الاسم',
      render: (u) => <span className="font-semibold">{u.full_name}</span>,
      hideOnCard: true,
    },
    username: {
      key: 'username',
      label: 'اسم المستخدم',
      render: (u) => (
        <span className="mono" dir="ltr">
          {u.username}
        </span>
      ),
    },
    role: {
      key: 'role',
      label: 'الدور',
      render: (u) => <Pill tone="blue">{roleName(u.role_id)}</Pill>,
    },
    screens: {
      key: 'screens',
      label: 'الشاشات المسموحة',
      render: (u) => {
        const list = u.allowed_screens ?? [];
        const label =
          list.length === SCREENS.length
            ? 'كل الشاشات'
            : list.map((s) => SCREEN_LABELS[s] ?? s).join('، ') || 'لا شيء';
        return <span className="text-[11.5px] text-gray-600">{label}</span>;
      },
    },
    categories: {
      key: 'categories',
      label: 'فئات العملاء المسموحة',
      render: (u) => {
        const ids = u.allowed_category_ids ?? [];
        const label = ids.length
          ? ids.map((id) => categories.find((c) => c.id === id)?.category_name ?? id).join('، ')
          : 'كل الفئات';
        return <span className="text-[11.5px] text-gray-600">{label}</span>;
      },
    },
    status: {
      key: 'status',
      label: 'الحالة',
      render: (u) =>
        u.status === 'نشط' ? <Pill tone="green">نشط</Pill> : <Pill tone="gray">موقوف</Pill>,
    },
  };

  const columns = fields.map((f) => allColumns[f.key]).filter(Boolean);

  return (
    <>
      {canCreate && (
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModal({ open: true, existing: null })}
          >
            <IconPlus />
            مستخدم جديد
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={users}
        keyOf={(u) => u.id}
        cardTitle={(u) => u.full_name}
        loading={isLoading}
        empty="لا يوجد مستخدمون"
        actions={
          canEdit || canDeactivate || showCopyAction
            ? (u) => (
                <>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setModal({ open: true, existing: u })}
                    >
                      تعديل الصلاحيات
                    </button>
                  )}
                  {showCopyAction && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setCopySource(u)}
                    >
                      نسخ الصلاحيات إلى…
                    </button>
                  )}
                  {canDeactivate && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => void toggleStatus(u)}
                      disabled={adminAction.isPending}
                    >
                      {u.status === 'نشط' ? 'إيقاف' : 'تنشيط'}
                    </button>
                  )}
                </>
              )
            : undefined
        }
      />

      <h2 className="section-title">سجل العمليات</h2>
      <ActivityLogTable logs={logs} />

      {modal.open && (
        <UserModal
          existing={modal.existing}
          roles={roles}
          allUsers={users}
          onClose={() => setModal({ open: false, existing: null })}
        />
      )}

      {copySource && (
        <CopyPermissionsModal
          source={copySource}
          allUsers={users}
          onClose={() => setCopySource(null)}
        />
      )}
    </>
  );
}
