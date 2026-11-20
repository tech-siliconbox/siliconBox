'use client';

import { type KeyboardEvent, useState } from 'react';
import { completion } from '../complete';

type TclConsoleProps = {
  onCommand: (line: string) => Promise<unknown>;
  disabled: boolean;
  /** A command is running: new ones wait for it. */
  busy: boolean;
  propertyNames: readonly string[];
};

/** The console's line, the lines run before (under the arrows) and Tab completion. */
function useConsoleLine(onCommand: TclConsoleProps['onCommand'], propertyNames: readonly string[]) {
  const [line, setLine] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [back, setBack] = useState(0);

  const submit = () => {
    const text = line.trim();
    if (text === '') return;
    if (history.at(-1) !== text) setHistory([...history, text]);
    setBack(0);
    setLine('');
    void onCommand(text);
  };
  const recall = (step: number) => {
    const next = Math.min(history.length, Math.max(0, back + step));
    setBack(next);
    setLine(next === 0 ? '' : (history[history.length - next] ?? ''));
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      recall(event.key === 'ArrowUp' ? 1 : -1);
    } else if (event.key === 'Tab' && line !== '') {
      event.preventDefault();
      const caret = event.currentTarget.selectionStart ?? line.length;
      const head = line.slice(0, caret);
      setLine(head + completion(head, propertyNames) + line.slice(caret));
    }
  };
  return { line, setLine, submit, keys };
}

/** Praman's Tcl console: one line at a time, with history and Tab completion. */
export function TclConsole({ onCommand, disabled, busy, propertyNames }: TclConsoleProps) {
  const { line, setLine, submit, keys } = useConsoleLine(onCommand, propertyNames);
  return (
    <section aria-label="Console" className="flex h-full flex-col bg-background px-3 py-2">
      <form action={submit} className="flex items-center gap-2 font-mono text-[13px]">
        <span aria-hidden="true" className="font-semibold text-info">
          praman&gt;
        </span>
        <input
          aria-label="Tcl console"
          value={line}
          onChange={(event) => setLine(event.target.value)}
          onKeyDown={keys}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder={disabled ? 'No session' : 'Type a Tcl command, e.g. source pm.tcl'}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {busy && (
          <span
            title="A command is running; new commands wait for it (stop ends a proof)"
            className="size-2 animate-pulse rounded-full bg-info"
          />
        )}
      </form>
      <p className="mt-1 text-[12px] text-muted-foreground">
        <kbd className="font-mono font-semibold">Enter</kbd> run ·{' '}
        <kbd className="font-mono font-semibold">↑ ↓</kbd> history ·{' '}
        <kbd className="font-mono font-semibold">Tab</kbd> complete ·{' '}
        <code className="font-mono font-semibold">help</code> lists the commands
      </p>
    </section>
  );
}
