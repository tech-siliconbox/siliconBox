import type { Equivalence } from '../praman-reports';
import {
  BAD,
  GOOD,
  type Look,
  Mark,
  OPEN,
  ReportHead,
  ReportIntro,
  ReportSection,
  ReportTable,
  RunButton,
} from './report-parts';

const VERDICT: Readonly<Record<string, Look>> = {
  equivalent: { label: 'Equivalent', className: GOOD },
  equivalent_bounded: { label: 'No difference within the bound', className: OPEN },
  different: { label: 'Different', className: BAD },
  undetermined: { label: 'Not decided', className: OPEN },
  running: { label: 'Checking', className: 'text-info' },
};
const NOT_CHECKED: Look = { label: 'Could not be checked', className: BAD };

type EquivalencePanelProps = {
  equivalence: Equivalence | null;
  canRun: boolean;
  onCheck: () => void;
  onTrace: () => void;
};

/** Equivalence: does a revised design behave like the analyzed one, output by output? */
export function EquivalencePanel({ equivalence, canRun, onCheck, onTrace }: EquivalencePanelProps) {
  if (equivalence === null) {
    return (
      <ReportIntro title="Does a revised design behave like this one?">
        <p className="mb-3 mt-1.5">
          Add the revised files to the session, then check them against the analyzed design: after
          reset, every output both versions have must be equal in every cycle.
        </p>
        <RunButton label="Check Equivalence…" primary disabled={!canRun} onClick={onCheck} />
      </ReportIntro>
    );
  }
  return (
    <div>
      <EquivalenceHead
        equivalence={equivalence}
        canRun={canRun}
        onCheck={onCheck}
        onTrace={onTrace}
      />
      {equivalence.explanation.length > 0 && (
        <ul className="ml-8 mt-3 list-disc text-[13px]">
          {equivalence.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {equivalence.differences.length > 0 && <Differences equivalence={equivalence} />}
    </div>
  );
}

function EquivalenceHead({
  equivalence,
  canRun,
  onCheck,
  onTrace,
}: EquivalencePanelProps & { equivalence: Equivalence }) {
  const look = VERDICT[equivalence.status] ?? NOT_CHECKED;
  return (
    <ReportHead
      scores={
        <span className="text-2xl font-bold">
          <Mark look={look} />
        </span>
      }
    >
      <p>
        Revised: {equivalence.revised.join(', ')} ·{' '}
        {equivalence.mode === 'bmc' ? 'bounded check' : 'full proof'}
      </p>
      {equivalence.detail !== '' && <p>{equivalence.detail}</p>}
      <div className="flex gap-2">
        {equivalence.has_trace && (
          <RunButton label="View Difference" primary disabled={false} onClick={onTrace} />
        )}
        <RunButton label="Check Again…" disabled={!canRun} onClick={onCheck} />
      </div>
    </ReportHead>
  );
}

function Differences({ equivalence }: { equivalence: Equivalence }) {
  return (
    <>
      <ReportSection>Outputs that differ</ReportSection>
      <ReportTable head={['Output', 'Original', 'Revised']}>
        {equivalence.differences.map((difference) => (
          <tr key={difference.output}>
            <td className="px-3 py-1 font-mono">{difference.output}</td>
            <td className="px-3 py-1 font-mono">{difference.original}</td>
            <td className="px-3 py-1 font-mono">{difference.revised}</td>
          </tr>
        ))}
      </ReportTable>
    </>
  );
}
