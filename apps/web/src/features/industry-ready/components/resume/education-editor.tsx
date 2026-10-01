'use client';

import type { Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { ListEditor } from './list-editor';
import { MonthRange } from './month-range';

type Education = Resume['education'];

export function EducationEditor({
  items,
  onChange,
}: {
  items: Education;
  onChange: (items: Education) => void;
}) {
  return (
    <ListEditor
      label="Degree"
      items={items}
      max={5}
      create={() => ({ degree: '', institution: '', start: '', end: '', score: '' })}
      onChange={onChange}
      render={(school, set) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Degree"
              placeholder="B.Tech, Electronics and Communication"
              value={school.degree}
              maxLength={120}
              onChange={(e) => set({ degree: e.target.value })}
            />
            <TextField
              label="Institution"
              value={school.institution}
              maxLength={120}
              onChange={(e) => set({ institution: e.target.value })}
            />
            <TextField
              label="Score (optional)"
              placeholder="CGPA 8.4"
              value={school.score}
              maxLength={30}
              onChange={(e) => set({ score: e.target.value })}
            />
          </div>
          <MonthRange
            start={school.start}
            end={school.end}
            allowPresent={false}
            onChange={(range) => set(range)}
          />
        </>
      )}
    />
  );
}
