'use client';

import type { ToolEvent } from '@siliconbox/shared';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

const KIND_CLASS: Readonly<Record<string, string>> = {
  cmd: 'font-semibold text-foreground',
  error: 'text-destructive',
  warning: 'text-warning',
  result: 'text-info',
};

type LogPanelProps = {
  events: ToolEvent[];
  onCommand: (line: string) => Promise<unknown>;
  disabled: boolean;
};

/** The session's log, newest at the bottom, and the Tcl console under it. */
export function LogPanel({ events, onCommand, disabled }: LogPanelProps) {
  const end = useRef<HTMLDivElement>(null);
  const shown = events.filter((event) => event.kind !== 'ui' && event.kind !== 'engine');
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [shown.length]);

  return (
    <section aria-label="Log and console" className="flex min-h-0 flex-col border-t border-border">
      <div
        role="log"
        aria-live="polite"
        className="min-h-0 flex-1 overflow-auto bg-muted px-3 py-2 font-mono text-[12px] leading-[18px]"
      >
        {shown.map((event) => (
          <div
            key={event.seq}
            className={cn(
              'whitespace-pre-wrap break-words',
              KIND_CLASS[event.kind] ?? 'text-muted-foreground',
            )}
          >
            {event.kind === 'cmd' ? `% ${event.text}` : event.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      <TclConsole onCommand={onCommand} disabled={disabled} />
    </section>
  );
}

/** One line at a time, with the lines run before under the up and down arrows. */
function TclConsole({ onCommand, disabled }: Omit<LogPanelProps, 'events'>) {
  const [line, setLine] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [back, setBack] = useState(0);

  const submit = () => {
    const text = line.trim();
    if (text === '') return;
    setHistory((before) => [...before, text]);
    setBack(0);
    setLine('');
    void onCommand(text);
  };

  const recall = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = Math.min(history.length, Math.max(0, back + step));
    setBack(next);
    setLine(next === 0 ? '' : (history[history.length - next] ?? ''));
  };

  return (
    <form action={submit} className="flex items-center gap-2 border-t border-border px-3 py-1.5">
      <span aria-hidden="true" className="font-mono text-[12px] text-muted-foreground">
        %
      </span>
      <input
        aria-label="Tcl console"
        value={line}
        onChange={(event) => setLine(event.target.value)}
        onKeyDown={recall}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        placeholder="Type a command, for example: prove -all"
        className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none"
      />
    </form>
  );
}
