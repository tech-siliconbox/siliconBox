import 'server-only';
import type { Identity } from './auth/authenticate';

/**
 * The visible mark tiled over a signed-in learner's pages: a short id, an email fragment
 * and the date, enough to trace a leak without printing the full address.
 */
export function visibleMark(identity: Pick<Identity, 'userId' | 'email'>, now: Date): string {
  const [local = '', domain = ''] = identity.email.split('@');
  const emailFragment = `${local.slice(0, 3)}…@${domain}`;
  return `${identity.userId.slice(-6)} · ${emailFragment} · ${now.toISOString().slice(0, 10)}`;
}

export type VisibleMarkParts = { shortId: string; emailPrefix: string; domain: string };

// The visible mark as read off a screenshot: "ab34cd · pri…@example.test · 2026-11-15".
// Lenient about spacing, since marks are often retyped from an image.
const VISIBLE_MARK = /\b([0-9a-f]{6})\s*·\s*([^\s·@…]{0,3})…@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

/** Every visible mark found in the text, once each. */
export function parseVisibleMarks(text: string): VisibleMarkParts[] {
  const found = new Map<string, VisibleMarkParts>();
  for (const [whole, shortId = '', emailPrefix = '', domain = ''] of text.matchAll(VISIBLE_MARK)) {
    found.set(whole, { shortId, emailPrefix, domain: domain.toLowerCase() });
  }
  return [...found.values()];
}
