import 'server-only';
import type { LessonBlock } from '@siliconbox/shared';
import { Eyebrow } from '@/components/ui/eyebrow';
import { sanitizeSvg } from '@/server/sanitize-svg';
import { Prose } from './prose';

const PRE =
  'mb-4 overflow-x-auto whitespace-pre rounded-sm border border-border bg-muted/40 p-4 font-mono text-[12px] leading-relaxed';

/** Renders one lesson block on the server. Paid content never reaches a client component. */
export function LessonBlockRenderer({ block }: { block: LessonBlock }) {
  switch (block.blockType) {
    case 'heading':
      return block.level === '2' ? (
        <h2 className="mb-3 mt-10 text-2xl font-bold">{block.text}</h2>
      ) : (
        <h3 className="mb-3 mt-8 text-base font-semibold">{block.text}</h3>
      );
    case 'paragraph':
      return (
        <p className="mb-4 text-base leading-relaxed text-muted-foreground">
          <Prose text={block.text} />
        </p>
      );
    case 'code':
      return (
        <pre className={PRE} data-language={block.language}>
          <code>{block.code}</code>
        </pre>
      );
    case 'assertion':
      return (
        <figure className="mb-4">
          <Eyebrow className="mb-2">Assertion</Eyebrow>
          <pre className={PRE}>
            <code>{block.code}</code>
          </pre>
          {block.caption && (
            <figcaption className="text-[13px] text-muted-foreground">{block.caption}</figcaption>
          )}
        </figure>
      );
    case 'callout':
      return (
        <aside role="note" className="mb-5 rounded border border-border bg-muted p-4 text-[14px]">
          <Eyebrow className="mb-2">{block.tone}</Eyebrow>
          <Prose text={block.text} />
        </aside>
      );
    case 'diagram':
      return (
        <figure
          role="img"
          aria-label={block.alt}
          className="mb-5 overflow-x-auto rounded border border-border p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[28rem] [&_svg]:max-w-full"
          // Sanitised to drawing elements only (src/server/sanitize-svg.ts).
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(block.svg) }}
        />
      );
  }
}
