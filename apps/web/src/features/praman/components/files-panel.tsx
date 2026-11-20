import { cn } from '@/lib/cn';
import type { PramanSnapshot } from '../praman-snapshot';

type FilesPanelProps = {
  files: PramanSnapshot['files'];
  onOpen: (name: string) => void;
  onDelete: (name: string) => Promise<unknown>;
};

/** The session's files: open one in its own tab, or remove it. */
export function FilesPanel({ files, onOpen, onDelete }: FilesPanelProps) {
  if (files.length === 0) {
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted-foreground">
        No files yet. Add your design, SVA and Tcl files with Add Files, or load the example.
      </p>
    );
  }
  return (
    <ul className="flex flex-col py-1">
      {files.map((file) => (
        <li key={file.name} className="group flex items-center gap-2 px-2 hover:bg-muted">
          <button
            type="button"
            onClick={() => onOpen(file.name)}
            className={cn(
              'min-w-0 flex-1 truncate py-1 text-left font-mono text-[12px]',
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
            className="text-[11px] text-muted-foreground opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
