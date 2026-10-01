'use client';

import { type DragEvent, useId, useState } from 'react';
import { cn } from '@/lib/cn';

type DropZoneProps = { file: File | null; onFile: (file: File) => void; disabled: boolean };

const MB = 1024 * 1024;
const sizeLabel = (bytes: number) =>
  bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`;

/** Drag a file in, or click (or press Enter) to choose one. PDF or Word, up to 5 MB. */
export function DropZone({ file, onFile, disabled }: DropZoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped !== undefined && !disabled) onFile(dropped);
  }

  return (
    // Dropping is a mouse convenience; keyboard and screen-reader users use the file input inside.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <label
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed border-border px-6 py-14 text-center transition-colors hover:border-foreground',
        dragging && 'border-foreground bg-muted',
      )}
    >
      <span className="text-lg font-semibold">
        {file === null ? 'Drop your CV here' : file.name}
      </span>
      <span className="text-sm text-muted-foreground">
        {file === null
          ? 'or click to choose · PDF or Word (.docx) · up to 5 MB'
          : `${sizeLabel(file.size)} · click to choose another`}
      </span>
      <input
        id={inputId}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen !== undefined) onFile(chosen);
        }}
      />
    </label>
  );
}
