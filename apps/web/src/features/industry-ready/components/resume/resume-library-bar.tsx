'use client';

import { RESUMES_MAX } from '@siliconbox/shared';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { TextField } from '@/components/ui/text-field';
import type { ResumeWorkspace } from '../../hooks/use-resume-workspace';

/** The open resume, chosen from the learner's list. */
function ResumePicker({ workspace }: { workspace: ResumeWorkspace }) {
  const id = useId();
  const { list, editor, pending } = workspace;
  const { publicId, title } = editor.draft;
  return (
    <Field id={id} label="Resume">
      <select
        id={id}
        value={publicId ?? ''}
        disabled={pending}
        onChange={(e) => void workspace.open(e.target.value)}
        className="h-10 w-56 rounded-md border border-border bg-background px-2 text-sm"
      >
        {publicId === null && <option value="">{title} (not saved yet)</option>}
        {list.map((resume) => (
          <option key={resume.publicId} value={resume.publicId}>
            {resume.title}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Which resume is open, its name, and adding, copying or deleting one (up to RESUMES_MAX). */
export function ResumeLibraryBar({ workspace }: { workspace: ResumeWorkspace }) {
  const { list, editor, pending } = workspace;
  const full = list.length >= RESUMES_MAX;
  async function remove() {
    if (window.confirm(`Delete "${editor.draft.title}"? This cannot be undone.`))
      await workspace.remove();
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      <ResumePicker workspace={workspace} />
      <TextField
        label="Name"
        className="w-64"
        maxLength={60}
        value={editor.draft.title}
        onChange={(e) => editor.rename(e.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={full || pending}
        onClick={() => void workspace.addBlank()}
      >
        New
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={full || pending}
        onClick={() => void workspace.duplicate()}
      >
        Duplicate
      </Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => void remove()}>
        Delete
      </Button>
      {full && (
        <p className="text-[12px] text-muted-foreground">
          You keep {RESUMES_MAX} resumes, the most allowed.
        </p>
      )}
    </div>
  );
}
