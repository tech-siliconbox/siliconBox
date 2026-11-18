import 'server-only';
import type { LessonBlock, LessonBlockType } from '@siliconbox/shared';
import type { ReactNode } from 'react';
import { Eyebrow } from '@/components/ui/eyebrow';
import { sanitizeSvg } from '@/server/sanitize-svg';
import { LessonList } from './lesson-list';
import { LessonTable } from './lesson-table';
import { Prose, TextBody } from './prose';
import { REVEAL_SUMMARY } from './reveal-summary';
import { StateGraphFigure } from './state-graph/state-graph-figure';

const HEADING_CLASS = {
  '2': 'mb-3 mt-10 text-2xl font-bold',
  '3': 'mb-3 mt-8 text-base font-semibold',
  '4': 'mb-2 mt-6 text-[15px] font-semibold',
} as const;

const PRE =
  'mb-4 overflow-x-auto whitespace-pre rounded-sm border border-border bg-muted/40 p-4 font-mono text-[12px] leading-relaxed';

type Renderers = {
  [Type in LessonBlockType]: (block: Extract<LessonBlock, { blockType: Type }>) => ReactNode;
};

const RENDERERS: Renderers = {
  heading: ({ level, text }) => {
    const Tag = `h${level}` as const;
    return <Tag className={HEADING_CLASS[level]}>{text}</Tag>;
  },
  paragraph: ({ text }) => (
    <p className="mb-4 text-base leading-relaxed text-muted-foreground">
      <Prose text={text} />
    </p>
  ),
  code: ({ code, language, filename }) => (
    <figure className="mb-4">
      {filename && (
        <figcaption className="rounded-t-sm border border-b-0 border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
          {filename}
        </figcaption>
      )}
      <pre className={PRE} data-language={language}>
        <code>{code}</code>
      </pre>
    </figure>
  ),
  assertion: ({ code, caption }) => (
    <figure className="mb-4">
      <Eyebrow className="mb-2">Assertion</Eyebrow>
      <pre className={PRE}>
        <code>{code}</code>
      </pre>
      {caption && <figcaption className="text-[13px] text-muted-foreground">{caption}</figcaption>}
    </figure>
  ),
  callout: ({ title, tone, text }) => (
    <aside role="note" className="mb-5 rounded border border-border bg-muted p-4 text-[14px]">
      <Eyebrow className="mb-2">{title ?? tone}</Eyebrow>
      <TextBody text={text} />
    </aside>
  ),
  diagram: ({ svg, alt, caption }) => (
    <figure className="mb-5">
      <div
        role="img"
        aria-label={alt}
        className="overflow-x-auto rounded border border-border p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-112 [&_svg]:max-w-full"
        // Sanitised to drawing elements only (src/server/sanitize-svg.ts).
        dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
      />
      {caption && (
        <figcaption className="mt-2 text-[13px] text-muted-foreground">
          <Prose text={caption} />
        </figcaption>
      )}
    </figure>
  ),
  list: (block) => <LessonList block={block} />,
  table: (block) => <LessonTable block={block} />,
  reveal: ({ label, content }) => (
    <details className="mb-5 rounded border border-border p-4">
      <summary className={REVEAL_SUMMARY}>{label}</summary>
      <div className="mt-4">
        {content.map((inner, index) => (
          <LessonBlockRenderer key={index} block={inner} />
        ))}
      </div>
    </details>
  ),
  stateGraph: (block) => <StateGraphFigure graph={block} />,
};

/** Renders one lesson block on the server. Paid text never reaches a client component. */
export function LessonBlockRenderer({ block }: { block: LessonBlock }) {
  // The map is keyed by block type, so each renderer receives its own block shape.
  const render = RENDERERS[block.blockType] as (block: LessonBlock) => ReactNode;
  return render(block);
}
