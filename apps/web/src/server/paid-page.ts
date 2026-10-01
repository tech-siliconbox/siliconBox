import 'server-only';
import { notFound } from 'next/navigation';
import { AppError } from './errors';

export type LockReason = 'NOT_ENTITLED' | 'RATE_LIMITED';

/**
 * Loads paid content for a page: a missing item becomes the 404 page, while no access or too
 * many reads become a lock reason the page explains. Anything else is a real error.
 */
export async function loadPaidContent<T>(
  read: () => Promise<T>,
): Promise<T | { locked: LockReason }> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    if (
      error instanceof AppError &&
      (error.code === 'NOT_ENTITLED' || error.code === 'RATE_LIMITED')
    ) {
      return { locked: error.code };
    }
    throw error;
  }
}

export function isLocked(value: unknown): value is { locked: LockReason } {
  return typeof value === 'object' && value !== null && 'locked' in value;
}
