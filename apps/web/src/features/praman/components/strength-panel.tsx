import type { PramanProperty } from '../praman-snapshot';
import type { Mutant, Strength } from '../praman-reports';
import {
  BAD,
  GOOD,
  type Look,
  Mark,
  OPEN,
  QUIET,
  ReportHead,
  ReportIntro,
  ReportSection,
  ReportTable,
  RunButton,
  Score,
} from './report-parts';

const MUTANT: Readonly<Record<string, Look & { order: number }>> = {
  survived: { label: 'Not detected', className: BAD, order: 0 },
  error: { label: 'Could not be checked', className: BAD, order: 1 },
  timeout: { label: 'Not decided in time', className: OPEN, order: 2 },
  not_run: { label: 'Not run (time budget)', className: QUIET, order: 3 },
  pending: { label: 'Checking', className: 'text-info', order: 4 },
  detected: { label: 'Detected', className: GOOD, order: 5 },
  equivalent: { label: 'Changes nothing visible', className: QUIET, order: 6 },
};
const NOT_CHECKED = { label: 'Could not be checked', className: BAD, order: 9 };
const lookOf = (mutant: Mutant) => MUTANT[mutant.status] ?? NOT_CHECKED;

const LINE = 'check_strength';

type StrengthPanelProps = {
  strength: Strength | null;
  properties: PramanProperty[];
  canRun: boolean;
  onRun: (line: string) => void;
};

/** Assertion strength: small changes to the design, and whether a proven assertion notices. */
export function StrengthPanel({ strength, properties, canRun, onRun }: StrengthPanelProps) {
  if (strength === null) {
    return (
      <ReportIntro title="How strong are your assertions?">
        <p className="mb-3 mt-1.5">
          Praman makes small changes (mutants) in the design, one at a time, and checks whether any
          proven assertion now fails. A change no assertion notices is a gap in the properties. It
          works on the results of the last proof.
        </p>
        <RunButton
          label="Measure Strength"
          primary
          disabled={!canRun}
          onClick={() => onRun(LINE)}
        />
      </ReportIntro>
    );
  }
  const nameOf = (id: string) => properties.find((p) => p.id === id)?.name ?? id;
  return (
    <div>
      <StrengthHead strength={strength} canRun={canRun} onRun={onRun} />
      <ReportSection>Per assertion</ReportSection>
      <ReportTable head={['Assertion', 'Mutants detected']}>
        {Object.entries(strength.per_assertion).map(([id, count]) => (
          <tr key={id}>
            <td className="px-3 py-1 font-mono">{nameOf(id)}</td>
            <td className="px-3 py-1">{count}</td>
          </tr>
        ))}
      </ReportTable>
      <ReportSection>Mutants</ReportSection>
      <MutantTable mutants={strength.mutants} nameOf={nameOf} />
    </div>
  );
}

function StrengthHead({
  strength,
  canRun,
  onRun,
}: Omit<StrengthPanelProps, 'properties'> & { strength: Strength }) {
  const running = strength.status === 'running';
  const caption = running
    ? `checking ${strength.done} of ${strength.total} mutants…`
    : `${strength.detected} of ${strength.checked} mutants detected`;
  return (
    <ReportHead
      scores={
        <Score value={strength.score === null ? '–' : `${strength.score}%`} caption={caption} />
      }
    >
      {strength.equivalent > 0 && (
        <p>{strength.equivalent} mutants change nothing the design shows and are not counted.</p>
      )}
      {strength.timed_out > 0 && (
        <p>{strength.timed_out} mutants were not decided in time and are not counted.</p>
      )}
      {strength.status === 'failed' && <p className={BAD}>{strength.message}</p>}
      <div>
        <RunButton
          label="Measure Again"
          disabled={running || !canRun}
          onClick={() => onRun(LINE)}
        />
      </div>
    </ReportHead>
  );
}

function MutantTable({ mutants, nameOf }: { mutants: Mutant[]; nameOf: (id: string) => string }) {
  const sorted = [...mutants].sort((a, b) => lookOf(a).order - lookOf(b).order);
  return (
    <ReportTable head={['Result', 'Where', 'Change', 'Detected by']}>
      {sorted.map((mutant) => (
        <tr key={mutant.index} title={mutant.message || undefined}>
          <td className="px-3 py-1">
            <Mark look={lookOf(mutant)} />
          </td>
          <td className="px-3 py-1 font-mono text-[12px]">{mutant.location}</td>
          <td className="px-3 py-1">
            {mutant.mutation}
            {mutant.code !== '' && (
              <code className="ml-2 font-mono text-[12px]">{mutant.code}</code>
            )}
          </td>
          <td className="px-3 py-1 font-mono text-[12px]">
            {mutant.detected_by.map((id) => nameOf(id).split('.').pop()).join(', ')}
          </td>
        </tr>
      ))}
    </ReportTable>
  );
}
