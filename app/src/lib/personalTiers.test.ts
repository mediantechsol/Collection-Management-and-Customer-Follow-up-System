import { describe, expect, it } from 'vitest';
import type { PersonalTierKey, CustomerPersonalAssignment } from '@/types/models';

describe('Personal Tier Classification Models & Logic', () => {
  const DEFAULT_TIERS: Array<{ key: PersonalTierKey; name: string; color: string; sort_order: number }> = [
    { key: 'A', name: 'فئة أ (أولوية عالية)', color: '#EF4444', sort_order: 1 },
    { key: 'B', name: 'فئة ب (متابعة نشطة)', color: '#F59E0B', sort_order: 2 },
    { key: 'C', name: 'فئة ج (وعود ومستقر)', color: '#3B82F6', sort_order: 3 },
    { key: 'D', name: 'فئة د (عام / غير مصنف)', color: '#6B7280', sort_order: 4 },
  ];

  it('validates default personal tier keys and structure', () => {
    expect(DEFAULT_TIERS).toHaveLength(4);
    expect(DEFAULT_TIERS.map((t) => t.key)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('resolves fallback tier D when customer has no explicit assignment', () => {
    const assignments: CustomerPersonalAssignment[] = [
      {
        id: '1',
        user_id: 'user-1',
        customer_id: 'cust-100',
        tier_key: 'A',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const getCustomerTier = (customerId: string): PersonalTierKey => {
      const match = assignments.find((a) => a.customer_id === customerId);
      return match ? match.tier_key : 'D';
    };

    expect(getCustomerTier('cust-100')).toBe('A');
    expect(getCustomerTier('cust-200')).toBe('D');
  });

  it('allows matching tier settings by tier key', () => {
    const tierMap = new Map(DEFAULT_TIERS.map((t) => [t.key, t]));
    expect(tierMap.get('A')?.color).toBe('#EF4444');
    expect(tierMap.get('D')?.name).toBe('فئة د (عام / غير مصنف)');
  });

  it('validates tier name length and trimming constraints', () => {
    const validateTierName = (name: string): { valid: boolean; error?: string } => {
      const trimmed = name.trim();
      if (!trimmed) return { valid: false, error: 'لا يمكن أن يكون فارغاً' };
      if (trimmed.length > 30) return { valid: false, error: 'يجب ألا يتجاوز 30 حرفاً' };
      return { valid: true };
    };

    expect(validateTierName('').valid).toBe(false);
    expect(validateTierName('   ').valid).toBe(false);
    expect(validateTierName('فئة VIP ممتازة').valid).toBe(true);
    expect(validateTierName('أ'.repeat(31)).valid).toBe(false);
    expect(validateTierName('أ'.repeat(30)).valid).toBe(true);
  });

  it('aggregates tier counts accurately with default tier D fallback', () => {
    const customers = [
      { id: 'c1', is_active: true },
      { id: 'c2', is_active: true },
      { id: 'c3', is_active: true },
      { id: 'c4', is_active: false }, // غير نشط يجب ألا يُحسب
    ];

    const assignments: CustomerPersonalAssignment[] = [
      { id: '1', user_id: 'u1', customer_id: 'c1', tier_key: 'A', created_at: '', updated_at: '' },
      { id: '2', user_id: 'u1', customer_id: 'c2', tier_key: 'B', created_at: '', updated_at: '' },
    ];

    const assignmentMap = new Map(assignments.map((a) => [a.customer_id, a.tier_key]));

    const counts: Record<PersonalTierKey | 'ALL', number> = {
      ALL: 0,
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    };

    const activeCusts = customers.filter((c) => c.is_active);
    counts.ALL = activeCusts.length;
    for (const c of activeCusts) {
      const tier = assignmentMap.get(c.id) ?? 'D';
      counts[tier] = (counts[tier] ?? 0) + 1;
    }

    expect(counts.ALL).toBe(3);
    expect(counts.A).toBe(1);
    expect(counts.B).toBe(1);
    expect(counts.C).toBe(0);
    expect(counts.D).toBe(1); // c3 لم يُعيّن صراحة فيُحسب ضمن D
  });

  it('filters customers list by selected personal tier tab', () => {
    const customers = [
      { id: 'c1', is_active: true },
      { id: 'c2', is_active: true },
      { id: 'c3', is_active: true },
    ];

    const assignmentMap = new Map<string, PersonalTierKey>([
      ['c1', 'A'],
      ['c2', 'B'],
    ]);

    const filterByTier = (selected: PersonalTierKey | 'ALL') =>
      customers.filter((c) => {
        if (selected === 'ALL') return true;
        const tier = assignmentMap.get(c.id) ?? 'D';
        return tier === selected;
      });

    expect(filterByTier('ALL')).toHaveLength(3);
    expect(filterByTier('A')).toEqual([{ id: 'c1', is_active: true }]);
    expect(filterByTier('D')).toEqual([{ id: 'c3', is_active: true }]);
    expect(filterByTier('C')).toHaveLength(0);
  });
});
