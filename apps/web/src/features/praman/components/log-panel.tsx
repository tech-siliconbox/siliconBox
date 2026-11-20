'use client';

import type { ToolEvent } from '@siliconbox/shared';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  DEFAULT_LOG_FILTER,
  type LogFilter,
  type LogGroup,
  countOf,
  lineText,
  tagOf,
  visibleLines,
} from '../log-view';
import { PANEL_STRIP } from './panel-tabs';

const TAG_CLASS: Readonly<Record<string, string>> = {
  error: 'text-danger',
  warning: 'text-warning',
};

/** Each chip's count: always, only when there are lines, or never. */
type Counted = 'always' | 'some' | 'never';

const CHIPS: readonly { group: LogGroup; label: string; counted: Counted }[] = [
  { group: 'error', label: 'Errors', counted: 'always' },
  { group: 'warning', label: 'Warnings', counted: 'always' },
  { group: 'info', label: 'Info', counted: 'never' },
  { group: 'cmd', label: 'Commands', counted: 'never' },
  { group: 'engine', label: 'Engine detail', counted: 'some' },
];

function shownCount(counted: Counted, count: number): number | null {
  if (counted === 'never' || (counted === 'some' && count === 0)) return null;
  return count;
}

/** The session's log, newest at the bottom: chips show or hide kinds of lines; Clear empties
 * the view (the session keeps its log). */
export function LogPanel({ events }: { events: ToolEvent[] }) {
  const [filter, setFilter] = useState<LogFilter>(DEFAULT_LOG_FILTER);
  const [search, setSearch] = useState('');
  const [clearedAt, setClearedAt] = useState(0);
  const { lines, hidden } = visibleLines(events, filter, search, clearedAt);
  const box = useRef<HTMLDivElement>(null);
  // Follows new lines unless the learner scrolled up to read.
  const stuck = useRef(true);
  const lastSeq = lines.at(-1)?.seq ?? 0;
  useEffect(() => {
    const element = box.current;
    if (element !== null && stuck.current) element.scrollTop = element.scrollHeight;
  }, [lines.length, lastSeq]);

  return (
    <section aria-label="Log" className="flex h-full min-h-0 flex-col">
      <div className={PANEL_STRIP}>
        <h2 className="px-3 font-semibold">Log</h2>
        <LogTools
          events={events}
          filter={filter}
          clearedAt={clearedAt}
          search={search}
          onFilter={setFilter}
          onSearch={setSearch}
          onClear={setClearedAt}
        />
      </div>
      <div
        ref={box}
        role="log"
        aria-live="polite"
        onScroll={(event) => {
          const element = event.currentTarget;
          stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
        }}
        className="min-h-0 flex-1 overflow-auto bg-background px-3 py-1.5 font-mono text-[12px] leading-[18px]"
      >
        {hidden > 0 && <p className="text-muted-foreground">… {hidden} earlier lines not shown</p>}
        {lines.map((event) => (
          <LogLine key={event.seq} event={event} />
        ))}
      </div>
    </section>
  );
}

type LogToolsProps = {
  events: ToolEvent[];
  filter: LogFilter;
  clearedAt: number;
  search: string;
  onFilter: (filter: LogFilter) => void;
  onSearch: (search: string) => void;
  onClear: (seq: number) => void;
};

/** The chips that show or hide kinds of lines, the search box and Clear. */
function LogTools({ events, filter, clearedAt, search, ...on }: LogToolsProps) {
  return (
    <div className="ml-auto flex items-center gap-1.5 px-2">
      {CHIPS.map(({ group, label, counted }) => (
        <Chip
          key={group}
          on={filter[group]}
          onClick={() => on.onFilter({ ...filter, [group]: !filter[group] })}
          count={shownCount(counted, countOf(events, group, clearedAt))}
          alarm={group === 'error'}
        >
          {label}
        </Chip>
      ))}
      <input
        type="search"
        aria-label="Search the log"
        placeholder="Search the log"
        value={search}
        onChange={(event) => on.onSearch(event.target.value)}
        className="h-6 w-44 rounded-[3px] border border-border bg-background px-1.5 text-[12px] outline-none focus:border-info"
      />
      <Chip onClick={() => on.onClear(events.at(-1)?.seq ?? 0)}>Clear</Chip>
    </div>
  );
}

function LogLine({ event }: { event: ToolEvent }) {
  const tag = tagOf(event);
  return (
    <div
      className={cn(
        'whitespace-pre-wrap break-words',
        event.kind === 'cmd' && 'font-semibold',
        event.kind === 'engine' && 'text-muted-foreground',
      )}
    >
      {tag === null ? (
        lineText(event)
      ) : (
        <>
          <span className={TAG_CLASS[event.kind] ?? 'text-muted-foreground'}>{tag}</span>{' '}
          {event.text}
        </>
      )}
    </div>
  );
}

type ChipProps = {
  /** A chip that shows or hides lines is pressed while they show; Clear is not a toggle. */
  on?: boolean;
  onClick: () => void;
  count?: number | null;
  alarm?: boolean;
  children: string;
};

function Chip({ on, onClick, count = null, alarm = false, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex h-6 items-center gap-1 rounded-[3px] border px-2 text-[12px]',
        on === true ? 'border-info bg-info-light' : 'border-border bg-background hover:bg-muted',
      )}
    >
      {children}
      {count !== null && (
        <span className={count > 0 && alarm ? 'text-danger' : 'text-muted-foreground'}>
          {count}
        </span>
      )}
    </button>
  );
}
