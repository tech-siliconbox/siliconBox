'use client';

import {
  API_ROUTES,
  type ToolRunDetail,
  ToolRunDetailSchema,
  ToolRunDiffSchema,
  ToolRunLogSchema,
} from '@siliconbox/shared';
import { useState } from 'react';
import { CodeEditor } from '@/components/shared/code-editor';
import { cn } from '@/lib/cn';
import { readText, useJson } from '../hooks/use-json';
import { PramanPropertySchema, PropertyStatusSchema } from '../praman-snapshot';
import type { FileLine } from '../tool-actions';
import { resetOf } from '../visualize';
import { LogPanel } from './log-panel';
import { PanelTabs } from './panel-tabs';
import { PropertyTable } from './property-table';
import { STATUS_LABEL, StatusIcon } from './status-icon';
import { VisualizeWindow } from './visualize/visualize-window';

const readRun = (body: unknown) => ToolRunDetailSchema.safeParse(body).data ?? null;
const readDiff = (body: unknown) => ToolRunDiffSchema.safeParse(body).data ?? null;
const readLog = (body: unknown) => ToolRunLogSchema.safeParse(body).data?.events ?? null;

const RUN_TABS = ['results', 'changes', 'log', 'files'] as const;
type RunTab = (typeof RUN_TABS)[number];

/** The file shown in the Files tab, and the line asked for in it (0 for none). */
type ShownFile = FileLine | null;

/**
 * One run, as it was: its results (with their kept traces), what changed since the run before,
 * its log, and its files as they were when it started.
 */
export function RunDetail({ runId }: { runId: string }) {
  const { data: run, error } = useJson(API_ROUTES.toolRun(runId), readRun);
  const [tab, setTab] = useState<RunTab>('results');
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<ShownFile>(null);
  if (error !== null) return <p className="text-[13px] text-destructive">{error}</p>;
  if (run === null) return null;
  const tabs = [
    { id: 'results', label: 'Results' },
    { id: 'changes', label: 'Changes' },
    { id: 'log', label: 'Log' },
    { id: 'files', label: `Files (${run.files.length})` },
  ];
  const show = {
    file: (name: string, line = 0) => {
      setFile({ name, line });
      setTab('files');
    },
    property: (id: string) => {
      setSelected(id);
      setTab('results');
    },
  };
  return (
    <section
      aria-label={`Run ${run.number}`}
      className="mt-2 flex h-96 flex-col border border-border"
    >
      <PanelTabs
        label={`Run ${run.number}`}
        tabs={tabs}
        active={tab}
        onSelect={(id) => setTab(RUN_TABS.find((each) => each === id) ?? 'results')}
      />
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === 'results' && (
          <RunResults run={run} selected={selected} onSelect={setSelected} onSource={show.file} />
        )}
        {tab === 'changes' && <RunChanges runId={runId} />}
        {tab === 'log' && (
          <RunLog runId={runId} onLocation={show.file} onProperty={show.property} />
        )}
        {tab === 'files' && <RunFiles run={run} file={file} onFile={show.file} />}
      </div>
    </section>
  );
}

type RunResultsProps = {
  run: ToolRunDetail;
  selected: string | null;
  onSelect: (id: string) => void;
  onSource: (name: string, line: number) => void;
};

/** The run's property table; a kept trace opens in Visualize, a source in the Files tab. */
function RunResults({ run, selected, onSelect, onSource }: RunResultsProps) {
  const [trace, setTrace] = useState<string | null>(null);
  const properties = run.properties.flatMap((raw) => {
    const property = PramanPropertySchema.safeParse(raw).data;
    if (property === undefined) return [];
    return {
      ...property,
      has_trace: property.has_trace && !run.tracesDropped.includes(property.id),
    };
  });
  return (
    <>
      <PropertyTable
        properties={properties}
        instance=""
        tasks={[]}
        task=""
        onTask={() => undefined}
        now={0}
        selected={selected}
        onSelect={onSelect}
        onTrace={(property) => setTrace(property.id)}
        onSource={(property) => property.file !== '' && onSource(property.file, property.line)}
      />
      {trace !== null && (
        <VisualizeWindow
          url={`${API_ROUTES.toolRunTrace(run.id)}?property=${encodeURIComponent(trace)}`}
          title={trace}
          top={run.top}
          reset={resetOf(run.reset)}
          onClose={() => setTrace(null)}
        />
      )}
    </>
  );
}

