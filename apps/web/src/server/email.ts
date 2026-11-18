import 'server-only';
import { getConfig } from './config';
import { AppError } from './errors';

// Email goes out through Resend's HTTP API (one call, no SDK). The key is send-only and lives in
// the host secret store. Never log a message body: it can hold a sign-in or verification link.

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;
/** Names reserved for tests and examples (RFC 2606, 6761) never receive mail, so none is sent. */
const RESERVED_DOMAIN =
  /@(?:[^@]+\.)?(?:test|example|invalid|localhost|example\.(?:com|net|org))$/i;

export type Email = { to: string; subject: string; text: string; html: string };

/** Resend's error name only (for example "validation_error"): its message can name a person. */
async function refusal(response: Response | null): Promise<AppError> {
  const body = response && ((await response.json().catch(() => ({}))) as { name?: string });
  const reason = response === null ? 'no response' : `${response.status} ${body?.name ?? ''}`;
  return new AppError('EMAIL_NOT_SENT', `Resend refused the email (${reason.trim()})`);
}

/** Sends one email. Without Resend settings, or to a reserved test domain, nothing is sent. */
export async function sendEmail(email: Email): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO } = getConfig();
  if (RESEND_API_KEY === undefined || EMAIL_FROM === undefined) return;
  if (RESERVED_DOMAIN.test(email.to)) return;
  const replyTo = EMAIL_REPLY_TO === undefined ? {} : { reply_to: EMAIL_REPLY_TO };
  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, ...replyTo, ...email }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  }).catch(() => null);
  if (response?.ok !== true) throw await refusal(response);
}
