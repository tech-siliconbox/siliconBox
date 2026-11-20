'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { type Abstraction, REGISTER, abstractLine } from '../check-commands';
import { type CheckDialogProps, DialogFoot } from './dialog-foot';
import { ToolDialog } from './tool-dialog';

const KINDS: readonly { value: Abstraction; label: string }[] = [
  { value: 'init_value', label: 'Initial value: any value after the reset' },
  { value: 'counter', label: 'Counter: may jump to any value in any cycle' },
];

/** Lets a register do more than the design can: a proof that still holds, holds for the design. */
export function AbstractDialog({ snapshot, onRun, onClose }: CheckDialogProps) {
  const [register, setRegister] = useState('');
  const [kind, setKind] = useState<Abstraction>('init_value');
  const abstracts = snapshot?.abstracts ?? [];
  return (
    <ToolDialog title="Abstract a Register" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p>
          An abstraction lets a register do more than the design can: a proof that still holds holds
          for the real design; a counterexample may need a value the real design never has.
        </p>
        <TextField
          label="Register"
          value={register}
          placeholder="u_core.count"
          onChange={(event) => setRegister(event.target.value.trim())}
        />
        <SelectField label="Abstraction" value={kind} options={KINDS} onChange={setKind} />
        {abstracts.length > 0 && (
          <p className="text-muted-foreground">
            Abstracted now:{' '}
            {abstracts
              .map((a) => `${a.signal} (${a.kind === 'init' ? 'initial value' : 'counter'})`)
              .join(', ')}
          </p>
        )}
      </div>
      <DialogFoot
        line={REGISTER.test(register) ? abstractLine(kind, register) : null}
        missing="Name the register by its path from the top, for example u_core.count."
        okLabel="Abstract"
        onRun={onRun}
        onClose={onClose}
      />
    </ToolDialog>
  );
}