/** The properties whose result changed since the session's run before, or none. */
function RunChanges({ runId }: { runId: string }) {
  const { data, error } = useJson(API_ROUTES.toolRunDiff(runId), readDiff);
  if (error !== null) return <p className="p-3 text-[13px] text-muted-foreground">{error}</p>;
  if (data === null) return null;
  const rows = [
    ...data.changed,
    ...data.added.map((p) => ({ ...p, before: '' })),
    ...data.removed.map((p) => ({ ...p, after: '' })),
  ];
  if (rows.length === 0) {
    return <p className="p-3 text-[13px]">No property changed since the run before.</p>;
  }
  return (
    <section aria-label="Changes since the run before" className="overflow-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-muted text-[12px] text-muted-foreground">
          <tr>
            <th className="px-3 py-1 font-semibold">Property</th>
            <th className="px-3 py-1 font-semibold">Run before</th>
            <th className="px-3 py-1 font-semibold">This run</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-border/60">
              <td className="px-3 py-1 font-mono">{row.name}</td>
              <StatusCell status={row.before} />
              <StatusCell status={row.after} />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** A result in one of the two runs, as the table shows it; '' when the property was not there. */
function StatusCell({ status }: { status: string }) {
  const known = PropertyStatusSchema.safeParse(status).data;
  return (
    <td className="px-3 py-1">
      {known === undefined ? (
        <span className="text-muted-foreground">{status === '' ? 'not present' : status}</span>
      ) : (
        <span className="flex items-center gap-1.5">
          <StatusIcon status={known} size={13} />
          {STATUS_LABEL[known]}
        </span>
      )}
    </td>
  );
}

type RunLogProps = {
  runId: string;
  onLocation: (name: string, line: number) => void;
  onProperty: (id: string) => void;
};

/** The run's lines of the session's log. */
function RunLog({ runId, onLocation, onProperty }: RunLogProps) {
  const { data, error } = useJson(API_ROUTES.toolRunLog(runId), readLog);
  if (error !== null) return <p className="p-3 text-[13px] text-destructive">{error}</p>;
  if (data === null) return null;
  if (data.length === 0) {
    return (
      <p className="p-3 text-[13px] text-muted-foreground">
        The log of this run is no longer kept: its session has trimmed it.
      </p>
    );
  }
  return <LogPanel events={data} onLocation={onLocation} onProperty={onProperty} />;
}

type RunFilesProps = {
  run: ToolRunDetail;
  file: ShownFile;
  onFile: (name: string) => void;
};

/** The run's files as they were when it started: choose one to read it. */
function RunFiles({ run, file, onFile }: RunFilesProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <ul
        aria-label="Files of the run"
        className="w-48 shrink-0 overflow-auto border-r border-border py-1"
      >
        {run.files.map((each) => (
          <li key={each.name}>
            <button
              type="button"
              aria-pressed={file?.name === each.name}
              onClick={() => onFile(each.name)}
              className={cn(
                'w-full truncate px-3 py-0.5 text-left font-mono text-[12px] hover:bg-muted',
                each.analyzed && 'font-semibold',
                file?.name === each.name && 'bg-info-light',
              )}
            >
              {each.name}
            </button>
          </li>
        ))}
      </ul>
      {file === null ? (
        <p className="p-3 text-[13px] text-muted-foreground">
          The files as they were when the run started. Choose one.
        </p>
      ) : (
        <RunFileText runId={run.id} file={file} />
      )}
    </div>
  );
}

function RunFileText({ runId, file }: { runId: string; file: FileLine }) {
  const url = `${API_ROUTES.toolRunFiles(runId)}?${new URLSearchParams({ name: file.name })}`;
  const { data, error } = useJson(url, readText);
  if (error !== null) return <p className="p-3 text-[13px] text-destructive">{error}</p>;
  if (data === null) return null;
  return <CodeEditor label={file.name} value={data} goto={file.line > 0 ? file : null} />;
}
