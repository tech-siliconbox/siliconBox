import 'server-only';
import { type ToolRunDetail, ToolRunDetailSchema, type ToolRunSummary } from '@siliconbox/shared';
import { collectUnusedFiles } from '@/db/tool-files';
import {
  deleteToolRun,
  findToolRun,
  findToolTrace,
  listToolRuns,
  toRunSummary,
} from '@/db/tool-runs';
import type { Identity } from '../auth/authenticate';
import { assertPraman } from '../entitlements';
import { AppError } from '../errors';

/** A learner's Praman run history (ADR 0031): the newest runs, kept with their traces. */

export async function listRuns(identity: Identity): Promise<ToolRunSummary[]> {
  await assertPraman(identity);
  return listToolRuns(identity.userId);
}

export async function readRun(identity: Identity, runId: string): Promise<ToolRunDetail> {
  await assertPraman(identity);
  const run = await findToolRun(identity.userId, runId);
  if (run === null) throw new AppError('NOT_FOUND', `no tool run ${runId}`);
  return ToolRunDetailSchema.parse({
    ...toRunSummary(run),
    clock: run.clock,
    reset: run.reset,
    settings: run.settings,
    script: run.script,
    files: run.files.map(({ name, bytes, analyzed }) => ({ name, bytes, analyzed })),
    properties: run.properties,
    tracesDropped: run.tracesDropped,
  });
}

/**
 * Deletes the run and its traces, and the file texts nothing else refers to. Personal data
 * (DPDP): allowed even once the learner's access has ended.
 */
export async function deleteRun(identity: Identity, runId: string): Promise<void> {
  if (!(await deleteToolRun(identity.userId, runId))) {
    throw new AppError('NOT_FOUND', `no tool run ${runId}`);
  }
  await collectUnusedFiles(identity.userId);
}

export async function runTrace(
  identity: Identity,
  runId: string,
  property: string,
): Promise<Record<string, unknown>> {
  await assertPraman(identity);
  const trace = await findToolTrace(identity.userId, runId, property);
  if (trace === null) throw new AppError('NOT_FOUND', `no kept trace in ${runId}`);
  return trace;
}
