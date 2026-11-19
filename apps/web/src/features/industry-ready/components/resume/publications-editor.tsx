'use client';

import { RESUME_LIST_LIMITS, type Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { ListEditor } from './list-editor';

type Publications = Resume['publications'];

/** Papers, posters and articles, such as a DVCon paper or a thesis. */
export function PublicationsEditor({
  items,
  onChange,
}: {
  items: Publications;
  onChange: (items: Publications) => void;
}) {
  return (
    <ListEditor
      label="Publication"
      items={items}
      max={RESUME_LIST_LIMITS.publications}
      create={() => ({ title: '', venue: '', date: '', link: '' })}
      onChange={onChange}
      render={(paper, set) => (
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <TextField
            label="Title"
            value={paper.title}
            maxLength={200}
            onChange={(e) => set({ title: e.target.value })}
          />
          <TextField
            label="Month (optional)"
            type="month"
            value={paper.date}
            onChange={(e) => set({ date: e.target.value })}
          />
          <TextField
            label="Where it appeared"
            value={paper.venue}
            maxLength={120}
            onChange={(e) => set({ venue: e.target.value })}
          />
          <TextField
            label="Link (https, optional)"
            type="url"
            value={paper.link}
            onChange={(e) => set({ link: e.target.value })}
          />
        </div>
      )}
    />
  );
}
