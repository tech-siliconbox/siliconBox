'use client';

import type { ChangeEvent, Ref } from 'react';

/** File types Praman reads: design, SVA, Tcl, file lists and connectivity sheets. */
const ACCEPT = '.sv,.v,.svh,.vh,.tcl,.f,.csv,.txt';

type FilePickerProps = {
  ref: Ref<HTMLInputElement>;
  onAdd: (files: { name: string; text: string }[]) => Promise<unknown>;
};

/** The hidden file input behind Add Files: reads the chosen files as text. */
export function FilePicker({ ref, onAdd }: FilePickerProps) {
  const add = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    const read = chosen.map(async (file) => ({ name: file.name, text: await file.text() }));
    await onAdd(await Promise.all(read));
  };
  return (
    <input
      ref={ref}
      type="file"
      multiple
      accept={ACCEPT}
      onChange={(event) => void add(event)}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}
