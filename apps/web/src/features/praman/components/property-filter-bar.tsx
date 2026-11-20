import { RESULT_FILTERS, type ResultFilter, type RowQuery } from '../property-rows';
import { Choice } from './choice';
import { SMALL_CONTROL } from './small-control';

const TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'assert', label: 'Assert' },
  { value: 'cover', label: 'Cover' },
  { value: 'assume', label: 'Assume' },
];

type PropertyFilterBarProps = {
  query: RowQuery;
  counts: Record<ResultFilter, number>;
  onQuery: (query: RowQuery) => void;
  /** The session's tasks, and the current one ('' for the design's own properties). */
  tasks: string[];
  task: string;
  onTask: (task: string) => void;
};

/** The table's filters: by task, name and type, by result (with counts), and related covers. */
export function PropertyFilterBar({
  query,
  counts,
  onQuery,
  tasks,
  task,
  onTask,
}: PropertyFilterBarProps) {
  const set = (change: Partial<RowQuery>) => onQuery({ ...query, ...change });
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-background px-2 py-1.5 text-[12px]">
      <TaskSelect tasks={tasks} task={task} onTask={onTask} />
      <input
        aria-label="Filter properties by name"
        placeholder="Filter by name"
        value={query.text}
        onChange={(e) => set({ text: e.target.value })}
        className={`${SMALL_CONTROL} w-48 font-sans`}
      />
      <select
        aria-label="Property type"
        value={query.type}
        onChange={(e) => set({ type: e.target.value })}
        className={`${SMALL_CONTROL} font-sans`}
      >
        {TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
      <ResultChips query={query} counts={counts} onQuery={onQuery} />
      <span className="ml-auto">
        <Choice
          type="checkbox"
          checked={query.showRelated}
          onChange={(on) => set({ showRelated: on })}
        >
          Related covers
        </Choice>
      </span>
    </div>
  );
}

function TaskSelect({
  tasks,
  task,
  onTask,
}: Pick<PropertyFilterBarProps, 'tasks' | 'task' | 'onTask'>) {
  if (tasks.length === 0) return null;
  return (
    <select
      aria-label="Task"
      value={task}
      onChange={(e) => onTask(e.target.value)}
      className={SMALL_CONTROL}
    >
      <option value="">&lt;embedded&gt;</option>
      {tasks.map((name) => (
        <option key={name}>{name}</option>
      ))}
    </select>
  );
}

/** One chip per result, with how many properties have it. */
function ResultChips({
  query,
  counts,
  onQuery,
}: Pick<PropertyFilterBarProps, 'query' | 'counts' | 'onQuery'>) {
  return RESULT_FILTERS.map((filter) => (
    <button
      key={filter.key}
      type="button"
      aria-pressed={query.result === filter.key}
      onClick={() => onQuery({ ...query, result: filter.key })}
      className="h-7 rounded-[3px] border border-border bg-background px-2 aria-pressed:border-info aria-pressed:bg-info-light"
    >
      {filter.label} <span className="text-muted-foreground">{counts[filter.key]}</span>
    </button>
  ));
}
