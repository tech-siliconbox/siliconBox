import { BULLET, nonEmptyLines } from './lines';
import { EMAIL, PERSONAL_DETAILS, WEB_LINK, phoneNumbers } from './personal-data';

// Before a CV's text goes to the AI provider, what identifies the learner is replaced with
// placeholders (ADR 0030): feedback on the writing needs none of it.

export const REDACTED = {
  name: '[NAME]',
  email: '[EMAIL]',
  phone: '[PHONE]',
  link: '[LINK]',
  personal: '[personal detail removed]',
} as const;

/** Lines shorter than this are headings or fragments, not passages worth rewriting. */
const MIN_PASSAGE_WORDS = 6;
const MAX_PASSAGE_CHARS = 600;
const MAX_PASSAGES = 60;
const MIN_NAME_PART = 3;

const everywhere = (pattern: RegExp) => new RegExp(pattern.source, `${pattern.flags}g`);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The account name and each longer part of it, as whole words in any case. */
function namePattern(learnerName: string): RegExp | null {
  const parts = learnerName.split(/\s+/).filter((part) => part.length >= MIN_NAME_PART);
  const names = [learnerName.trim(), ...parts].filter((name) => name !== '').map(escapeRegExp);
  return names.length === 0 ? null : new RegExp(`(?<!\\p{L})(${names.join('|')})(?!\\p{L})`, 'giu');
}

/** A CV usually opens with the person's name: one to four words of letters, nothing else. */
export const looksLikeName = (line: string) =>
  /^\p{Lu}[\p{L}.'’-]*(\s+\p{Lu}[\p{L}.'’-]*){0,3}$/u.test(line);

/** The CV's text with the learner's name, contact details, links and personal details removed. */
export function redactCv(text: string, learnerName: string): string {
  const name = namePattern(learnerName);
  let firstLine = true;
  const lines = text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (trimmed === '') return line;
    const isFirst = firstLine;
    firstLine = false;
    if (PERSONAL_DETAILS.test(trimmed)) return REDACTED.personal;
    if (isFirst && looksLikeName(trimmed)) return REDACTED.name;
    return line;
  });
  let redacted = lines
    .join('\n')
    .replace(everywhere(EMAIL), REDACTED.email)
    .replace(everywhere(WEB_LINK), REDACTED.link);
  for (const phone of phoneNumbers(redacted)) redacted = redacted.replace(phone, REDACTED.phone);
  return name === null ? redacted : redacted.replace(name, REDACTED.name);
}

/** Words with a letter, leaving out placeholders and separators such as "|". */
const realWords = (line: string) =>
  line.replace(/\[[^\]]*\]/g, ' ').match(/\p{L}[\p{L}\p{N}+#.'’-]*/gu)?.length ?? 0;

/** The lines worth rewriting, numbered P1, P2… so feedback can point at one exactly. */
export function cvPassages(redactedText: string): Map<string, string> {
  const passages = nonEmptyLines(redactedText)
    .map((line) => line.replace(BULLET, '').slice(0, MAX_PASSAGE_CHARS))
    .filter((line) => realWords(line) >= MIN_PASSAGE_WORDS)
    .slice(0, MAX_PASSAGES);
  return new Map(passages.map((passage, index) => [`P${index + 1}`, passage]));
}
