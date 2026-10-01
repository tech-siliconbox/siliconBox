'use client';

import type { Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { BulletsField } from './bullets-field';
import { ListEditor } from './list-editor';
import { MonthRange } from './month-range';

type Experience = Resume['experience'];

export function ExperienceEditor({
  items,
  onChange,
}: {
  items: Experience;
  onChange: (items: Experience) => void;
}) {
  return (
    <ListEditor
      label="Role"
      items={items}
      max={10}
      create={() => ({
        role: '',
        company: '',
        location: '',
        start: '',
        end: 'Present',
        bullets: [],
      })}
      onChange={onChange}
      render={(job, set) => (
        <>
          <JobFields job={job} set={set} />
          <MonthRange
            start={job.start}
            end={job.end}
            allowPresent
            onChange={(range) => set(range)}
          />
          <BulletsField bullets={job.bullets} onChange={(bullets) => set({ bullets })} />
        </>
      )}
    />
  );
}

type Job = Experience[number];

function JobFields({ job, set }: { job: Job; set: (patch: Partial<Job>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        label="Role"
        value={job.role}
        maxLength={80}
        onChange={(e) => set({ role: e.target.value })}
      />
      <TextField
        label="Company"
        value={job.company}
        maxLength={80}
        onChange={(e) => set({ company: e.target.value })}
      />
      <TextField
        label="Location"
        value={job.location}
        maxLength={80}
        onChange={(e) => set({ location: e.target.value })}
      />
    </div>
  );
}
