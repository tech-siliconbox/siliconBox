'use client';

import { type CustomSection, RESUME_LIST_LIMITS } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { BulletsField } from './bullets-field';
import { ListEditor } from './list-editor';

type Items = CustomSection['items'];

/** The entries of one of the learner's own sections, such as positions of responsibility. */
export function CustomSectionEditor({
  items,
  onChange,
}: {
  items: Items;
  onChange: (items: Items) => void;
}) {
  return (
    <ListEditor
      label="Entry"
      items={items}
      max={RESUME_LIST_LIMITS.customItems}
      create={() => ({ title: '', subtitle: '', date: '', bullets: [] })}
      onChange={onChange}
      render={(item, set) => (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
            <TextField
              label="Title"
              value={item.title}
              maxLength={120}
              onChange={(e) => set({ title: e.target.value })}
            />
            <TextField
              label="Detail (optional)"
              value={item.subtitle}
              maxLength={120}
              onChange={(e) => set({ subtitle: e.target.value })}
            />
            <TextField
              label="When (optional)"
              placeholder="2023"
              value={item.date}
              maxLength={40}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>
          <BulletsField bullets={item.bullets} onChange={(bullets) => set({ bullets })} />
        </>
      )}
    />
  );
}
