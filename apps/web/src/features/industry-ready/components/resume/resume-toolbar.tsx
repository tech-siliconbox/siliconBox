'use client';

import { Button } from '@/components/ui/button';
import type { SaveStatus } from '../../hooks/use-resume-draft';
import type { ResumeWorkspace } from '../../hooks/use-resume-workspace';
import { ExportMenu } from './export-menu';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  invalid: 'Not saved: fix the field named below',
  error: 'Not saved',
};

const PANELS = {
  sections: 'Sections',
  design: 'Design',
  check: 'Check',
  import: 'Import',
  tailor: 'Tailor with AI',
} as const;
export type PanelName = keyof typeof PANELS;

type ResumeToolbarProps = {
  workspace: ResumeWorkspace;
  panel: PanelName | null;
  panelId: string;
  onPanel: (panel: PanelName) => void;
};

/** Save state, undo and redo, the panels, and downloads; stays in view while scrolling. */
export function ResumeToolbar({ workspace, panel, panelId, onPanel }: ResumeToolbarProps) {
  const { editor } = workspace;
  return (
    <div className="sticky top-[53px] z-40 flex flex-wrap items-center gap-2 border-b border-border bg-background py-3">
      <p
        role="status"
        className="mr-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
      >
        {STATUS_TEXT[editor.status]}
      </p>
      <Button size="sm" variant="secondary" disabled={!editor.canUndo} onClick={editor.undo}>
        Undo
      </Button>
      <Button size="sm" variant="secondary" disabled={!editor.canRedo} onClick={editor.redo}>
        Redo
      </Button>
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        {(Object.keys(PANELS) as PanelName[]).map((name) => (
          <Button
            key={name}
            size="sm"
            variant="secondary"
            aria-expanded={panel === name}
            aria-controls={panelId}
            onClick={() => onPanel(name)}
          >
            {PANELS[name]}
          </Button>
        ))}
        <ExportMenu resume={editor.draft.resume} settle={workspace.settle} />
      </div>
    </div>
  );
}
