import type { PramanSnapshot } from './praman-snapshot';

/** Seconds as the toolbar's proof clock shows them: 00:00:08. */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
}

export type ProofProgress = {
  /** The last proof's time so far (or in all), and its limit; null before any proof. */
  elapsed: number | null;
  limit: number;
  running: boolean;
  /** Properties decided, of those to prove (assumptions are not proven). */
  decided: number;
  total: number;
};

/** The toolbar's account of the proof: its clock against its limit, and how many are decided. */
export function proofProgress(
  snapshot: PramanSnapshot | null,
  nowMs: number,
): ProofProgress | null {
  if (snapshot?.phase !== 'elaborated') return null;
  const { proof } = snapshot;
  const end = proof.running ? nowMs / 1000 : (proof.finished_at ?? nowMs / 1000);
  const toProve = snapshot.properties.filter((p) => p.type !== 'assume' && p.type !== 'restrict');
  return {
    elapsed: proof.started_at === null ? null : Math.max(0, end - proof.started_at),
    limit: proof.time_limit,
    running: proof.running,
    decided: toProve.filter((p) => p.status !== 'not_run' && p.status !== 'running').length,
    total: toProve.length,
  };
}
