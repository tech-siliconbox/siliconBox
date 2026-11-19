'use client';

import {
  RESUME_LIST_LIMITS,
  RESUME_SECTION_TITLES,
  type Resume,
  addCustomSection,
  isBuiltInSection,
  moveSection,
  removeCustomSection,
  renameSection,
  sectionOrder,
  sectionTitle,
  toggleSection,
} from '@siliconbox/shared';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { EntryControls } from './entry-controls';
import { PanelFrame } from '../panel-frame';

type Edit = { resume: Resume; onChange: (resume: Resume) => void };

function SectionRow({
  resume,
  onChange,
  id,
  first,
  last,
}: Edit & { id: string; first: boolean; last: boolean }) {
  const builtIn = isBuiltInSection(id);
  const title = sectionTitle(resume, id);
  return (
    <li className="flex flex-wrap items-end gap-3 p-3">
      <TextField
        label={builtIn ? `Heading (${RESUME_SECTION_TITLES[id]})` : 'Heading (your section)'}
        className="w-64"
        maxLength={40}
        placeholder={builtIn ? RESUME_SECTION_TITLES[id] : ''}
        value={builtIn ? (resume.sections.titles[id] ?? '') : title}
        onChange={(event) => onChange(renameSection(resume, id, event.target.value))}
      />
      <label className="flex h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!resume.sections.hidden.includes(id)}
          onChange={() => onChange(toggleSection(resume, id))}
        />
        Show
      </label>
      <EntryControls
        name={title}
        first={first}
        last={last}
        onMove={(by) => onChange(moveSection(resume, id, by))}
        onRemove={builtIn ? undefined : () => onChange(removeCustomSection(resume, id))}
      />
    </li>
  );
}

/** The printed order of sections, which show, their headings, and the learner's own sections. */
export function SectionsPanel({ resume, onChange }: Edit) {
  const order = sectionOrder(resume);
  const addCustom = () =>
    onChange(addCustomSection(resume, crypto.randomUUID(), 'Positions of responsibility'));
  return (
    <PanelFrame
      title="Sections"
      description="Choose the order sections print in, rename a heading, hide a section without losing it, or add your own section."
    >
      <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
        {order.map((id, index) => (
          <SectionRow
            key={id}
            id={id}
            resume={resume}
            onChange={onChange}
            first={index === 0}
            last={index === order.length - 1}
          />
        ))}
      </ol>
      {resume.custom.length < RESUME_LIST_LIMITS.custom && (
        <Button size="sm" variant="secondary" className="w-fit" onClick={addCustom}>
          + Add your own section
        </Button>
      )}
    </PanelFrame>
  );
}
