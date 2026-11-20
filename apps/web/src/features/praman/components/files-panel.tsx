'use client';

import { type ChangeEvent, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { PramanSnapshot } from '../praman-snapshot';

type FilesPanelProps = {
  files: PramanSnapshot['files'];
  onOpen: (name: string) => void;
  onAdd: (files: { name: string; text: string }[]) => Promise<unknown>;
  onDelete: (name: string) => Promise<unknown>;
};

/** The session's files: open one in the editor, add files from this computer, remove one. */
export function FilesPanel({ files, onOpen, onAdd, onDelete }: FilesPanelProps) {
  return (
    <div className="flex flex-col gap-2 p-2">
      <AddFiles onAdd={onAdd} />
      {files.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No files yet.</p>
      ) : (
        <ul className="flex flex-col">
          {files.map((file) => (
            <li key={file.name} className="group flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpen(file.name)}
                className={cn(
                  'min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left font-mono text-[12px] hover:bg-muted',
                  !file.analyzed && 'text-muted-foreground',
                )}
                title={file.analyzed ? 'Analyzed' : 'Not analyzed yet'}
              >
                {file.name}
              </button>
              <button
                type="button"
                onClick={() => void onDelete(file.name)}
                aria-label={`Remove ${file.name}`}
                className="text-[11px] text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Picks design, property and script files on this computer and reads them as text. */
function AddFiles({ onAdd }: Pick<FilesPanelProps, 'onAdd'>) {
  const picker = useRef<HTMLInputElement>(null);
  const add = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    const read = chosen.map(async (file) => ({ name: file.name, text: await file.text() }));
    await onAdd(await Promise.all(read));
  };
  return (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        accept=".sv,.v,.svh,.vh,.tcl,.f,.csv,.txt"
        onChange={(event) => void add(event)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => picker.current?.click()}
        className="self-start text-[12px] font-semibold underline underline-offset-2"
      >
        Add files
      </button>
    </>
  );
}
