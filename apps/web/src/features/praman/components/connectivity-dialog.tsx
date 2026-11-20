'use client';

import { useState } from 'react';
import { connectivityLine, connectivitySheets } from '../check-commands';
import { Choice } from './choice';
import { type CheckDialogProps, DialogFoot } from './dialog-foot';
import { ToolDialog } from './tool-dialog';

/** Loads a spreadsheet of connections: each row becomes an assertion to prove. */
export function ConnectivityDialog({ snapshot, onRun, onClose }: CheckDialogProps) {
  const sheets = connectivitySheets(snapshot?.files ?? []);
  const [chosen, setChosen] = useState(sheets[0] ?? '');
  return (
    <ToolDialog title="Connectivity" onClose={onClose}>
      <p className="mb-3">
        A spreadsheet (CSV) of connections, one per row:{' '}
        <code className="font-mono">name, source, destination, condition, latency</code>. Signals
        are paths from the top module. Each row becomes an assertion: when the condition holds, the
        destination equals the source after <i>latency</i> cycles. Prove them with Prove All.
      </p>
      <fieldset className="border border-border p-2">
        <legend className="px-1 text-[12px] text-muted-foreground">Spreadsheet</legend>
        {sheets.length === 0 ? (
          <p className="text-muted-foreground">
            No spreadsheet in the session; add a .csv file with File &gt; Add Files first.
          </p>
        ) : (
          sheets.map((name) => (
            <Choice
              key={name}
              type="radio"
              name="sheet"
              checked={chosen === name}
              onChange={() => setChosen(name)}
            >
              <span className="font-mono">{name}</span>
            </Choice>
          ))
        )}
      </fieldset>
      <DialogFoot
        line={chosen === '' ? null : connectivityLine(chosen)}
        missing="Add a spreadsheet first."
        okLabel="Load"
        onRun={onRun}
        onClose={onClose}
      />
    </ToolDialog>
  );
}
