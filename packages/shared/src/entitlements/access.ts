import type { ErrorCode } from '../errors';
import type { Entitlement } from '../schemas/entitlement';
import type { Level } from '../schemas/level';
import { isActive } from './window';

/** A signed-in learner's entitlements, or null when nobody is signed in. */
export type Viewer = { entitlements: readonly Entitlement[] } | null;

export type ProtectedResource =
  | { kind: 'lesson'; level: Level; isPreview: boolean }
  | { kind: 'drill'; level: Level }
  | { kind: 'answer' }
  | { kind: 'careerTool' };

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: Extract<ErrorCode, 'UNAUTHENTICATED' | 'NOT_ENTITLED'> };

export function decideAccess(
  resource: ProtectedResource,
  viewer: Viewer,
  now: Date,
): AccessDecision {
  if (viewer === null) return { allowed: false, reason: 'UNAUTHENTICATED' };
  return isGranted(resource, viewer.entitlements, now)
    ? { allowed: true }
    : { allowed: false, reason: 'NOT_ENTITLED' };
}

function isGranted(
  resource: ProtectedResource,
  entitlements: readonly Entitlement[],
  now: Date,
): boolean {
  switch (resource.kind) {
    case 'lesson':
      return resource.isPreview || hasContent(entitlements, now, resource.level);
    case 'drill':
      return hasContent(entitlements, now, resource.level) && hasTool(entitlements, now);
    case 'answer':
    case 'careerTool':
      return hasContent(entitlements, now);
  }
}

/** Any active content window, or one for `level` when given. */
function hasContent(entitlements: readonly Entitlement[], now: Date, level?: Level): boolean {
  return entitlements.some(
    (e) => e.kind === 'content' && (level === undefined || e.level === level) && isActive(e, now),
  );
}

function hasTool(entitlements: readonly Entitlement[], now: Date): boolean {
  return entitlements.some((e) => e.kind === 'tool' && isActive(e, now));
}
