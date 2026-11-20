import { Button } from '@/components/ui/button';
import type { PramanSnapshot } from '../praman-snapshot';

/** What a check's dialog is given: the session's state, and how to run its line. */
export type CheckDialogProps = {
  snapshot: PramanSnapshot | null;
  onRun: (line: string) => void;
  onClose: () => void;
};

type DialogFootProps = {
  /** The Tcl line the dialog runs; null until what it needs is given. */
  line: string | null;
  /** What to say while `line` is null. */
  missing: string;
  okLabel: string;
  onRun: (line: string) => void;
  onClose: () => void;
};

/** The foot of a check's dialog: the command it runs, then Cancel and the button that runs it. */
export function DialogFoot({ line, missing, okLabel, onRun, onClose }: DialogFootProps) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-[12px] text-muted-foreground">
        {line === null ? (
          missing
        ) : (
          <>
            Runs <code className="break-all font-mono text-foreground">{line}</code>
          </>
        )}
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={line === null}
          onClick={() => {
            if (line === null) return;
            onRun(line);
            onClose();
          }}
        >
          {okLabel}
        </Button>
      </div>
    </div>
  );
}
