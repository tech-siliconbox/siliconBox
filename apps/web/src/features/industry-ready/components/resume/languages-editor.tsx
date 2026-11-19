'use client';

import { RESUME_LANGUAGE_LEVELS, RESUME_LIST_LIMITS, type Resume } from '@siliconbox/shared';
import { useId } from 'react';
import { Field } from '@/components/ui/field';
import { TextField } from '@/components/ui/text-field';
import { ListEditor } from './list-editor';

type Languages = Resume['languages'];
type Language = Languages[number];

function LevelSelect({
  value,
  onChange,
}: {
  value: Language['level'];
  onChange: (level: Language['level']) => void;
}) {
  const id = useId();
  return (
    <Field id={id} label="Level">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as Language['level'])}
        className="h-10 rounded-md border border-border bg-background px-2 text-sm"
      >
        {RESUME_LANGUAGE_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Spoken languages and how well the learner speaks each. */
export function LanguagesEditor({
  items,
  onChange,
}: {
  items: Languages;
  onChange: (items: Languages) => void;
}) {
  return (
    <ListEditor
      label="Language"
      items={items}
      max={RESUME_LIST_LIMITS.languages}
      create={(): Language => ({ name: '', level: 'Professional' })}
      onChange={onChange}
      render={(language, set) => (
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <TextField
            label="Language"
            value={language.name}
            maxLength={40}
            onChange={(e) => set({ name: e.target.value })}
          />
          <LevelSelect value={language.level} onChange={(level) => set({ level })} />
        </div>
      )}
    />
  );
}
