'use client';

import { type KeyboardEvent, useRef } from 'react';

const INDENT = '  ';

type CodeEditorProps = {
  label: string;
  value: string;
  onChange?: (value: string) => void;
};

/**
 * A plain code editor: monospace text area with line numbers, Tab indents. Esc, then Tab, leaves
 * the editor, so keyboard users are never trapped. Read-only when there is no `onChange`.
 */
export function CodeEditor({ label, value, onChange }: CodeEditorProps) {
  const leaving = useRef(false);
  const lines = value.split('\n').length;

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') leaving.current = true;
    if (event.key !== 'Tab' || leaving.current || onChange === undefined) return;
    event.preventDefault();
    const { selectionStart, selectionEnd } = event.currentTarget;
    const next = value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd);
    onChange(next);
    const caret = selectionStart + INDENT.length;
    requestAnimationFrame(() => event.currentTarget.setSelectionRange(caret, caret));
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-auto bg-background font-mono text-[13px] leading-[20px]">
      <pre
        aria-hidden="true"
        className="sticky left-0 select-none border-r border-border bg-muted px-3 py-3 text-right text-muted-foreground"
      >
        {Array.from({ length: lines }, (_, index) => index + 1).join('\n')}
      </pre>
      <textarea
        aria-label={label}
        value={value}
        readOnly={onChange === undefined}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          leaving.current = false;
        }}
        rows={lines}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        className="min-w-0 flex-1 resize-none overflow-hidden whitespace-pre bg-transparent px-3 py-3 outline-none read-only:text-muted-foreground"
      />
    </div>
  );
}
