'use client';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import type { CommandSpec } from '../command-specs';

type CommandFormProps = {
  spec: CommandSpec;
  onRun: (line: string) => Promise<unknown>;
  onClose: () => void;
};

/** A small form for one menu command (elaborate, clock and reset, limits); runs its Tcl line. */
export function CommandForm({ spec, onRun, onClose }: CommandFormProps) {
  const run = (data: FormData) => {
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const values = Object.fromEntries(spec.fields.map((field) => [field.name, text(field.name)]));
    void onRun(spec.build(values));
    onClose();
  };
  return (
    <form
      action={run}
      aria-label={spec.title}
      className="flex flex-col gap-3 border-b border-border bg-muted p-4"
    >
      <h2 className="text-[14px] font-semibold">{spec.title}</h2>
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
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Run
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
