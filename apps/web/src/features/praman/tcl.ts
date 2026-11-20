/**
 * A word for a Tcl command line: as it is when it is plain, else in braces. Every menu action
 * sends the command a learner would type, so the session's script replays it (ADR 0031).
 */
export function tclWord(word: string): string {
  return /^[A-Za-z0-9_./:!-]+$/.test(word) ? word : `{${word}}`;
}

/** A Tcl command from its words. */
export const tclCommand = (...words: string[]): string => words.map(tclWord).join(' ');
