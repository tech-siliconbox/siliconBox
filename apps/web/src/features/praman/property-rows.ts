import type { PramanProperty } from './praman-snapshot';

// The property table's rows, as Praman shows them: an assertion with its related covers and the
// cases of a split under it, filtered by result, type, name and the instance chosen in the
// hierarchy, and sorted by a column.

type Status = PramanProperty['status'];

/** Worst first: what a group of properties (an instance) shows as one status. */
const STATUS_RANK: readonly Status[] = [
  'cex',
  'error',
  'unreachable',
  'vacuous',
  'undetermined',
  'stopped',
  'running',
  'not_run',
  'covered',
  'proven',
  'assumed',
];

export const RESULT_FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  {
    key: 'fail',
    label: 'Failing',
    test: (p: PramanProperty) => ['cex', 'unreachable', 'vacuous', 'error'].includes(p.status),
  },
  {
    key: 'open',
    label: 'Undetermined',
    test: (p: PramanProperty) => p.status === 'undetermined' || p.status === 'stopped',
  },
  {
    key: 'pass',
    label: 'Passing',
    test: (p: PramanProperty) => p.status === 'proven' || p.status === 'covered',
  },
  { key: 'todo', label: 'Not run', test: (p: PramanProperty) => p.status === 'not_run' },
] as const;
export type ResultFilter = (typeof RESULT_FILTERS)[number]['key'];

export type SortKey = 'status' | 'type' | 'name' | 'engine' | 'bound' | 'seconds' | 'source';

export type RowQuery = {
  result: ResultFilter;
  /** 'all', or one property type. */
  type: string;
  text: string;
  /** The instance chosen in the hierarchy: its properties and those of the instances in it. */
  instance: string;
  showRelated: boolean;
  sort: { key: SortKey; dir: 1 | -1 } | null;
};

export type Row = { property: PramanProperty; depth: 0 | 1; children: number };

const inScope = (p: PramanProperty, instance: string) =>
  instance === '' || p.instance === instance || p.instance.startsWith(`${instance}.`);

/** "Infinite" for a full proof (or an unreachable cover), else the cycles reached. */
export function boundText(p: PramanProperty): string {
  if (p.status === 'proven' || p.status === 'unreachable') return 'Infinite';
  return p.bound === null || p.bound === 0 ? '' : String(p.bound);
}

/** Seconds as Praman shows them: 8.4 under 100, then m:ss or h:mm:ss. */
export function timeText(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 100) return seconds.toFixed(1);
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function sortValue(p: PramanProperty, key: SortKey): string | number {
  if (key === 'status') return STATUS_RANK.indexOf(p.status);
  if (key === 'source') return `${p.file}:${String(p.line).padStart(7, '0')}`;
  if (key === 'bound') return p.bound ?? (p.status === 'proven' ? Infinity : -1);
  if (key === 'seconds') return p.seconds ?? -1;
  return p[key];
}

function childrenByParent(properties: readonly PramanProperty[]) {
  const children = new Map<string, PramanProperty[]>();
  for (const p of properties) {
    if (p.parent !== '') children.set(p.parent, [...(children.get(p.parent) ?? []), p]);
  }
  return children;
}

/** The rows to draw: each matching property, then its cases and (if shown) its related covers. */
export function propertyRows(properties: readonly PramanProperty[], query: RowQuery): Row[] {
  const children = childrenByParent(properties);
  const wanted = RESULT_FILTERS.find((filter) => filter.key === query.result)?.test ?? (() => true);
  const needle = query.text.trim().toLowerCase();
  const matches = (p: PramanProperty) => {
    if (p.parent !== '' || !inScope(p, query.instance)) return false;
    if (query.type !== 'all' && p.type !== query.type) return false;
    const family = [p, ...(children.get(p.id) ?? [])];
    return (
      family.some(wanted) &&
      (needle === '' || family.some((q) => q.name.toLowerCase().includes(needle)))
    );
  };
  let parents = properties.filter(matches);
  const { sort } = query;
  if (sort !== null) {
    parents = [...parents].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }
  return parents.flatMap((p) => {
    const all = children.get(p.id) ?? [];
    // The cases of a split are the proof: always shown. Related covers only when asked for.
    const shown = all.filter((c) => c.related === 'case' || query.showRelated);
    return [
      { property: p, depth: 0 as const, children: shown.length },
      ...shown.map((c) => ({ property: c, depth: 1 as const, children: 0 })),
    ];
  });
}

/** How many properties each result chip would show. */
export function resultCounts(properties: readonly PramanProperty[], showRelated: boolean) {
  const scope = properties.filter((p) => p.parent === '' || showRelated);
  return Object.fromEntries(
    RESULT_FILTERS.map((filter) => [filter.key, scope.filter(filter.test).length]),
  ) as Record<ResultFilter, number>;
}

/** An instance's properties in the hierarchy: how many, and the worst status among them. */
export function instanceRollup(properties: readonly PramanProperty[], path: string) {
  let count = 0;
  let worst: Status | null = null;
  for (const p of properties) {
    if (p.parent !== '' || !inScope(p, path)) continue;
    count += 1;
    if (worst === null || STATUS_RANK.indexOf(p.status) < STATUS_RANK.indexOf(worst))
      worst = p.status;
  }
  return { count, worst };
}
