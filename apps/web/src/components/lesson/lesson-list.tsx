import type { LessonBlock } from '@siliconbox/shared';
import { cn } from '@/lib/cn';
import { TextBody } from './prose';
import { REVEAL_SUMMARY } from './reveal-summary';

type ListBlock = Extract<LessonBlock, { blockType: 'list' }>;

/** A lesson list; review questions carry their answer behind "Show answer". */
export function LessonList({ block }: { block: ListBlock }) {
  const List = block.ordered ? 'ol' : 'ul';
  return (
    <List
      start={block.ordered ? (block.start ?? undefined) : undefined}
      className={cn(
        'mb-4 flex flex-col gap-2 pl-6 text-base leading-relaxed text-muted-foreground',
        block.ordered ? 'list-decimal' : 'list-disc',
      )}
    >
      {block.items.map((item, index) => (
        <li key={index}>
          <TextBody text={item.text} />
          {item.answer && (
            <details className="mt-1">
              <summary className={REVEAL_SUMMARY}>Show answer</summary>
              <div className="mt-1 border-l-2 border-border pl-3 text-[14px]">
                <TextBody text={item.answer} />
              </div>
            </details>
          )}
        </li>
      ))}
    </List>
  );
}
