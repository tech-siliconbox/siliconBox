'use client';

import type { PublishedDrill } from '@siliconbox/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useDrillDraft } from '../hooks/use-drill-draft';
import { useDrillRun } from '../hooks/use-drill-run';
import { CodeEditor } from './code-editor';
import { RunOutput } from './run-output';

type Tab = 'design' | 'properties';

type DrillWorkspaceProps = {
  drill: Pick<PublishedDrill, 'publicId' | 'designCode' | 'starterCode' | 'target'>;
  canRun: boolean;
};

const TAB_LABEL: Record<Tab, string> = { design: 'design.sv', properties: 'properties.sv' };

type FileTabsProps = { tabs: Tab[]; active: Tab; onSelect: (tab: Tab) => void };

function FileTabs({ tabs, active, onSelect }: FileTabsProps) {
  return tabs.map((name) => (
    <button
      key={name}
      type="button"
      role="tab"
      aria-selected={active === name}
      onClick={() => onSelect(name)}
      className={cn(
        'h-11 border-b-2 px-4 font-mono text-[13px]',
        active === name
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground',
      )}
    >
      {TAB_LABEL[name]}
      {name === 'design' && <span className="ml-2 text-[11px]">read-only</span>}
    </button>
  ));
}

/** Files, the Run button and the output for one Drill. Only the properties are editable. */
export function DrillWorkspace({ drill, canRun }: DrillWorkspaceProps) {
  const hasDesign = drill.designCode.trim() !== '';
  const [tab, setTab] = useState<Tab>('properties');
  const draft = useDrillDraft(drill.publicId, drill.starterCode);
  const { phase, run } = useDrillRun(drill.publicId);
  const busy = phase.kind === 'starting' || phase.kind === 'waiting';

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-11 items-center border-b border-border px-1" role="tablist">
        <FileTabs
          tabs={hasDesign ? ['design', 'properties'] : ['properties']}
          active={tab}
          onSelect={setTab}
        />
        <div className="ml-auto flex items-center gap-2 pr-2">
          <Button size="sm" variant="secondary" onClick={draft.reset} disabled={busy}>
            Reset code
          </Button>
          <Button size="sm" onClick={() => void run(draft.code)} disabled={busy || !canRun}>
            {busy ? 'Running…' : 'Run verification'}
          </Button>
        </div>
      </div>
      {!canRun && (
        <p role="note" className="border-b border-border bg-muted px-4 py-2 text-[13px]">
          Running Drills needs active tool access. You can still read the Drill and write your
          properties.
        </p>
      )}
      <div className="flex h-[26rem] min-h-0 flex-col border-b border-border" role="tabpanel">
        {tab === 'design' ? (
          <CodeEditor label="design.sv (read-only)" value={drill.designCode} />
        ) : (
          <CodeEditor label="properties.sv" value={draft.code} onChange={draft.update} />
        )}
      </div>
      <RunOutput phase={phase} target={drill.target} />
    </div>
  );
}
