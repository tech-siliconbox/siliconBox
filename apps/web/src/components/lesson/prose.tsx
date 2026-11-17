import { type InlineNode, parseInlineText } from '@siliconbox/shared';
import { Fragment } from 'react';

/** Inline lesson text: `code`, **strong** and *emphasis* (format in packages/shared/src/inline-text.ts). */
export function Prose({ text }: { text: string }) {
  return <InlineNodes nodes={parseInlineText(text)} />;
}

function InlineNodes({ nodes }: { nodes: InlineNode[] }) {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>;
      case 'code':
        return (
          <code key={index} className="bg-muted px-1 font-mono text-[12px] text-foreground">
            {node.text}
          </code>
        );
      case 'strong':
        return (
          <strong key={index} className="font-semibold text-foreground">
            <InlineNodes nodes={node.children} />
          </strong>
        );
      case 'em':
        return (
          <em key={index}>
            <InlineNodes nodes={node.children} />
          </em>
        );
    }
  });
}

type Chunk = { kind: 'paragraph'; text: string } | { kind: 'bullets'; items: string[] };

/** Blank lines separate paragraphs; consecutive "- " lines form a bullet list. */
function chunk(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const line of text.split('\n').map((raw) => raw.trim())) {
    const last = chunks.at(-1);
    if (line === '') {
      chunks.push({ kind: 'paragraph', text: '' });
    } else if (line.startsWith('- ')) {
      if (last?.kind === 'bullets') last.items.push(line.slice(2));
      else chunks.push({ kind: 'bullets', items: [line.slice(2)] });
    } else if (last?.kind === 'paragraph' && last.text !== '') {
      last.text += ` ${line}`;
    } else {
      chunks.push({ kind: 'paragraph', text: line });
    }
  }
  return chunks.filter((part) => part.kind === 'bullets' || part.text !== '');
}

/** Multi-line text (callouts, list items, answers, table cells): paragraphs and bullets. */
export function TextBody({ text }: { text: string }) {
  return (
    <div className="[&>*+*]:mt-2">
      {chunk(text).map((part, index) =>
        part.kind === 'paragraph' ? (
          <p key={index}>
            <Prose text={part.text} />
          </p>
        ) : (
          <ul key={index} className="list-disc pl-5">
            {part.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Prose text={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
