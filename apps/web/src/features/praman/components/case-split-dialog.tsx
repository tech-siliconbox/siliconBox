'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { TextAreaField } from '@/components/ui/text-area-field';
import { type SplitKind, caseSplitLine } from '../check-commands';
import type { PramanProperty } from '../praman-snapshot';
import { DialogFoot } from './dialog-foot';
import { ToolDialog } from './tool-dialog';

const KINDS: readonly { value: SplitKind; label: string; hint: string }[] = [
  {
    value: 'lowest_bit',
    label: 'Lowest 1-bit of an expression',
    hint: 'One case per position of the lowest 1-bit of the expression.',
  },
  {
    value: 'values',
    label: 'Each value of an expression',
    hint: 'One case per value of the expression (up to 10 bits wide).',
  },
  {
    value: 'cases',
    label: 'My own cases',
    hint: 'One expression per line, as it could be written in the assertion.',
  },
];

type CaseSplitDialogProps = {
  property: PramanProperty;
  onRun: (line: string) => void;
  onClose: () => void;
};

/** Proves an assertion as one assertion per case, plus one for the rest. */
export function CaseSplitDialog({ property, onRun, onClose }: CaseSplitDialogProps) {
  const [kind, setKind] = useState<SplitKind>('lowest_bit');
  const [text, setText] = useState('');
  const name = property.name.split(':')[0] ?? property.name;
  const chosen = KINDS.find((each) => each.value === kind);
  return (
    <ToolDialog title="Case Split" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p>
          <b className="font-mono">{name}</b> is proven as one assertion per case, plus one for the
          rest, so nothing is left out. It is proven when all of them are.
        </p>
        <SelectField label="Split by" value={kind} options={KINDS} onChange={setKind} />
        <TextAreaField
          label={kind === 'cases' ? 'Cases' : 'Expression'}
          rows={kind === 'cases' ? 4 : 2}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
        <p className="text-muted-foreground">{chosen?.hint}</p>
      </div>
      <DialogFoot
        line={caseSplitLine(name, kind, text)}
        missing={kind === 'cases' ? 'Enter at least one case.' : 'Enter the expression.'}
        okLabel="Split"
        onRun={onRun}
        onClose={onClose}
      />
    </ToolDialog>
  );
}
