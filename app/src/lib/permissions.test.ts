import { describe, expect, it } from 'vitest';
import { allowedScreens, defaultScreen, type UserProfile } from './permissions';

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
    expect(allowedScreens(user(['reports', 'customers', '']))).toEqual(['customers']);
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
    expect(defaultScreen(user(['reports', 'unknown']))).toBeNull();
  });
});
