import { useState } from 'react';
import { useProfile } from '@/features/auth/AuthContext';
import {
  useActivityLogs,
  useAdminUserAction,
  useCategories,
  useRoles,
  useUsers,
} from '@/lib/queries';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pill } from '@/components/ui/Pill';
import { IconPlus } from '@/components/ui/Icons';
import { errorMessage, useToast } from '@/components/ui/Toast';
import { UserModal } from './UserModal';
import { ActivityLogTable } from '@/features/common/ActivityLogTable';
import { SCREENS, SCREEN_LABELS, screenAction, visibleFields } from '@/lib/permissions';
import type { AppUser } from '@/types/models';

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

  const canCreate = screenAction(profile, 'users', 'create');
  const canEdit = screenAction(profile, 'users', 'edit');
  const canDeactivate = screenAction(profile, 'users', 'deactivate');
  const fields = visibleFields(profile, 'users');

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
          canEdit || canDeactivate
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
          onClose={() => setModal({ open: false, existing: null })}
        />
      )}
    </>
  );
}
