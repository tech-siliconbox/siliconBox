import { Fragment } from 'react';

/** Plain text with `backtick` spans shown as inline code. */
export function Prose({ text }: { text: string }) {
  return text.split('`').map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="bg-muted px-1 font-mono text-[12px] text-foreground">
        {part}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
