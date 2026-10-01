'use client';

import type { Resume } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { BulletsField } from './bullets-field';
import { ListEditor } from './list-editor';

type Projects = Resume['projects'];

export function ProjectsEditor({
  items,
  onChange,
}: {
  items: Projects;
  onChange: (items: Projects) => void;
}) {
  return (
    <ListEditor
      label="Project"
      items={items}
      max={8}
      create={() => ({ name: '', link: '', bullets: [] })}
      onChange={onChange}
      render={(project, set) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Project name"
              value={project.name}
              maxLength={80}
              onChange={(e) => set({ name: e.target.value })}
            />
            <TextField
              label="Link (https, optional)"
              type="url"
              value={project.link}
              onChange={(e) => set({ link: e.target.value })}
            />
          </div>
          <BulletsField bullets={project.bullets} onChange={(bullets) => set({ bullets })} />
        </>
      )}
    />
  );
}
