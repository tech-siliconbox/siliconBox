'use client';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import type { CommandSpec } from '../command-specs';
import { ToolDialog } from './tool-dialog';

type CommandDialogProps = {
  spec: CommandSpec;
  onRun: (line: string) => void;
  onClose: () => void;
};

/** The dialog of one menu command (elaborate, clock and reset, limits); runs its Tcl line. */
export function CommandDialog({ spec, onRun, onClose }: CommandDialogProps) {
  const run = (data: FormData) => {
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const values = Object.fromEntries(spec.fields.map((field) => [field.name, text(field.name)]));
    onRun(spec.build(values));
    onClose();
  };
  return (
    <ToolDialog title={spec.title} onClose={onClose}>
      <form action={run} className="flex flex-col gap-3">
        {spec.fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1">
            <TextField
              label={field.label}
              name={field.name}
              type={field.type}
              defaultValue={field.defaultValue}
              min={field.type === 'number' ? 1 : undefined}
              max={field.max}
              required={field.type === 'number'}
            />
            {field.hint !== undefined && (
              <p className="text-[12px] text-muted-foreground">{field.hint}</p>
            )}
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" type="submit">
            Run
          </Button>
        </div>
      </form>
    </ToolDialog>
  );
}
