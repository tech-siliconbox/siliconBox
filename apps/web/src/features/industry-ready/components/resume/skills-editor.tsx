'use client';

import type { Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { ListEditor } from './list-editor';

type Skills = Resume['skills'];

/** Skill groups, items typed as a comma-separated list. */
export function SkillsEditor({
  skills,
  onChange,
}: {
  skills: Skills;
  onChange: (skills: Skills) => void;
}) {
  return (
    <ListEditor
      label="Skill group"
      items={skills}
      max={8}
      create={() => ({ category: 'Formal verification', items: [] })}
      onChange={onChange}
      render={(group, set) => (
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <TextField
            label="Group"
            value={group.category}
            maxLength={40}
            onChange={(e) => set({ category: e.target.value })}
          />
          <TextField
            label="Skills, separated by commas"
            placeholder="SVA, model checking, JasperGold"
            value={group.items.join(', ')}
            onChange={(e) =>
              set({
                items: e.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter((item) => item !== ''),
              })
            }
          />
        </div>
      )}
    />
  );
}
