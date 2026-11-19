// Reading CVs and job descriptions line by line, shared by the screener and the job match.

/** A bullet mark at the start of a line: •, -, * and the like, or "1." and "1)". */
export const BULLET = /^\s*([•\-*▪●◦‣–]|\d+[.)])\s+/;

/** The text's lines, trimmed, without the blank ones. */
export function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
