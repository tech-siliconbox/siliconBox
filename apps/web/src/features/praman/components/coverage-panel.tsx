'use client';

import { useState } from 'react';
import type { Coverage, CoverageItem, CoveragePart, InstanceCoverage } from '../praman-reports';
import {
  BAD,
  GOOD,
  type Look,
  Mark,
  OPEN,
  QUIET,
  ReportHead,
  ReportIntro,
  ReportTable,
  RunButton,
  Score,
} from './report-parts';

const BRANCHES = 'check_cov';
const PROOF_CORE = 'check_cov -type proof';

const ITEM: Readonly<Record<string, Look & { order: number }>> = {
  unreachable: { label: 'Unreachable', className: BAD, order: 0 },
  undetermined: { label: 'Undetermined', className: OPEN, order: 1 },
  reset: { label: 'In reset', className: QUIET, order: 2 },
  covered: { label: 'Covered', className: GOOD, order: 3 },
};
const CORE: Readonly<Record<string, Look & { order: number }>> = {
  'not relied on': { label: 'Not relied on', className: BAD, order: 0 },
  undetermined: { label: 'Undetermined', className: OPEN, order: 1 },
  'relied on': { label: 'Relied on', className: GOOD, order: 2 },
};
const UNKNOWN = { label: 'Undetermined', className: OPEN, order: 9 };

type CoveragePanelProps = {
  coverage: Coverage | null;
  canRun: boolean;
  onRun: (line: string) => void;
  /** Opens a file at a line (from 1). */
  onSource: (file: string, line: number) => void;
  onTrace: (item: CoverageItem) => void;
};

/** Formal coverage: can every branch, statement and toggle be reached; or the proof core. */
export function CoveragePanel(props: CoveragePanelProps) {
  const { coverage, canRun, onRun } = props;
  if (coverage === null || coverage.status === 'running') {
    return (
      <ReportIntro title="Can every branch, statement and toggle of the design be reached?">
        <p className="mb-3 mt-1.5">
          Praman puts a cover in every branch of the design&apos;s always blocks and on the rise and
          fall of every bit, then proves each reachable (with a trace) or unreachable. An
          unreachable branch is dead code, or behaviour the assumptions rule out. The proof core
          shows which lines the proven assertions rely on.
        </p>
        {coverage?.status === 'running' ? (
          <p className="text-info">Measuring…</p>
        ) : (
          <div className="flex gap-2">
            <RunButton
              label="Measure Coverage"
              primary
              disabled={!canRun}
              onClick={() => onRun(BRANCHES)}
            />
            <RunButton label="Proof Core" disabled={!canRun} onClick={() => onRun(PROOF_CORE)} />
          </div>
        )}
      </ReportIntro>
    );
  }
  return coverage.kind === 'proof' ? (
    <ProofCore {...props} coverage={coverage} />
  ) : (
    <Branches {...props} coverage={coverage} />
  );
}

type ShownProps = CoveragePanelProps & { coverage: Coverage };

function Again({ canRun, onRun }: Pick<CoveragePanelProps, 'canRun' | 'onRun'>) {
  return (
    <div className="flex gap-2">
      <RunButton label="Measure Again" disabled={!canRun} onClick={() => onRun(BRANCHES)} />
      <RunButton label="Proof Core" disabled={!canRun} onClick={() => onRun(PROOF_CORE)} />
    </div>
  );
}

const part = (title: string, of: CoveragePart | null) =>
  of === null || of.total === 0 ? null : (
    <Score
      key={title}
      value={`${of.percent}%`}
      caption={`${title}: ${of.covered} of ${of.total}`}
    />
  );

function Branches({ coverage, canRun, onRun, onSource, onTrace }: ShownProps) {
  const [view, setView] = useState<'items' | 'toggles'>('items');
  // An instance chosen in the per-instance table: only its items show.
  const [instance, setInstance] = useState('');
  const items = coverage[view].filter((item) => instance === '' || item.instance === instance);
  return (
    <div>
      <BranchesHead coverage={coverage} canRun={canRun} onRun={onRun} />
      <PerInstance instances={coverage.instances} chosen={instance} onChoose={setInstance} />
      <div role="group" aria-label="Show" className="flex gap-1.5 px-4 py-2">
        {(['items', 'toggles'] as const).map((each) => (
          <button
            key={each}
            type="button"
            aria-pressed={view === each}
            onClick={() => setView(each)}
            className="h-6 rounded-[3px] border border-border px-2 text-[12px] aria-pressed:border-info aria-pressed:bg-info-light"
          >
            {each === 'items' ? 'Branches' : 'Toggles'} {coverage[each].length}
          </button>
        ))}
        {instance !== '' && (
          <button
            type="button"
            aria-label={`Show every instance, not only ${instance}`}
            onClick={() => setInstance('')}
            className="h-6 rounded-[3px] border border-info bg-info-light px-2 font-mono text-[12px]"
          >
            {instance} ×
          </button>
        )}
      </div>
      <CoverageItems items={items} onSource={onSource} onTrace={onTrace} />
    </div>
  );
}

const percentOf = (part: CoveragePart) => (part.total > 0 ? `${part.percent}%` : '–');

type PerInstanceProps = {
  instances: InstanceCoverage[];
  chosen: string;
  onChoose: (instance: string) => void;
};

