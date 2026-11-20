import { cn } from '@/lib/cn';
import type { PramanSnapshot } from '../praman-snapshot';

type File = PramanSnapshot['files'][number];

type FilesPanelProps = {
  files: File[];
  onOpen: (name: string) => void;
  onDelete: (name: string) => Promise<unknown>;
};

/** The session's files: open one in its own tab, or remove it. */
export function FilesPanel({ files, ...actions }: FilesPanelProps) {
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
        <FileRow key={file.name} file={file} {...actions} />
      ))}
    </ul>
  );
}

function FileIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" className="shrink-0">
      <path
        d="M3.5 2h5.5l3.5 3.5V14h-9z"
        className="fill-background stroke-muted-foreground"
        strokeWidth="1.2"
      />
      <path d="M9 2v3.5h3.5" className="fill-none stroke-muted-foreground" strokeWidth="1.2" />
    </svg>
  );
}

/** A file: its name (bold once analyzed), its size or state, and a remove button on hover. */
function FileRow({ file, onOpen, onDelete }: Omit<FilesPanelProps, 'files'> & { file: File }) {
  return (
    <li className="group flex items-center gap-2 px-2 hover:bg-muted">
      <FileIcon />
      <button
        type="button"
        onClick={() => onOpen(file.name)}
        title={`${file.name}: ${file.lines} lines${file.analyzed ? ', analyzed' : ', not analyzed'}`}
        className={cn(
          'min-w-0 flex-1 truncate py-1 text-left font-mono text-[12px]',
          file.analyzed && 'font-semibold',
        )}
      >
        {file.name}
      </button>
      <span className="text-[11px] text-muted-foreground">
        {file.analyzed ? 'analyzed' : `${file.lines} lines`}
      </span>
      <button
        type="button"
        onClick={() => void onDelete(file.name)}
        aria-label={`Remove ${file.name}`}
        title={`Remove ${file.name} from the session`}
        className="text-[11px] text-muted-foreground opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
      >
        ✕
      </button>
    </li>
  );
}
