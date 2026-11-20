'use client';

import { API_ROUTES } from '@siliconbox/shared';
import { useState } from 'react';
import { CodeEditor } from '@/components/shared/code-editor';
import { Button } from '@/components/ui/button';
import { readText, useJson } from '../hooks/use-json';

type SourceEditorProps = {
  sessionId: string;
  name: string;
  /** A line to show, when the file was opened at one. */
  goto: { line: number } | null;
  onSave: (name: string, text: string) => Promise<string | null>;
  onClose: () => void;
};

/** One session file in the editor; saving puts it back into the session. */
export function SourceEditor({ sessionId, name, goto, onSave, onClose }: SourceEditorProps) {
  const url = `${API_ROUTES.toolSessionFiles(sessionId)}?name=${encodeURIComponent(name)}`;
  const { data, error, loading } = useJson(url, readText);
  if (loading) return <p className="p-4 text-[13px] text-muted-foreground">Opening {name}…</p>;
  if (data === null) return <p className="p-4 text-[13px] text-destructive">{error}</p>;
  return (
    <Draft key={name} name={name} initial={data} goto={goto} onSave={onSave} onClose={onClose} />
  );
}

type DraftProps = Omit<SourceEditorProps, 'sessionId'> & { initial: string };

function Draft({ name, initial, goto, onSave, onClose }: DraftProps) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const save = async () => {
    if ((await onSave(name, text)) === null) setSaved(text);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="font-mono text-[12px] font-semibold">{name}</span>
        {text !== saved && <span className="text-[11px] text-muted-foreground">Not saved</span>}
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => void save()} disabled={text === saved}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
      <CodeEditor label={name} value={text} onChange={setText} goto={goto} />
    </div>
  );
}