/** Each instance's scores, when there are several; choosing one shows only its items. */
function PerInstance({ instances, chosen, onChoose }: PerInstanceProps) {
  if (instances.length < 2) return null;
  return (
    <section aria-label="Per instance" className="px-4 pt-2">
      <ReportTable head={['Instance', 'Module', 'Branches', 'Statements', 'Toggles']}>
        {instances.map((each) => (
          <tr key={each.instance} className={each.instance === chosen ? 'bg-info-light' : ''}>
            <td className="px-3 py-1">
              <button
                type="button"
                aria-pressed={each.instance === chosen}
                title="Show only this instance"
                onClick={() => onChoose(each.instance === chosen ? '' : each.instance)}
                className="font-mono underline-offset-2 hover:underline"
              >
                {each.instance}
              </button>
            </td>
            <td className="px-3 py-1 text-muted-foreground">{each.module}</td>
            <td className="px-3 py-1 font-mono">{percentOf(each.branches)}</td>
            <td className="px-3 py-1 font-mono">{percentOf(each.statements)}</td>
            <td className="px-3 py-1 font-mono">{percentOf(each.toggles)}</td>
          </tr>
        ))}
      </ReportTable>
    </section>
  );
}

function BranchesHead({
  coverage,
  canRun,
  onRun,
}: Pick<ShownProps, 'coverage' | 'canRun' | 'onRun'>) {
  const branches = {
    covered: coverage.covered,
    total: coverage.total - coverage.reset,
    percent: coverage.percent,
  };
  const scores = [
    part('branches', branches),
    part('statements', coverage.statements),
    part('toggles', coverage.toggle_summary),
  ];
  return (
    <ReportHead scores={scores}>
      {coverage.unreachable > 0 && (
        <p className={BAD}>
          {coverage.unreachable} branches unreachable: dead code, or ruled out by the assumptions.
        </p>
      )}
      {(coverage.toggle_summary?.unreachable ?? 0) > 0 && (
        <p className={BAD}>
          {coverage.toggle_summary?.unreachable} toggles cannot happen: a bit stuck at a value.
        </p>
      )}
      {coverage.undetermined > 0 && (
        <p>{coverage.undetermined} branches not decided in the time limit.</p>
      )}
      {coverage.reset > 0 && (
        <p>{coverage.reset} branches taken only while the reset is held; not counted.</p>
      )}
      {coverage.toggle_bits_left_out > 0 && (
        <p>
          {coverage.toggle_bits_left_out} signal bits not measured for toggles (no clock in their
          module).
        </p>
      )}
      <Again canRun={canRun} onRun={onRun} />
    </ReportHead>
  );
}

const LINK = 'font-mono text-[12px] underline-offset-2 hover:underline';

function CoverageItems({
  items,
  onSource,
  onTrace,
}: Pick<CoveragePanelProps, 'onSource' | 'onTrace'> & { items: CoverageItem[] }) {
  const rows = [...items].sort(
    (a, b) => (ITEM[a.status] ?? UNKNOWN).order - (ITEM[b.status] ?? UNKNOWN).order,
  );
  return (
    <ReportTable head={['Result', 'Where', 'What', 'Trace']}>
      {rows.map((item) => (
        <tr key={`${item.label}@${item.instance}`}>
          <td className="px-3 py-1">
            <Mark look={ITEM[item.status] ?? UNKNOWN} />
          </td>
          <td className="px-3 py-1">
            <button type="button" onClick={() => onSource(item.file, item.line)} className={LINK}>
              {item.file}:{item.line}
            </button>
          </td>
          <td className="px-3 py-1 font-mono text-[12px]">
            {item.instance !== '' && (
              <span className="text-muted-foreground">{item.instance} · </span>
            )}
            {item.what}
          </td>
          <td className="px-3 py-1">
            {item.status === 'covered' && (
              <button
                type="button"
                onClick={() => onTrace(item)}
                className="text-[12px] font-semibold underline underline-offset-2"
              >
                Trace{item.cycles === null ? '' : ` (${item.cycles} cycles)`}
              </button>
            )}
          </td>
        </tr>
      ))}
    </ReportTable>
  );
}

function ProofCore({ coverage, canRun, onRun, onSource }: ShownProps) {
  const lines = [...coverage.lines].sort(
    (a, b) => (CORE[a.status] ?? UNKNOWN).order - (CORE[b.status] ?? UNKNOWN).order,
  );
  const caption = `proof core: ${coverage.relied_on} of ${coverage.relied_on + coverage.not_relied_on} lines relied on`;
  return (
    <div>
      <ReportHead scores={<Score value={`${coverage.percent}%`} caption={caption} />}>
        <p>
          Each line of logic was cut (its values made free) and the {coverage.proven.length} proven
          assertions proven again. A line a proof needs is relied on.
        </p>
        {coverage.not_relied_on > 0 && (
          <p className={BAD}>
            {coverage.not_relied_on} lines no proof relies on: logic no assertion checks.
          </p>
        )}
        <Again canRun={canRun} onRun={onRun} />
      </ReportHead>
      <ReportTable head={['Result', 'Where', 'Relied on by']}>
        {lines.map((line) => (
          <tr key={`${line.file}:${line.line}`}>
            <td className="px-3 py-1">
              <Mark look={CORE[line.status] ?? UNKNOWN} />
            </td>
            <td className="px-3 py-1">
              <button type="button" onClick={() => onSource(line.file, line.line)} className={LINK}>
                {line.file}:{line.line}
              </button>
            </td>
            <td className="px-3 py-1 font-mono text-[12px]">
              {line.properties.length > 0
                ? line.properties.join(', ')
                : line.outside_cone
                  ? 'no assertion reads it'
                  : line.detail}
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}
