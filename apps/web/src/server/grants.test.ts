import { describe, expect, it } from 'vitest';
import { type AdminGrant, buildAdminGrant } from './grants';

// Matrix row 22: an admin extends or shortens a window; a reason is required; it is audited.
const NOW = new Date('2026-11-15T10:00:00.000Z');
const grant: AdminGrant = {
  userId: 'learner-test-1',
  kind: 'content',
  level: 'basic',
  startsAt: new Date('2026-11-15T10:00:00.000Z'),
  endsAt: new Date('2027-02-15T10:00:00.000Z'),
  reason: 'Support ticket 42: course access extended',
  actorId: 'admin-test-1',
};

describe('buildAdminGrant', () => {
  it('builds the admin-sourced window and an audit entry with the reason', () => {
    const { entitlement, audit } = buildAdminGrant(grant, NOW);
    expect(entitlement).toEqual({
      userId: 'learner-test-1',
      kind: 'content',
      level: 'basic',
      source: 'admin',
      reason: grant.reason,
      startsAt: grant.startsAt,
      endsAt: grant.endsAt,
    });
    expect(audit).toMatchObject({
      action: 'entitlement_change',
      actorId: 'admin-test-1',
      subjectId: 'learner-test-1',
      reason: grant.reason,
      createdAt: NOW,
    });
  });

  it('builds a tool window without a level', () => {
    const { entitlement } = buildAdminGrant({ ...grant, kind: 'tool', level: null }, NOW);
    expect(entitlement).not.toHaveProperty('level');
  });

  it.each([
    ['no reason', { ...grant, reason: '  ' }],
    ['a content grant without a level', { ...grant, level: null }],
    ['a window that ends before it starts', { ...grant, endsAt: new Date('2026-01-01') }],
  ])('refuses %s', (_label, invalid) => {
    expect(() => buildAdminGrant(invalid, NOW)).toThrow();
  });
});
