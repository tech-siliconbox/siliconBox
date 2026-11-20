'use client';

import type { ToolEvent } from '@siliconbox/shared';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  DEFAULT_LOG_VIEW,
  type LogGroup,
  type LogView,
  countOf,
  lineText,
  locationOf,
  propertyOf,
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

/** What a line can open: the file and line it names, or the property it reports on. */
type LineLinks = {
  onLocation?: (name: string, line: number) => void;
  onProperty?: (id: string) => void;
};

/** The property chosen in the table: the log can show only its engine detail. */
type Focus = { id: string; name: string };

type LogPanelProps = LineLinks & { events: ToolEvent[]; focus?: Focus | null };

/** The session's log, newest at the bottom: chips show or hide kinds of lines; Clear empties
 * the view (the session keeps its log). */
export function LogPanel({ events, focus = null, ...links }: LogPanelProps) {
  // `only` is on or off here; it means the property chosen when there is one.
  const [view, setView] = useState<LogView>(DEFAULT_LOG_VIEW);
  const only = view.only !== null && focus !== null ? focus.id : null;
  const { lines, hidden } = visibleLines(events, { ...view, only });
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
        <LogTools events={events} view={view} focus={focus} onView={setView} />
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
          <LogLine key={event.seq} event={event} {...links} />
        ))}
      </div>
    </section>
  );
}

type LogToolsProps = {
  events: ToolEvent[];
  view: LogView;
  focus: Focus | null;
  onView: (view: LogView) => void;
};

/** The chips that show or hide kinds of lines, the chosen property's only, search and Clear. */
function LogTools({ events, view, focus, onView }: LogToolsProps) {
  const { filter, clearedAt } = view;
  const set = (change: Partial<LogView>) => onView({ ...view, ...change });
  return (
    <div className="ml-auto flex items-center gap-1.5 px-2">
      {CHIPS.map(({ group, label, counted }) => (
        <Chip
          key={group}
          on={filter[group]}
          onClick={() => set({ filter: { ...filter, [group]: !filter[group] } })}
          count={shownCount(counted, countOf(events, group, clearedAt))}
          alarm={group === 'error'}
        >
          {label}
        </Chip>
      ))}
      {focus !== null && filter.engine && (
        <Chip
          on={view.only !== null}
          title={`Engine detail of ${focus.name} only`}
          onClick={() => set({ only: view.only === null ? focus.id : null })}
        >
          Only this property
        </Chip>
      )}
      <input
        type="search"
        aria-label="Search the log"
        placeholder="Search the log"
        value={view.search}
        onChange={(event) => set({ search: event.target.value })}
        className="h-6 w-44 rounded-[3px] border border-border bg-background px-1.5 text-[12px] outline-none focus:border-info"
      />
      <Chip onClick={() => set({ clearedAt: events.at(-1)?.seq ?? 0 })}>Clear</Chip>
    </div>
  );
}

function LogLine({ event, ...links }: LineLinks & { event: ToolEvent }) {
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
          <LineText event={event} {...links} />
        </>
      )}
    </div>
  );
}

const LINK = 'text-left underline-offset-2 hover:text-info hover:underline';

/** A message's text: its file and line open the file there; a result chooses its property. */
function LineText({ event, onLocation, onProperty }: LineLinks & { event: ToolEvent }) {
  const where = locationOf(event);
  const property = propertyOf(event);
  if (where !== null && onLocation !== undefined) {
    const place = `${where.name}(${where.line})`;
    return (
      <>
        <button
          type="button"
          title={`Open ${where.name} at line ${where.line}`}
          onClick={() => onLocation(where.name, where.line)}
          className={LINK}
        >
          {place}
        </button>
        {event.text.slice(place.length)}
      </>
    );
  }
  if (property === null || onProperty === undefined) return event.text;
  return (
    <button
      type="button"
      title="Show this property in the table"
      onClick={() => onProperty(property)}
      className={LINK}
    >
      {event.text}
    </button>
  );
}

type ChipProps = {
  /** A chip that shows or hides lines is pressed while they show; Clear is not a toggle. */
  on?: boolean;
  onClick: () => void;
  count?: number | null;
  alarm?: boolean;
  title?: string;
  children: string;
};

function Chip({ on, onClick, count = null, alarm = false, title, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
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
