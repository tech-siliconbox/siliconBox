'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { MenuItem } from '../menus';
import type { PramanProperty } from '../praman-snapshot';
import {
  type Row,
  type RowQuery,
  type SortKey,
  boundText,
  propertyRows,
  resultCounts,
  timeText,
} from '../property-rows';
import { PropertyFilterBar } from './property-filter-bar';
import { PropertyFooter } from './property-footer';
import { RowMenu } from './row-menu';
import { STATUS_LABEL, StatusIcon } from './status-icon';

type PropertyTableProps = {
  properties: PramanProperty[];
  /** The instance chosen in the hierarchy ('' for all). */
  instance: string;
  tasks: string[];
  task: string;
  onTask: (task: string) => void;
  /** Now, in milliseconds: the time of a property still running. */
  now: number;
  onTrace: (property: PramanProperty) => void;
  onSource: (property: PramanProperty) => void;
  menuOf: (property: PramanProperty) => (MenuItem | null)[];
  onChoose: (item: MenuItem) => void;
};

const COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: 'status', label: '' },
  { key: 'type', label: 'Type' },
  { key: 'name', label: 'Name' },
  { key: 'engine', label: 'Engine' },
  { key: 'bound', label: 'Bound' },
  { key: 'seconds', label: 'Time' },
  { key: 'source', label: 'Source' },
];

