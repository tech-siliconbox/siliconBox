'use client';

import { useState } from 'react';
import type { PramanSnapshot } from '../praman-snapshot';
import { FilesPanel } from './files-panel';
import { HierarchyPanel } from './hierarchy-panel';
import { PanelTabs } from './panel-tabs';

const TABS = [
  { id: 'hierarchy', label: 'Design Hierarchy' },
  { id: 'files', label: 'Files' },
] as const;

type LeftPanelProps = {
  snapshot: PramanSnapshot | null;
  onOpen: (name: string) => void;
  onDelete: (name: string) => Promise<unknown>;
};

/** The design's hierarchy, and the session's files. */
export function LeftPanel({ snapshot, onOpen, onDelete }: LeftPanelProps) {
  const [tab, setTab] = useState<string>(TABS[0].id);
  return (
    <aside className="flex w-72 shrink-0 flex-col border border-border bg-background">
      <PanelTabs label="Design" tabs={TABS} active={tab} onSelect={setTab} />
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {tab === 'files' ? (
          <FilesPanel files={snapshot?.files ?? []} onOpen={onOpen} onDelete={onDelete} />
        ) : (
          <HierarchyPanel tree={snapshot?.tree ?? null} />
        )}
      </div>
    </aside>
  );
}
