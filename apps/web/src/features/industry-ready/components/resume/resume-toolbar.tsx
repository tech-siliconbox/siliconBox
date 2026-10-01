'use client';

import { RESUME_TEMPLATES, type Resume } from '@siliconbox/shared';
import { Button } from '@/components/ui/button';
import type { SaveStatus } from '../../hooks/use-resume-draft';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
};

type ResumeToolbarProps = {
  template: Resume['template'];
  status: SaveStatus;
  onTemplate: (template: Resume['template']) => void;
  onSave: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

export function ResumeToolbar({
  template,
  status,
  onTemplate,
  onSave,
  onDownload,
  onDelete,
}: ResumeToolbarProps) {
  return (
    <div className="sticky top-[53px] z-40 flex flex-wrap items-center gap-3 border-b border-border bg-background py-3">
      <label className="flex items-center gap-2 text-sm">
        Template
        <select
          value={template}
          onChange={(e) => onTemplate(e.target.value as Resume['template'])}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          {RESUME_TEMPLATES.map((name) => (
            <option key={name} value={name}>
              {name === 'classic' ? 'Classic' : 'Compact'}
            </option>
          ))}
        </select>
      </label>
      <p
        role="status"
        className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
      >
        {STATUS_TEXT[status]}
      </p>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="secondary" onClick={onDelete}>
          Delete resume
        </Button>
        <Button size="sm" variant="secondary" disabled={status === 'saving'} onClick={onSave}>
          Save
        </Button>
        <Button size="sm" disabled={status === 'saving'} onClick={onDownload}>
          Download PDF
        </Button>
      </div>
    </div>
  );
}
