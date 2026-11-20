import type { PramanProperty } from '../praman-snapshot';

type Count = (test: (p: PramanProperty) => boolean) => number;

/** Results by kind: good, bad and undecided, as JasperGold's footer shows them. */
function Tally({
  label,
  title,
  counts,
}: {
  label: string;
  title: string;
  counts: [number, number, number];
}) {
  return (
    <span title={title}>
      {label}: <b className="text-ok">{counts[0]}</b>:<b className="text-danger">{counts[1]}</b>:
      <b>{counts[2]}</b>
    </span>
  );
}

/** The line under the table: how many properties, how many shown, which is chosen, the results. */
export function PropertyFooter({
  properties,
  shown,
  selected,
}: {
  properties: PramanProperty[];
  shown: number;
  selected: PramanProperty | null;
}) {
  const count: Count = (test) => properties.filter(test).length;
  const assert = (p: PramanProperty) => p.type === 'assert' && p.parent === '';
  const cover = (p: PramanProperty) => p.type === 'cover';
  const open = (p: PramanProperty) =>
    ['undetermined', 'stopped', 'error', 'vacuous'].includes(p.status);
  return (
    <div className="flex shrink-0 flex-wrap gap-5 border-t border-border bg-muted px-3 py-1 text-[12px]">
      <span>
        Total: <b>{properties.length}</b>
      </span>
      <span>
        Shown: <b>{shown}</b>
      </span>
      <span>
        Selected: <b>{selected?.name ?? 'none'}</b>
      </span>
      <Tally
        label="Assertions"
        title="Assertions proven : counterexamples : undetermined"
        counts={[
          count((p) => assert(p) && p.status === 'proven'),
          count((p) => assert(p) && p.status === 'cex'),
          count((p) => assert(p) && open(p)),
        ]}
      />
      <Tally
        label="Covers"
        title="Covers covered : unreachable : undetermined"
        counts={[
          count((p) => cover(p) && p.status === 'covered'),
          count((p) => cover(p) && p.status === 'unreachable'),
          count((p) => cover(p) && open(p)),
        ]}
      />
      <span>
        Assumptions: <b>{count((p) => p.type === 'assume' && !p.disabled)}</b>
      </span>
    </div>
  );
}
