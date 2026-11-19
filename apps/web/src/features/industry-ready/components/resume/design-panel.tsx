'use client';

import {
  RESUME_ACCENTS,
  RESUME_FONT_SIZES,
  type Resume,
  type ResumeAccent,
  type ResumeDesign,
} from '@siliconbox/shared';
import { type ReactNode, useId } from 'react';
import { EYEBROW_CLASS } from '@/components/ui/eyebrow';
import { cn } from '@/lib/cn';
import { PanelFrame } from '../panel-frame';
import { ACCENT_CLASSES } from './preview-classes';

type Option<T> = { value: T; label: ReactNode };

type ChoiceProps<T> = {
  legend: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
};

/** One setting as a row of radio buttons styled as chips; the keyboard moves between them. */
function Choice<T extends string | number>({ legend, value, options, onChange }: ChoiceProps<T>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={cn(EYEBROW_CLASS, 'mb-2')}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={String(option.value)}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
              option.value === value ? 'border-foreground font-semibold' : 'border-border',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const TEMPLATES: readonly Option<Resume['template']>[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'compact', label: 'Compact' },
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
];

const ACCENTS: readonly Option<ResumeAccent>[] = (
  Object.keys(RESUME_ACCENTS) as ResumeAccent[]
).map((accent) => ({
  value: accent,
  label: (
    <>
      <svg aria-hidden="true" viewBox="0 0 10 10" className="size-3">
        <circle cx="5" cy="5" r="5" className={ACCENT_CLASSES[accent].fill} />
      </svg>
      <span className="capitalize">{accent}</span>
    </>
  ),
}));

type Settings = { resume: Resume; design: (patch: Partial<ResumeDesign>) => void };

function LookChoices({
  resume,
  design,
  onTemplate,
}: Settings & { onTemplate: (template: Resume['template']) => void }) {
  const { accent, font, fontSize } = resume.design;
  return (
    <>
      <Choice legend="Template" value={resume.template} options={TEMPLATES} onChange={onTemplate} />
      <Choice
        legend="Accent colour"
        value={accent}
        options={ACCENTS}
        onChange={(value) => design({ accent: value })}
      />
      <Choice
        legend="Font"
        value={font}
        options={[
          { value: 'sans', label: 'Sans serif' },
          { value: 'serif', label: 'Serif' },
        ]}
        onChange={(value) => design({ font: value })}
      />
      <Choice
        legend="Text size (pt)"
        value={fontSize}
        options={RESUME_FONT_SIZES.map((size) => ({ value: size, label: String(size) }))}
        onChange={(value) => design({ fontSize: value })}
      />
    </>
  );
}

function PageChoices({ resume, design }: Settings) {
  const { spacing, margins, pageSize } = resume.design;
  return (
    <>
      <Choice
        legend="Spacing"
        value={spacing}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'normal', label: 'Normal' },
          { value: 'relaxed', label: 'Relaxed' },
        ]}
        onChange={(value) => design({ spacing: value })}
      />
      <Choice
        legend="Margins"
        value={margins}
        options={[
          { value: 'narrow', label: 'Narrow' },
          { value: 'normal', label: 'Normal' },
          { value: 'wide', label: 'Wide' },
        ]}
        onChange={(value) => design({ margins: value })}
      />
      <Choice
        legend="Paper"
        value={pageSize}
        options={[
          { value: 'A4', label: 'A4' },
          { value: 'LETTER', label: 'US Letter' },
        ]}
        onChange={(value) => design({ pageSize: value })}
      />
    </>
  );
}

type DesignPanelProps = { resume: Resume; onChange: (resume: Resume) => void };

/** Template and design settings; every choice keeps the resume one column of real text. */
export function DesignPanel({ resume, onChange }: DesignPanelProps) {
  const design = (patch: Partial<ResumeDesign>) =>
    onChange({ ...resume, design: { ...resume.design, ...patch } });
  return (
    <PanelFrame
      title="Design"
      description="Every template is one column of real text with standard headings, the layout applicant tracking systems read best."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <LookChoices
          resume={resume}
          design={design}
          onTemplate={(template) => onChange({ ...resume, template })}
        />
        <PageChoices resume={resume} design={design} />
      </div>
    </PanelFrame>
  );
}
