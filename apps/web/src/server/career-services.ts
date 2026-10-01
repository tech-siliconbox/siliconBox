import 'server-only';
import { isServiceOpen } from '@/db/services';
import type { Identity } from './auth/authenticate';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';

export const CAREER_SERVICES = {
  resumeBuilder: 'resume-builder',
  cvScreening: 'cv-screening',
} as const;
type CareerService = (typeof CAREER_SERVICES)[keyof typeof CAREER_SERVICES];

/**
 * A career tool works only while its service is open in the admin (locked services refuse every
 * call) and the learner holds an active content entitlement (access model).
 */
export async function assertCareerTool(identity: Identity, service: CareerService): Promise<void> {
  if (!(await isServiceOpen(service))) throw new AppError('SERVICE_LOCKED', `${service} is locked`);
  await assertEntitled({ kind: 'careerTool' }, identity);
}

export type CareerToolState = 'open' | 'SERVICE_LOCKED' | 'NOT_ENTITLED';

/** For pages: whether the learner can use the tool now, or why not. */
export async function careerToolState(
  identity: Identity,
  service: CareerService,
): Promise<CareerToolState> {
  try {
    await assertCareerTool(identity, service);
    return 'open';
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.code === 'SERVICE_LOCKED' || error.code === 'NOT_ENTITLED')
    ) {
      return error.code;
    }
    throw error;
  }
}
