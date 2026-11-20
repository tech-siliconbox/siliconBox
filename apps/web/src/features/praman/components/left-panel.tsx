'use client';

import { useState } from 'react';
import type { PramanSnapshot } from '../praman-snapshot';
import { FilesPanel } from './files-panel';
import { HierarchyPanel } from './hierarchy-panel';
import { PanelTabs } from './panel-tabs';

type LeftPanelProps = {
  snapshot: PramanSnapshot | null;
  /** The instance whose properties the table shows ('' for all). */
  instance: string;
  onInstance: (path: string) => void;
  /** Opens a file, at a line (from 1) when there is one. */
  onOpen: (name: string, line?: number) => void;
  onDelete: (name: string) => Promise<unknown>;
};

/** The design's hierarchy (choose an instance to show its properties), and the session's files. */
export function LeftPanel({ snapshot, instance, onInstance, onOpen, onDelete }: LeftPanelProps) {
  const [tab, setTab] = useState('hierarchy');
  const files = snapshot?.files ?? [];
  const tabs = [
    { id: 'hierarchy', label: 'Design Hierarchy' },
    { id: 'files', label: files.length === 0 ? 'Files' : `Files (${files.length})` },
  ];
  return (
    <aside className="flex w-72 shrink-0 flex-col border border-border bg-background">
      <PanelTabs label="Design" tabs={tabs} active={tab} onSelect={setTab} />
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {tab === 'files' ? (
          <FilesPanel files={files} onOpen={onOpen} onDelete={onDelete} />
        ) : (
          <HierarchyPanel
            tree={snapshot?.tree ?? null}
            properties={snapshot?.properties ?? []}
            selected={instance}
            onSelect={onInstance}
            onSource={onOpen}
            analyzed={snapshot?.phase === 'analyzed'}
          />
        )}
      </div>
    </aside>
  );
}
