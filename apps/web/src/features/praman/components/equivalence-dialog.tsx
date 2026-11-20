'use client';

import { useState } from 'react';
import { equivalenceLine, revisedCandidates } from '../check-commands';
import { Choice } from './choice';
import { type CheckDialogProps, DialogFoot } from './dialog-foot';
import { ToolDialog } from './tool-dialog';

/** Chooses the revised design's files and checks them against the analyzed design. */
export function EquivalenceDialog({ snapshot, onRun, onClose }: CheckDialogProps) {
  const candidates = revisedCandidates(snapshot?.files ?? []);
  const [chosen, setChosen] = useState<string[]>([]);
  const [bounded, setBounded] = useState(false);
  const toggle = (name: string, on: boolean) =>
    setChosen(on ? [...chosen, name] : chosen.filter((each) => each !== name));
  return (
    <ToolDialog title="Equivalence Check" onClose={onClose}>
      <p className="mb-3">
        The analyzed design is the original. Choose the files of the revised design (files not
        analyzed in this session); add them with File &gt; Add Files first.
      </p>
      <fieldset className="mb-3 border border-border p-2">
        <legend className="px-1 text-[12px] text-muted-foreground">Revised design</legend>
        {candidates.length === 0 ? (
          <p className="text-muted-foreground">No other design files in the session.</p>
        ) : (
          candidates.map((name) => (
            <Choice
              key={name}
              type="checkbox"
              checked={chosen.includes(name)}
              onChange={(on) => toggle(name, on)}
            >
              <span className="font-mono">{name}</span>
            </Choice>
          ))
        )}
      </fieldset>
      <Choice type="checkbox" checked={bounded} onChange={setBounded}>
        Bounded check only (quicker; no full proof)
      </Choice>
      <DialogFoot
        line={chosen.length === 0 ? null : equivalenceLine(chosen, bounded)}
        missing="Choose at least one file."
        okLabel="Check"
        onRun={onRun}
        onClose={onClose}
      />
    </ToolDialog>
  );
}
