import { describe, expect, it } from 'vitest';
import { EntitlementSchema } from './entitlement';

const valid = {
  userId: 'learner-test-1',
  kind: 'content',
  level: 'basic',
  source: 'order',
  orderId: 'order-1',
  startsAt: new Date('2026-11-15T10:00:00.000Z'),
  endsAt: new Date('2027-02-15T10:00:00.000Z'),
};

describe('EntitlementSchema', () => {
  it('accepts a content entitlement from an order', () => {
    expect(EntitlementSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a tool entitlement from an admin grant with a reason', () => {
    const { level: _level, orderId: _orderId, ...rest } = valid;
    const toolGrant = { ...rest, kind: 'tool', source: 'admin', reason: 'Support ticket 42' };
    expect(EntitlementSchema.safeParse(toolGrant).success).toBe(true);
  });

  it.each([
    ['an unknown field', { ...valid, price: 1 }],
    ['a MongoDB operator as a value', { ...valid, userId: { $ne: null } }],
    ['an admin grant without a reason', { ...valid, source: 'admin' }],
    ['a level on a tool entitlement', { ...valid, kind: 'tool' }],
    ['a window that ends before it starts', { ...valid, endsAt: new Date('2026-01-01') }],
    ['an unknown level', { ...valid, level: 'expert' }],
  ])('rejects %s', (_label, input) => {
    expect(EntitlementSchema.safeParse(input).success).toBe(false);
  });
});
