'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { bitInputs, clockResetDefaults, clockResetLine } from '../command-specs';
import { DialogFoot, type CheckDialogProps } from './dialog-foot';
import { ToolDialog } from './tool-dialog';

const LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
] as const;

/**
 * Declares the clock and the reset from the top module's 1-bit inputs, filled in with the ones
 * already declared or, before that, the ones Praman found in the design.
 */
export function ClockResetDialog({ snapshot, onRun, onClose }: CheckDialogProps) {
  const [chosen, setChosen] = useState(() => clockResetDefaults(snapshot));
  const inputs = bitInputs(snapshot?.ports ?? []);
  const options = (none: string) => [
    { value: '', label: none },
    ...inputs.map((name) => ({ value: name, label: name })),
  ];
  return (
    <ToolDialog title="Clock and Reset" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SelectField
          label="Clock"
          value={chosen.clock}
          options={options('None (a combinational design)')}
          onChange={(clock) => setChosen({ ...chosen, clock })}
        />
        <SelectField
          label="Reset"
          value={chosen.reset}
          options={options('None')}
          onChange={(reset) => setChosen({ ...chosen, reset })}
        />
        {chosen.reset !== '' && (
          <SelectField
            label="Reset is active"
            value={chosen.low ? 'low' : 'high'}
            options={LEVELS}
            onChange={(level) => setChosen({ ...chosen, low: level === 'low' })}
          />
        )}
        <p className="text-muted-foreground">Changing either clears the proof results.</p>
      </div>
      <DialogFoot
        line={clockResetLine(chosen)}
        missing=""
        okLabel="Apply"
        onRun={onRun}
        onClose={onClose}
      />
    </ToolDialog>
  );
}
