import { type ActivityCell, dayDate } from '@siliconbox/shared';
import { Fragment } from 'react';
import { cn } from '@/lib/cn';
import { countOf } from '@/lib/count-of';
import { formatDate, formatMonth } from '@/lib/format-date';
import { Panel } from './panel';

const HEAT = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const;
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const SQUARE = 'size-[11px] rounded-[2px]';

/** How dark a day is: nothing, then 1–2, 3–4, 5–7, and 8 or more things done. */
const heatLevel = (count: number) =>
  count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 7 ? 3 : 4;

/** The month that starts in a week, to label its column. */
function monthStarting(week: readonly ActivityCell[]): string {
  const first = week.find((cell) => cell.day.endsWith('-01'));
  return first === undefined ? '' : formatMonth(dayDate(first.day));
}

function Legend() {
  return (
    <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
      Less
      {HEAT.map((heat) => (
        <span key={heat} className={cn(SQUARE, heat)} />
      ))}
      More
    </div>
  );
}

/**
 * A year of activity, a square a day, darker for more lessons finished and Drill runs. On a phone
 * it scrolls sideways, starting at this week.
 */
export function ActivityGraph({ weeks }: { weeks: readonly ActivityCell[][] }) {
  const cells = weeks.flat();
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);
  const days = cells.filter((cell) => cell.count > 0).length;
  return (
    <Panel title="Last 12 months" count={`${total} done`}>
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-row-reverse overflow-x-auto pb-1">
          <div className="flex gap-2 text-[10px] leading-[11px] text-muted-foreground">
            <div className="grid grid-rows-[auto_repeat(7,11px)] gap-[3px]">
              <span aria-hidden="true">&nbsp;</span>
              {WEEKDAYS.map((label, index) => (
                <span key={index}>{label}</span>
              ))}
            </div>
            <div
              role="img"
              aria-label={`Activity in the last 12 months: ${total} done on ${countOf(days, 'day')}`}
              className="grid grid-flow-col auto-cols-[11px] grid-rows-[auto_repeat(7,11px)] gap-[3px]"
            >
              {weeks.map((week) => (
                <Fragment key={week[0]?.day}>
                  <span className="whitespace-nowrap">{monthStarting(week)}</span>
                  {week.map(({ day, count }) => (
                    <span
                      key={day}
                      title={`${count === 0 ? 'Nothing' : count} done on ${formatDate(dayDate(day))}`}
                      className={cn(SQUARE, HEAT[heatLevel(count)])}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
        <Legend />
      </div>
    </Panel>
  );
}
