import 'server-only';
import type { AlertKind } from '@siliconbox/shared';
import { recordAlert } from '@/db/security-alerts';
import { log } from './log';

/**
 * Records a security alert for review. Alerts never lock an account by themselves: Support
 * decides. Delivery by email arrives with the email provider.
 */
export async function raiseAlert(
  kind: AlertKind,
  userId: string,
  details: Record<string, string | number | null> = {},
): Promise<void> {
  log('warn', `alert_${kind}`, { userId, ...details });
  await recordAlert(kind, userId, details);
}