/** The table's own state: filters and sort, the chosen row, and the folded ones. */
function useTable(properties: PramanProperty[], instance: string) {
  const [query, setQuery] = useState<RowQuery>({
    result: 'all',
    type: 'all',
    text: '',
    instance: '',
    showRelated: true,
    sort: null,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const rows = propertyRows(properties, { ...query, instance }).filter(
    (row) => row.depth === 0 || !folded.has(row.property.parent),
  );
  const fold = (id: string) =>
    setFolded(
      folded.has(id)
        ? new Set([...folded].filter((each) => each !== id))
        : new Set([...folded, id]),
    );
  return { query, setQuery, selected, setSelected, folded, fold, rows };
}

/** The elaborated design's properties, as Praman's property table: filter, sort, select, open. */
export function PropertyTable(props: PropertyTableProps) {
  const { properties } = props;
  const { query, setQuery, selected, setSelected, folded, fold, rows } = useTable(
    properties,
    props.instance,
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PropertyFilterBar
        query={query}
        counts={resultCounts(properties, query.showRelated)}
        onQuery={setQuery}
        tasks={props.tasks}
        task={props.task}
        onTask={props.onTask}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-[13px] [&_tbody_tr:nth-child(even)]:bg-muted/40">
          <SortHead sort={query.sort} onSort={(sort) => setQuery({ ...query, sort })} />
          <tbody>
            {rows.map((row) => (
              <PropertyRow
                key={row.property.id}
                row={row}
                selected={selected === row.property.id}
                folded={folded.has(row.property.id)}
                onSelect={() => setSelected(row.property.id)}
                onFold={() => fold(row.property.id)}
                {...props}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-4 text-muted-foreground">No property matches the filters.</p>
        )}
      </div>
      <PropertyFooter
        properties={properties}
        shown={rows.length}
        selected={properties.find((p) => p.id === selected) ?? null}
      />
    </div>
  );
}

type Sort = RowQuery['sort'];

/** Ascending, then descending, then unsorted. */
const nextSort = (sort: Sort, key: SortKey): Sort =>
  sort?.key !== key ? { key, dir: 1 } : sort.dir === 1 ? { key, dir: -1 } : null;

function SortHead({ sort, onSort }: { sort: Sort; onSort: (sort: Sort) => void }) {
  return (
    <thead className="sticky top-0 z-10 border-b border-border bg-muted text-[12px] text-muted-foreground">
      <tr>
        {COLUMNS.map((column) => (
          <th
            key={column.key}
            aria-sort={
              sort?.key !== column.key ? 'none' : sort.dir === 1 ? 'ascending' : 'descending'
            }
            className="px-2 py-1 font-semibold"
          >
            <button
              type="button"
              onClick={() => onSort(nextSort(sort, column.key))}
              className="hover:text-foreground"
            >
              {column.label === '' ? <span className="sr-only">Status</span> : column.label}
              {sort?.key === column.key && (
                <span aria-hidden="true"> {sort.dir === 1 ? '▲' : '▼'}</span>
              )}
            </button>
          </th>
        ))}
        <th className="px-2 py-1">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
}

const TYPE_CLASS: Readonly<Record<string, string>> = {
  assert: 'text-info',
  cover: 'text-ok',
  assume: 'text-warning',
};

const typeLabel = ({ property, depth }: Row) =>
  depth === 1
    ? property.related === 'case'
      ? 'Case'
      : 'Cover (related)'
    : property.type.charAt(0).toUpperCase() + property.type.slice(1);

type PropertyRowProps = PropertyTableProps & {
  row: Row;
  selected: boolean;
  folded: boolean;
  onSelect: () => void;
  onFold: () => void;
};

function PropertyRow({ row, selected, onSelect, onTrace, onSource, ...rest }: PropertyRowProps) {
  const { property, depth } = row;
  return (
    <tr
      aria-selected={selected}
      title={[STATUS_LABEL[property.status], property.detail].filter(Boolean).join(': ')}
      className={cn(
        'cursor-default border-b border-border/60',
        selected && 'bg-info-light!',
        property.disabled && 'text-muted-foreground',
      )}
    >
      <td className="px-2 py-1">
        <StatusIcon status={property.status} />
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-2 py-1 font-semibold',
          depth === 1 && 'italic',
          TYPE_CLASS[property.type],
        )}
      >
        {typeLabel(row)}
      </td>
      <NameCell
        row={row}
        folded={rest.folded}
        onFold={rest.onFold}
        onSelect={onSelect}
        onOpen={() => (property.has_trace ? onTrace(property) : onSource(property))}
      />
      <td className="px-2 py-1 text-muted-foreground">
        {property.status === 'running' && property.activity !== ''
          ? property.activity
          : property.engine}
      </td>
      <td className="px-2 py-1 text-right font-mono">{boundText(property)}</td>
      <td className="px-2 py-1 text-right font-mono">
        {timeText(runningSeconds(property, rest.now))}
      </td>
      <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{sourceOf(property)}</td>
      <ActionsCell property={property} onTrace={onTrace} {...rest} />
    </tr>
  );
}

/** A running property's time so far (from when its engines took it up), else its own time. */
function runningSeconds(property: PramanProperty, now: number): number | null {
  if (property.status !== 'running' || property.started_at === null) return property.seconds;
  return Math.max(0, now / 1000 - property.started_at);
}

type NameCellProps = {
  row: Row;
  folded: boolean;
  onFold: () => void;
  /** A click chooses the row; a double click opens its trace (or its source). */
  onSelect: () => void;
  onOpen: () => void;
};

function NameCell({ row, folded, onFold, onSelect, onOpen }: NameCellProps) {
  const { property, depth, children } = row;
  return (
    <td className={cn('px-2 py-1 font-mono', depth === 1 && 'pl-9')}>
      <span className="sr-only">{STATUS_LABEL[property.status]}: </span>
      {depth === 0 && (
        <button
          type="button"
          aria-label={
            folded ? `Show the covers of ${property.name}` : `Hide the covers of ${property.name}`
          }
          onClick={onFold}
          className={cn(
            'mr-1 w-3 text-[10px] text-muted-foreground',
            children === 0 && 'invisible',
          )}
        >
          {folded ? '▶' : '▼'}
        </button>
      )}
      <button type="button" onClick={onSelect} onDoubleClick={onOpen} className="text-left">
        {depth === 1 ? `:${property.name.split(':').pop() ?? ''}` : property.name}
      </button>
    </td>
  );
}

const sourceOf = (p: PramanProperty) =>
  p.file === '' ? '' : p.line > 0 ? `${p.file}:${p.line}` : p.file;

type ActionsCellProps = Pick<PropertyTableProps, 'onTrace' | 'menuOf' | 'onChoose'> & {
  property: PramanProperty;
};

/** The row's waveform (when it has a trace) and its ⋯ menu. */
function ActionsCell({ property, onTrace, menuOf, onChoose }: ActionsCellProps) {
  return (
    <td className="whitespace-nowrap px-2 py-1 text-right">
      {property.has_trace && (
        <button
          type="button"
          onClick={() => onTrace(property)}
          className="mr-2 text-[12px] font-semibold underline underline-offset-2"
        >
          Waveform
        </button>
      )}
      <RowMenu name={property.name} items={menuOf(property)} onChoose={onChoose} />
    </td>
  );
}
