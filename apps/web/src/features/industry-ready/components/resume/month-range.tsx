'use client';

import { TextField } from '@/components/ui/text-field';

type MonthRangeProps = {
  start: string;
  end: string;
  allowPresent: boolean;
  onChange: (range: { start: string; end: string }) => void;
};

/** Start and end months (YYYY-MM from the browser's month picker), with "Present" for current roles. */
export function MonthRange({ start, end, allowPresent, onChange }: MonthRangeProps) {
  const present = end === 'Present';
  return (
    <div className="grid grid-cols-2 gap-3">
      <TextField
        label="Start"
        type="month"
        value={start}
        onChange={(e) => onChange({ start: e.target.value, end })}
      />
      <div className="flex flex-col gap-1.5">
        <TextField
          label="End"
          type="month"
          value={present ? '' : end}
          disabled={present}
          onChange={(e) => onChange({ start, end: e.target.value })}
        />
        {allowPresent && (
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={present}
              onChange={(e) => onChange({ start, end: e.target.checked ? 'Present' : '' })}
            />
            I work here now
          </label>
        )}
      </div>
    </div>
  );
}
