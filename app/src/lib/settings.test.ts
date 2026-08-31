import { describe, expect, it } from 'vitest';
import { canManageSettings, roleDefaultAction, type UserProfile } from './permissions';

function makeUser(roleName: UserProfile['role_name']): UserProfile {
  return {
    id: 'user-1',
    full_name: 'مستخدم تجريبي',
    username: 'testuser',
    phone: null,
    role_id: 'r1',
    role_name: roleName,
    status: 'نشط',
    allowed_screens: ['settings'],
    allowed_category_ids: [],
    screen_permissions: {},
  };
}

describe('Settings Access & Permissions', () => {
  it('يسمح لمدير النظام فقط بإدارة وتعديل الإعدادات', () => {
    const admin = makeUser('مدير النظام');
    const accountant = makeUser('المحاسب');
    const collector = makeUser('مسؤول التحصيل');
    const custom = makeUser('مستخدم مخصص');

    expect(canManageSettings(admin)).toBe(true);
    expect(canManageSettings(accountant)).toBe(false);
    expect(canManageSettings(collector)).toBe(false);
    expect(canManageSettings(custom)).toBe(false);
  });

  it('يمنح مدير النظام صلاحية الإجراءات الافتراضية لشاشة الإعدادات', () => {
    expect(roleDefaultAction('مدير النظام', 'settings', 'edit')).toBe(true);
    expect(roleDefaultAction('المحاسب', 'settings', 'edit')).toBe(false);
    expect(roleDefaultAction('مسؤول التحصيل', 'settings', 'edit')).toBe(false);
    expect(roleDefaultAction('مستخدم مخصص', 'settings', 'edit')).toBe(false);
  });
});

describe('Settings Validation Rules', () => {
  function validateSettings(input: {
    company_name?: string;
    system_name?: string;
    exchange_rate_usd?: number;
    exchange_rate_sar?: number;
    days_before_due_alert?: number;
    no_followup_days_limit?: number;
    overdue_alert_days?: number;
    shopping_status_label?: string;
    promise_keyword?: string;
  }) {
    const errors: Record<string, string> = {};

    if (!input.company_name?.trim()) errors.company_name = 'اسم المنشأة مطلوب';
    if (!input.system_name?.trim()) errors.system_name = 'اسم النظام مطلوب';
    if (!input.shopping_status_label?.trim()) errors.shopping_status_label = 'مسمى حالة التسويق مطلوب';
    if (!input.promise_keyword?.trim()) errors.promise_keyword = 'الكلمة المفتاحية لوعد السداد مطلوبة';

    const usd = Number(input.exchange_rate_usd);
    if (!Number.isFinite(usd) || usd <= 0) {
      errors.exchange_rate_usd = 'سعر صرف الدولار يجب أن يكون رقماً موجباً أكبر من صفر';
    }

    const sar = Number(input.exchange_rate_sar);
    if (!Number.isFinite(sar) || sar <= 0) {
      errors.exchange_rate_sar = 'سعر صرف الريال السعودي يجب أن يكون رقماً موجباً أكبر من صفر';
    }

    const dueAlert = Number(input.days_before_due_alert);
    if (!Number.isInteger(dueAlert) || dueAlert < 0) {
      errors.days_before_due_alert = 'أيام التنبيه قبل الاستحقاق يجب أن تكون 0 أو أكثر';
    }

    const noFollow = Number(input.no_followup_days_limit);
    if (!Number.isInteger(noFollow) || noFollow < 1) {
      errors.no_followup_days_limit = 'أيام عدم المتابعة يجب أن تكون 1 على الأقل';
    }

    const overdue = Number(input.overdue_alert_days);
    if (!Number.isInteger(overdue) || overdue < 1) {
      errors.overdue_alert_days = 'عتبة التعثر الشديد يجب أن تكون 1 على الأقل';
    }

    return errors;
  }

  function validateCategoryIncentive(rate: number) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return 'نسبة الحافز يجب أن تكون رقماً بين 0% و 100%';
    }
    return null;
  }

  it('يقبل الإعدادات الصحيحة والمنطقية', () => {
    const valid = {
      company_name: 'مكتب الدكتور أيمن',
      system_name: 'Smart Collection Platform',
      exchange_rate_usd: 530,
      exchange_rate_sar: 141,
      days_before_due_alert: 3,
      no_followup_days_limit: 14,
      overdue_alert_days: 35,
      shopping_status_label: 'يسوق الآن',
      promise_keyword: 'وعد',
    };

    const errors = validateSettings(valid);
    expect(Object.keys(errors).length).toBe(0);
  });

  it('يرفض أسعار الصرف الصفرية أو السالبة', () => {
    const invalidUsd = validateSettings({
      company_name: 'مكتب',
      system_name: 'نظام',
      exchange_rate_usd: -5,
      exchange_rate_sar: 141,
      days_before_due_alert: 3,
      no_followup_days_limit: 14,
      overdue_alert_days: 35,
      shopping_status_label: 'يسوق الآن',
      promise_keyword: 'وعد',
    });
    expect(invalidUsd.exchange_rate_usd).toBeDefined();

    const invalidSar = validateSettings({
      company_name: 'مكتب',
      system_name: 'نظام',
      exchange_rate_usd: 530,
      exchange_rate_sar: 0,
      days_before_due_alert: 3,
      no_followup_days_limit: 14,
      overdue_alert_days: 35,
      shopping_status_label: 'يسوق الآن',
      promise_keyword: 'وعد',
    });
    expect(invalidSar.exchange_rate_sar).toBeDefined();
  });

  it('يرفض عتبات الأيام غير الصالحة', () => {
    const invalidDays = validateSettings({
      company_name: 'مكتب',
      system_name: 'نظام',
      exchange_rate_usd: 530,
      exchange_rate_sar: 141,
      days_before_due_alert: -1,
      no_followup_days_limit: 0,
      overdue_alert_days: 0,
      shopping_status_label: 'يسوق الآن',
      promise_keyword: 'وعد',
    });

    expect(invalidDays.days_before_due_alert).toBeDefined();
    expect(invalidDays.no_followup_days_limit).toBeDefined();
    expect(invalidDays.overdue_alert_days).toBeDefined();
  });

  it('يتحقق من نسبة الحوافز بين 0% و 100%', () => {
    expect(validateCategoryIncentive(0)).toBeNull();
    expect(validateCategoryIncentive(5.5)).toBeNull();
    expect(validateCategoryIncentive(100)).toBeNull();

    expect(validateCategoryIncentive(-1)).toBe('نسبة الحافز يجب أن تكون رقماً بين 0% و 100%');
    expect(validateCategoryIncentive(105)).toBe('نسبة الحافز يجب أن تكون رقماً بين 0% و 100%');
    expect(validateCategoryIncentive(NaN)).toBe('نسبة الحافز يجب أن تكون رقماً بين 0% و 100%');
  });
});
