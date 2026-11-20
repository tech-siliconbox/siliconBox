import type { PramanSnapshot } from './praman-snapshot';
import { tclCommand, tclList, tclWord } from './tcl';

// The Tcl lines the deeper checks' dialogs run, as a learner would type them (ADR 0031).

type Files = PramanSnapshot['files'];

/** Files a revised design may be in: design files the session has not analyzed. */
export const revisedCandidates = (files: Files) =>
  files.filter((file) => /\.(sv|v)$/i.test(file.name) && !file.analyzed).map((file) => file.name);

/** Spreadsheets of connections (one per row: name, source, destination, condition, latency). */
export const connectivitySheets = (files: Files) =>
  files.filter((file) => /\.(csv|tsv|txt)$/i.test(file.name)).map((file) => file.name);

export function equivalenceLine(revised: readonly string[], bounded: boolean): string {
  const line = `check_equivalence -revised ${tclList(revised)}`;
  return bounded ? `${line} -bounded` : line;
}

export const connectivityLine = (sheet: string) => tclCommand('check_conn', '-load', sheet);

/** A task's name is a Tcl identifier. */
export const TASK_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A task: the properties copied into it, its own assumptions, and whether it is current. */
export function taskLine(
  name: string,
  copy: readonly string[],
  copyAssumes: boolean,
  makeCurrent: boolean,
): string {
  return [
    tclCommand('task', '-create', name),
    copy.length > 0 ? `-copy ${tclList(copy)}` : '',
    copyAssumes ? '-copy_assumes' : '',
    makeCurrent ? '-set' : '',
  ]
    .filter((part) => part !== '')
    .join(' ');
}

/** A register's path from the top: names, dots and bit indexes. */
export const REGISTER = /^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*|\[\d+\])*$/;

export type Abstraction = 'init_value' | 'counter';

export const abstractLine = (kind: Abstraction, register: string) =>
  `abstract -${kind} ${tclWord(register)}`;

export type SplitKind = 'lowest_bit' | 'values' | 'cases';

/** A case split of an assertion; null until the expression (or a case) is given. */
export function caseSplitLine(property: string, kind: SplitKind, text: string): string | null {
  const head = `case_split -property ${tclWord(property)}`;
  if (kind === 'cases') {
    const cases = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    return cases.length === 0 ? null : `${head} -cases ${tclList(cases)}`;
  }
  const expression = text.trim().replace(/\s+/g, ' ');
  return expression === '' ? null : `${head} -${kind} ${tclWord(expression)}`;
}
