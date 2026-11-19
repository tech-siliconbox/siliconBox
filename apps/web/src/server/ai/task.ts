import 'server-only';
import { AI_NOTICE_VERSION, type AiFeature, type AuditEntry } from '@siliconbox/shared';
import { appendAudit } from '@/db/audit-log';
import { refundAiAllowance, spendAiAllowance } from './allowance';
import { AI_MODEL } from './claude';

/** What every AI task depends on besides its own work; tests replace each part. */
export type AiTaskDeps = {
  spend: (userId: string) => Promise<void>;
  refund: (userId: string) => Promise<void>;
  audit: (entry: AuditEntry) => Promise<void>;
};

export const LIVE_TASK_DEPS: AiTaskDeps = {
  spend: spendAiAllowance,
  refund: refundAiAllowance,
  audit: appendAudit,
};

/**
 * Runs one AI task on the learner's allowance: one use is taken before it and given back if it
 * fails. Each run is audit-logged with the feature, the notice agreed to and the outcome, no text.
 */
export async function runAiTask<T>(
  userId: string,
  feature: AiFeature,
  deps: AiTaskDeps,
  task: () => Promise<T>,
): Promise<T> {
  await deps.spend(userId);
  const audit = (outcome: 'given' | 'failed') =>
    deps.audit({
      action: 'ai_request',
      actorId: userId,
      subjectId: userId,
      metadata: { feature, outcome, model: AI_MODEL, notice: AI_NOTICE_VERSION },
      createdAt: new Date(),
    });
  try {
    const result = await task();
    await audit('given');
    return result;
  } catch (error) {
    await deps.refund(userId);
    await audit('failed');
    throw error;
  }
}
