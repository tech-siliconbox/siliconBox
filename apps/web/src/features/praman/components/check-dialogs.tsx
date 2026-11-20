import type { PramanSnapshot } from '../praman-snapshot';
import type { CheckDialog, ToolAction } from '../tool-actions';
import { AbstractDialog } from './abstract-dialog';
import { ConnectivityDialog } from './connectivity-dialog';
import { EquivalenceDialog } from './equivalence-dialog';
import { TaskDialog } from './task-dialog';

const DIALOGS = {
  equivalence: EquivalenceDialog,
  connectivity: ConnectivityDialog,
  task: TaskDialog,
  abstract: AbstractDialog,
} as const;

type CheckDialogsProps = {
  which: CheckDialog;
  snapshot: PramanSnapshot | null;
  onAction: (action: ToolAction) => void;
  onClose: () => void;
};

/** The deeper checks' dialogs; an equivalence check also opens its result panel. */
export function CheckDialogs({ which, snapshot, onAction, onClose }: CheckDialogsProps) {
  const Dialog = DIALOGS[which];
  const onRun = (line: string) =>
    onAction(
      which === 'equivalence'
        ? { kind: 'report', tab: 'equivalence', line }
        : { kind: 'command', line },
    );
  return <Dialog snapshot={snapshot} onRun={onRun} onClose={onClose} />;
}
