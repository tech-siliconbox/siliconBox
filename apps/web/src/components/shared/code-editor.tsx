'use client';

import { type KeyboardEvent, type RefObject, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

const INDENT = '  ';

type CodeEditorProps = {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  /** A line to show: scrolled to, selected and marked (a new object each time it is asked for). */
  goto?: { line: number } | null;
};

/** Selects line `line` (from 1) of the text and scrolls its number into the middle of the view. */
function showLine(area: HTMLTextAreaElement, gutter: HTMLElement | null, line: number) {
  const lines = area.value.split('\n');
  const at = Math.max(1, Math.min(line, lines.length));
  const start = lines.slice(0, at - 1).reduce((sum, text) => sum + text.length + 1, 0);
  area.focus({ preventScroll: true });
  area.setSelectionRange(start, start + (lines[at - 1]?.length ?? 0));
  gutter?.children[at - 1]?.scrollIntoView({ block: 'center' });
}

/**
 * A plain code editor: monospace text area with line numbers, Tab indents. Esc, then Tab, leaves
 * the editor, so keyboard users are never trapped. Read-only when there is no `onChange`.
 */
export function CodeEditor({ label, value, onChange, goto = null }: CodeEditorProps) {
  const leaving = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLPreElement>(null);
  const lines = value.split('\n').length;
  useEffect(() => {
    if (goto !== null && area.current !== null) showLine(area.current, gutter.current, goto.line);
  }, [goto]);

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
      <Gutter ref={gutter} lines={lines} marked={goto?.line ?? 0} />
      <textarea
        ref={area}
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

type GutterProps = { ref: RefObject<HTMLPreElement | null>; lines: number; marked: number };

/** The line numbers beside the text; the line asked for is marked. */
function Gutter({ ref, lines, marked }: GutterProps) {
  return (
    <pre
      ref={ref}
      aria-hidden="true"
      className="sticky left-0 select-none border-r border-border bg-muted px-3 py-3 text-right text-muted-foreground"
    >
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={cn(
            'block',
            index + 1 === marked && 'bg-warning/30 font-semibold text-foreground',
          )}
        >
          {index + 1}
        </span>
      ))}
    </pre>
  );
}
