import { describe, expect, it } from 'vitest';
import { allowedScreens, defaultScreen, extractPermissionsBundle, type ScreenPermissions, type UserProfile } from './permissions';

function user(allowed: unknown): UserProfile {
  return {
    id: 'u1',
    full_name: 'موظف',
    username: 'emp',
    phone: null,
    role_id: 'r1',
    role_name: 'مسؤول التحصيل',
    status: 'نشط',
    allowed_screens: allowed as UserProfile['allowed_screens'],
    allowed_category_ids: [],
    screen_permissions: {},
  };
}

describe('allowedScreens', () => {
  it('يُبقي المفاتيح الصحيحة فقط', () => {
    expect(allowedScreens(user(['customers', 'followups']))).toEqual(['customers', 'followups']);
  });

  it('يُسقط أي مفتاح لا يقابل شاشة حقيقية', () => {
    // allowed_screens عمود text[] بلا قيد، فقد يحوي مفتاحاً قديماً أو خطأً إملائياً
    expect(allowedScreens(user(['invalid_screen', 'customers', '']))).toEqual(['customers']);
  });

  it('يتحمّل قيمة غير مصفوفة', () => {
    expect(allowedScreens(user(null))).toEqual([]);
    expect(allowedScreens(user('customers'))).toEqual([]);
  });
});

describe('defaultScreen', () => {
  it('يُفضّل لوحة المدير متى كانت مسموحة', () => {
    expect(defaultScreen(user(['customers', 'dashboard']))).toBe('dashboard');
  });

  it('يُرجع أول شاشة مسموحة إن لم تكن اللوحة متاحة', () => {
    expect(defaultScreen(user(['followups', 'customers']))).toBe('followups');
  });

  /**
   * انحدار: كانت تُرجع 'dashboard' لمستخدم لا يملكها، فيرفضها الحارس ويعيد
   * التوجيه إليها ثانية — حلقة لا نهائية تُجمّد التطبيق. الحساب الجديد يُنشأ
   * بـ allowed_screens فارغة، أي أن الحالة كانت واقعية لا نظرية.
   */
  it('يُرجع null لمن لا يملك أي شاشة بدل وجهة مرفوضة', () => {
    expect(defaultScreen(user([]))).toBeNull();
  });

  it('يُرجع null إذا كانت كل المفاتيح غير صالحة', () => {
    expect(defaultScreen(user(['invalid_1', 'unknown']))).toBeNull();
  });
});

describe('extractPermissionsBundle', () => {
  const sourcePermissions: ScreenPermissions = {
    customers: {
      actions: { create: true, edit: false },
      hidden_fields: ['mobile_2', 'guarantor'],
    },
    followups: {
      actions: { create: true },
    },
  };

  const source = {
    role_id: 'role-abc',
    allowed_screens: ['customers', 'followups', 'dashboard'] as UserProfile['allowed_screens'],
    allowed_category_ids: ['cat-1', 'cat-2'],
    screen_permissions: sourcePermissions,
  };

  it('ينسخ الحقول الأربعة بشكل صحيح', () => {
    const bundle = extractPermissionsBundle(source);
    expect(bundle.role_id).toBe('role-abc');
    expect(bundle.allowed_screens).toEqual(['customers', 'followups', 'dashboard']);
    expect(bundle.allowed_category_ids).toEqual(['cat-1', 'cat-2']);
    expect(bundle.screen_permissions).toEqual(sourcePermissions);
  });

  it('يُنتج نسخة عميقة — التعديل لا يؤثر على الأصل', () => {
    const bundle = extractPermissionsBundle(source);

    // تعديل المصفوفات
    bundle.allowed_screens.push('users');
    bundle.allowed_category_ids.push('cat-3');

    // تعديل كائن screen_permissions
    bundle.screen_permissions.customers!.actions!.create = false;
    bundle.screen_permissions.customers!.hidden_fields!.push('status_customer');

    // الأصل لم يتأثر
    expect(source.allowed_screens).toEqual(['customers', 'followups', 'dashboard']);
    expect(source.allowed_category_ids).toEqual(['cat-1', 'cat-2']);
    expect(source.screen_permissions.customers!.actions!.create).toBe(true);
    expect(source.screen_permissions.customers!.hidden_fields).toEqual(['mobile_2', 'guarantor']);
  });

  it('لا تحتوي الحزمة على بيانات شخصية', () => {
    const bundle = extractPermissionsBundle(source) as unknown as Record<string, unknown>;
    expect(bundle).not.toHaveProperty('full_name');
    expect(bundle).not.toHaveProperty('username');
    expect(bundle).not.toHaveProperty('phone');
    expect(bundle).not.toHaveProperty('password');
    expect(Object.keys(bundle)).toEqual([
      'role_id',
      'allowed_screens',
      'allowed_category_ids',
      'screen_permissions',
    ]);
  });
});

describe('settings permissions', () => {
  it('تتضمن قائمة الشاشات شاشة الإعدادات', () => {
    expect(allowedScreens(user(['settings']))).toEqual(['settings']);
  });
});


