import { describe, expect, it } from 'vitest';
import type { Entitlement } from '../schemas/entitlement';
import { contentHeld, toolHeld } from '../testing/entitlements';
import { type ProtectedResource, type Viewer, decideAccess } from './access';

// Rows 11-16 of docs/testing/entitlement-test-matrix.md.
const NOW = new Date('2026-11-15T10:00:00.000Z');
const ACTIVE = ['2026-10-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'] as const;
const ENDED = ['2026-06-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'] as const;

const firstLesson: ProtectedResource = { kind: 'lesson', level: 'basic', isPreview: true };
const basicLesson: ProtectedResource = { kind: 'lesson', level: 'basic', isPreview: false };
const basicDrill: ProtectedResource = { kind: 'drill', level: 'basic' };
const advanceLesson: ProtectedResource = { kind: 'lesson', level: 'advance', isPreview: false };
const advanceDrill: ProtectedResource = { kind: 'drill', level: 'advance' };
const answer: ProtectedResource = { kind: 'answer' };
const careerTool: ProtectedResource = { kind: 'careerTool' };

const signedIn = (...entitlements: Entitlement[]): Viewer => ({ entitlements });
const allowed = (resource: ProtectedResource, viewer: Viewer) =>
  decideAccess(resource, viewer, NOW).allowed;

describe('access matrix', () => {
  it('row 11: no account sees nothing beyond the public outline', () => {
    for (const resource of [firstLesson, basicLesson, basicDrill, answer, careerTool]) {
      expect(decideAccess(resource, null, NOW)).toEqual({
        allowed: false,
        reason: 'UNAUTHENTICATED',
      });
    }
  });

  it('row 12: signed in with nothing bought opens only the first lesson', () => {
    const viewer = signedIn();
    expect(allowed(firstLesson, viewer)).toBe(true);
    expect(decideAccess(basicLesson, viewer, NOW)).toEqual({
      allowed: false,
      reason: 'NOT_ENTITLED',
    });
    expect(allowed(basicDrill, viewer)).toBe(false);
    expect(allowed(answer, viewer)).toBe(false);
    expect(allowed(careerTool, viewer)).toBe(false);
  });

  it('row 13: content active, tool ended', () => {
    const viewer = signedIn(contentHeld('basic', ...ACTIVE), toolHeld(...ENDED));
    expect(allowed(basicLesson, viewer)).toBe(true);
    expect(allowed(basicDrill, viewer)).toBe(false);
    expect(allowed(answer, viewer)).toBe(true);
    expect(allowed(careerTool, viewer)).toBe(true);
  });

  it('row 14: content ended, tool active', () => {
    const viewer = signedIn(contentHeld('basic', ...ENDED), toolHeld(...ACTIVE));
    expect(allowed(basicLesson, viewer)).toBe(false);
    expect(allowed(basicDrill, viewer)).toBe(false);
    expect(allowed(answer, viewer)).toBe(false);
    expect(allowed(careerTool, viewer)).toBe(false);
  });

  it('row 15: another level is active', () => {
    const viewer = signedIn(contentHeld('basic', ...ACTIVE), toolHeld(...ACTIVE));
    expect(allowed(basicLesson, viewer)).toBe(true);
    expect(allowed(basicDrill, viewer)).toBe(true);
    expect(allowed(advanceLesson, viewer)).toBe(false);
    expect(allowed(advanceDrill, viewer)).toBe(false);
    expect(allowed(answer, viewer)).toBe(true);
    expect(allowed(careerTool, viewer)).toBe(true);
  });

  it('row 16: every window ended locks everything but the first lesson', () => {
    const viewer = signedIn(contentHeld('basic', ...ENDED), toolHeld(...ENDED));
    expect(allowed(firstLesson, viewer)).toBe(true);
    for (const resource of [basicLesson, basicDrill, answer, careerTool]) {
      expect(allowed(resource, viewer)).toBe(false);
    }
  });
});
