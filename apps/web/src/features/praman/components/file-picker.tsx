'use client';

import type { ChangeEvent, Ref } from 'react';
import { ACCEPT, type TextFile, readTextFiles } from '../read-files';

type FilePickerProps = {
  ref: Ref<HTMLInputElement>;
  onAdd: (files: TextFile[]) => Promise<unknown>;
  /** The file types to offer (all Praman reads unless said), and whether several may be chosen. */
  accept?: string;
  multiple?: boolean;
};

/** A hidden file input (behind Add Files, or Run Script From File): reads the chosen files. */
export function FilePicker({ ref, onAdd, accept = ACCEPT, multiple = true }: FilePickerProps) {
  const add = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    await onAdd(await readTextFiles(chosen));
  };
  return (
    <input
      ref={ref}
      type="file"
      multiple={multiple}
      accept={accept}
      onChange={(event) => void add(event)}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}
