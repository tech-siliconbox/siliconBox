'use client';

import { RESUME_LIST_LIMITS, type Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { ListEditor } from './list-editor';

type Awards = Resume['awards'];

/** Awards, ranks, scholarships and hackathon wins. */
export function AwardsEditor({
  items,
  onChange,
}: {
  items: Awards;
  onChange: (items: Awards) => void;
}) {
  return (
    <ListEditor
      label="Award"
      items={items}
      max={RESUME_LIST_LIMITS.awards}
      create={() => ({ title: '', issuer: '', date: '', summary: '' })}
      onChange={onChange}
      render={(award, set) => (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
          <TextField
            label="Award"
            value={award.title}
            maxLength={120}
            onChange={(e) => set({ title: e.target.value })}
          />
          <TextField
            label="Given by"
            value={award.issuer}
            maxLength={80}
            onChange={(e) => set({ issuer: e.target.value })}
          />
          <TextField
            label="Month (optional)"
            type="month"
            value={award.date}
            onChange={(e) => set({ date: e.target.value })}
          />
          <TextField
            label="What it was for (optional)"
            className="sm:col-span-3"
            value={award.summary}
            maxLength={300}
            onChange={(e) => set({ summary: e.target.value })}
          />
        </div>
      )}
    />
  );
}
