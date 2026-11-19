'use client';

import {
  RESUME_TEMPLATE_STYLES,
  type Resume,
  type ResumeBlock,
  type ResumeEntry,
  resumeDocument,
} from '@siliconbox/shared';
import { Prose } from '@/components/lesson/prose';
import { cn } from '@/lib/cn';
import {
  ACCENT_CLASSES,
  FONT_CLASSES,
  FONT_SIZE_CLASSES,
  PAGE_PADDING_CLASSES,
  SECTION_GAP_CLASSES,
} from './preview-classes';

function Entry({ entry }: { entry: ResumeEntry }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between gap-2">
        <span className="font-semibold">{entry.title}</span>
        <span className="text-muted-foreground">{entry.meta}</span>
      </div>
      {entry.subtitle !== '' && <p className="text-muted-foreground">{entry.subtitle}</p>}
      {entry.description !== '' && (
        <p>
          <Prose text={entry.description} />
        </p>
      )}
      {entry.bullets.length > 0 && (
        <ul className="ml-3 list-disc">
          {entry.bullets.map((bullet, index) => (
            <li key={index}>
              <Prose text={bullet} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockBody({ block }: { block: ResumeBlock }) {
  if (block.kind === 'text') {
    return (
      <p>
        <Prose text={block.text} />
      </p>
    );
  }
  if (block.kind === 'lines') {
    return block.lines.map(({ label, text }) => (
      <p key={label}>
        <strong>{label}:</strong> {text}
      </p>
    ));
  }
  return block.entries.map((entry, index) => <Entry key={index} entry={entry} />);
}

/** An on-screen likeness of the PDF, updated as the learner types, in the chosen design. */
export function ResumePreview({ resume }: { resume: Resume }) {
  const model = resumeDocument(resume);
  const { design } = resume;
  const look = RESUME_TEMPLATE_STYLES[resume.template];
  const accent = ACCENT_CLASSES[design.accent];
  return (
    <article
      aria-label="Resume preview"
      className={cn(
        'rounded-md border border-border bg-background leading-snug',
        FONT_CLASSES[design.font],
        FONT_SIZE_CLASSES[design.fontSize],
        PAGE_PADDING_CLASSES[design.margins],
      )}
    >
      <header className={look.align === 'center' ? 'text-center' : ''}>
        <h2 className={cn('text-xl font-bold', look.accentName && accent.text)}>{model.name}</h2>
        {model.headline !== '' && <p>{model.headline}</p>}
        <p className="mt-1 text-muted-foreground">{model.contact.join('  |  ')}</p>
      </header>
      {model.blocks.map((block) => (
        <section key={block.id} className={SECTION_GAP_CLASSES[design.spacing]}>
          <h3
            className={cn(
              'mb-1 pb-0.5 font-bold',
              accent.text,
              look.uppercaseHeadings ? 'text-[0.95em] uppercase tracking-wider' : 'text-[1.05em]',
              look.rule && cn('border-b', accent.border),
            )}
          >
            {block.heading}
          </h3>
          <BlockBody block={block} />
        </section>
      ))}
    </article>
  );
}
