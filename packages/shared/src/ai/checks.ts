import { EMAIL, WEB_LINK, phoneNumbers } from '../cv-screening/personal-data';
import { REDACTED } from '../cv-screening/redact';

// Checks every AI answer passes before it is kept or shown (ADR 0030): no personal data, no
// invented numbers, nothing the posting did not ask for, and text within its limits.

/** Contact details, links or our own placeholders: none may appear in an AI answer. */
export function hasPersonalData(value: string): boolean {
  return (
    EMAIL.test(value) ||
    WEB_LINK.test(value) ||
    phoneNumbers(value).length > 0 ||
    Object.values(REDACTED).some((mark) => value.includes(mark))
  );
}

/** A rewrite may not bring a number its source does not have: that would invent a result. */
export function addsNumbers(rewrite: string, source: string): boolean {
  return (rewrite.match(/\d+(?:[.,]\d+)?/g) ?? []).some((number) => !source.includes(number));
}

const GENERIC_WORDS = new Set(
  'and the for with experience strong good solid knowledge skills skill ability understanding familiarity working using hands-on exposure of in to a an or on'.split(
    ' ',
  ),
);
export const wordsOf = (value: string) =>
  value.toLowerCase().match(/[a-z0-9+#]+(?:[-.][a-z0-9+#]+)*/g) ?? [];

/** Whether `need` names something the posting itself asks for, not something the model came up with. */
export function inPosting(need: string, posting: string): boolean {
  const postingWords = new Set(wordsOf(posting));
  return wordsOf(need).some((word) => !GENERIC_WORDS.has(word) && postingWords.has(word));
}

/** At most `max` characters, cut at a word with an ellipsis. */
export function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const head = trimmed.slice(0, max - 1);
  return `${head.slice(0, Math.max(head.lastIndexOf(' '), 1))}…`;
}
