'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TASK_NAME, taskLine } from '../check-commands';
import { Choice } from './choice';
import { type CheckDialogProps, DialogFoot } from './dialog-foot';
import { ToolDialog } from './tool-dialog';

/** A task: properties proven under assumptions of their own, as `task::name` copies. */
export function TaskDialog({ snapshot, onRun, onClose }: CheckDialogProps) {
  const [name, setName] = useState('');
  const [copyAll, setCopyAll] = useState(true);
  const [assumes, setAssumes] = useState(true);
  const [current, setCurrent] = useState(true);
  const embedded = (snapshot?.properties ?? []).filter(
    (p) => p.task === '' && p.parent === '' && (p.type === 'assert' || p.type === 'cover'),
  );
  const copy = copyAll ? embedded.map((p) => p.id) : [];
  return (
    <ToolDialog title="New Task" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p>
          A task is a set of properties proven under its own assumptions: the copies are named{' '}
          <code className="font-mono">task::name</code>, and Prove works on the current task.
        </p>
        <TextField
          label="Name"
          value={name}
          placeholder="no_backpressure"
          onChange={(event) => setName(event.target.value.trim())}
        />
        <SelectField
          label="Copy"
          value={copyAll ? 'all' : 'none'}
          options={[
            { value: 'all', label: `All assertions and covers (${embedded.length})` },
            { value: 'none', label: 'None (write new ones in the task)' },
          ]}
          onChange={(value) => setCopyAll(value === 'all')}
        />
        <Choice type="checkbox" checked={assumes} onChange={setAssumes}>
          Copy the assumptions (then disable or add some in the task)
        </Choice>
        <Choice type="checkbox" checked={current} onChange={setCurrent}>
          Make it the current task
        </Choice>
      </div>
      <DialogFoot
        line={TASK_NAME.test(name) ? taskLine(name, copy, assumes, current) : null}
        missing="Name the task: letters, digits and _, not starting with a digit."
        okLabel="Create"
        onRun={onRun}
        onClose={onClose}
      />
    </ToolDialog>
  );
}
