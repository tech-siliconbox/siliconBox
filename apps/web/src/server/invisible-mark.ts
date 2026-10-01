import 'server-only';
import { createHmac } from 'node:crypto';

// A per-learner code hidden in lesson text as zero-width characters. It survives copy and
// paste, so a leaked passage names the account it came from (docs/security/watermarking.md).

const FRAME = '\u2063'; // invisible separator: marks where a code starts and ends
const ZERO = '\u200B'; // zero-width space
const ONE = '\u200C'; // zero-width non-joiner
const CODE_BITS = 32;
const MARK_PATTERN = new RegExp(`${FRAME}([${ZERO}${ONE}]{${CODE_BITS}})${FRAME}`, 'g');

/** Stable 32-bit code for a learner, keyed so it cannot be forged from the user id alone. */
export function markCode(userId: string, secret: string): number {
  return createHmac('sha256', `watermark:v1:${secret}`).update(userId).digest().readUInt32BE(0);
}

function encode(code: number): string {
  const bits = code.toString(2).padStart(CODE_BITS, '0');
  return FRAME + bits.replace(/[01]/g, (bit) => (bit === '1' ? ONE : ZERO)) + FRAME;
}

/** Inserts the code after the first word, where it survives copying any part of the passage start. */
export function embedMark(text: string, code: number): string {
  const cut = text.indexOf(' ');
  const at = cut === -1 ? text.length : cut;
  return text.slice(0, at) + encode(code) + text.slice(at);
}

/** Every code found in pasted text, for tracing a leak. */
export function findMarks(text: string): number[] {
  return [...text.matchAll(MARK_PATTERN)].map(([, marks = '']) =>
    parseInt(
      marks.replace(/./gu, (char) => (char === ONE ? '1' : '0')),
      2,
    ),
  );
}
