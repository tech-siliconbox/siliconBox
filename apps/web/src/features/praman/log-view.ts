import type { ToolEvent } from '@siliconbox/shared';

/** The groups the log's chips show or hide. Engine detail is off until asked for. */
const LOG_GROUPS = ['error', 'warning', 'info', 'cmd', 'engine'] as const;
export type LogGroup = (typeof LOG_GROUPS)[number];
export type LogFilter = Readonly<Record<LogGroup, boolean>>;

export const DEFAULT_LOG_FILTER: LogFilter = {
  error: true,
  warning: true,
  info: true,
  cmd: true,
  engine: false,
};

/** Lines drawn in the page; older ones stay in the session's log and script. */
const LOG_LINES_SHOWN = 4_000;

const TAG: Readonly<Record<string, string>> = { warning: 'WARNING', error: 'ERROR' };

/** The group a log line belongs to; null for lines the page never shows (the menu's own). */
function groupOf(kind: string): LogGroup | null {
  if (kind === 'ui') return null;
  if (kind === 'out') return 'cmd';
  return (LOG_GROUPS as readonly string[]).includes(kind) ? (kind as LogGroup) : 'info';
}

const depthOf = (event: ToolEvent) => (typeof event.depth === 'number' ? event.depth : 0);

/** The line's tag, as Praman prints it ("INFO (PMI090):"), or null for commands and output. */
export function tagOf(event: ToolEvent): string | null {
  if (event.kind === 'cmd' || event.kind === 'out') return null;
  const code = typeof event.code === 'string' && event.code !== '' ? ` (${event.code})` : '';
  return `${TAG[event.kind] ?? 'INFO'}${code}:`;
}

/** The line as text: a command after its prompt (one % per sourced script), else tag and text. */
export function lineText(event: ToolEvent): string {
  if (event.kind === 'cmd') return `${'%'.repeat(1 + depthOf(event))} ${event.text}`;
  const tag = tagOf(event);
  return tag === null ? event.text : `${tag} ${event.text}`;
}

/** A message about a place in a file starts with it: "counter.sv(12): …". */
const LOCATION = /^([\w./-]+\.\w+)\((\d+)\): /;

/** The file and line a message points at, if it does (commands and output never do). */
export function locationOf(event: ToolEvent): { name: string; line: number } | null {
  if (event.kind === 'cmd' || event.kind === 'out') return null;
  const [, name, line] = LOCATION.exec(event.text) ?? [];
  return name === undefined ? null : { name, line: Number(line) };
}

/** The property a line reports on (a result), if it does. */
export const propertyOf = (event: ToolEvent): string | null =>
  typeof event.prop === 'string' && event.prop !== '' ? event.prop : null;

/** The lines to draw: those after the last Clear, in a shown group, matching the search. */
export function visibleLines(
  events: readonly ToolEvent[],
  filter: LogFilter,
  search: string,
  clearedAt: number,
): { lines: ToolEvent[]; hidden: number } {
  const needle = search.trim().toLowerCase();
  const wanted = events.filter((event) => {
    const group = groupOf(event.kind);
    if (group === null || event.seq <= clearedAt || !filter[group]) return false;
    return needle === '' || lineText(event).toLowerCase().includes(needle);
  });
  const hidden = Math.max(0, wanted.length - LOG_LINES_SHOWN);
  return { lines: wanted.slice(hidden), hidden };
}

/** Lines of one group since the last Clear, for the chip's count. */
export function countOf(events: readonly ToolEvent[], group: LogGroup, clearedAt: number): number {
  return events.filter((event) => event.seq > clearedAt && groupOf(event.kind) === group).length;
}
