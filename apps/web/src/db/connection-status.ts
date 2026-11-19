import { MongoClient } from 'mongodb';

// Where a database connection points and, when it fails, why in plain words. The dev server logs
// this at startup and `pnpm db:allow-my-ip` acts on it, so this file uses no `server-only` and no
// path aliases (scripts import it). Nothing here returns or logs a password.

export type ConnectionProblem =
  'network refused' | 'address lookup' | 'sign-in' | 'no answer' | 'other';

export const PROBLEM_HINTS: Record<ConnectionProblem, string> = {
  'network refused':
    "Atlas refused this network: this computer's IP is not on the access list (run pnpm db:allow-my-ip), or the cluster is paused.",
  'address lookup': 'The database address could not be looked up: check the internet connection.',
  'sign-in': 'Atlas refused the user name or password in .env.local.',
  'no answer': 'The database did not answer in time.',
  other: 'The connection failed for another reason.',
};

/** What each problem looks like in the driver's error or the errors under it, checked in order. */
const SIGNS: [ConnectionProblem, RegExp][] = [
  // Atlas ends the TLS handshake with alert 80 for an IP it does not allow or a paused cluster.
  ['network refused', /tlsv1 alert internal error|ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR/i],
  ['address lookup', /ENOTFOUND|EAI_AGAIN|querySrv|getaddrinfo/i],
  ['sign-in', /AuthenticationFailed|bad auth|authentication failed/i],
  ['no answer', /timed out|ETIMEDOUT/i],
];

const MAX_CAUSES = 5;

/** The error and each `cause` under it, as one line of names, codes and messages. */
function errorText(error: unknown): string {
  const parts: string[] = [];
  let current = error;
  for (let depth = 0; current instanceof Object && depth < MAX_CAUSES; depth += 1) {
    const { name, code, codeName, message, cause } = current as Record<string, unknown>;
    parts.push([name, code, codeName, message].filter(Boolean).join(' '));
    current = cause;
  }
  return parts.join(' | ');
}

export function connectionProblem(error: unknown): ConnectionProblem {
  const text = errorText(error);
  return SIGNS.find(([, sign]) => sign.test(text))?.[0] ?? 'other';
}

/** Where a connection string points: host, database and user, never the password. */
export function describeDatabase(uri: string): { host: string; database: string; user: string } {
  try {
    const url = new URL(uri);
    return {
      host: url.host,
      database: url.pathname.slice(1) || '(default)',
      user: decodeURIComponent(url.username),
    };
  } catch {
    return { host: '(unreadable connection string)', database: '', user: '' };
  }
}

/**
 * Connects, pings and disconnects. Resolves to the time taken in ms (the connection and the ping)
 * or rejects with the driver's error. Its own short-lived client, not the app's pooled one.
 */
export async function pingDatabase(uri: string, timeoutMs = 10_000): Promise<number> {
  const client = new MongoClient(uri, {
    appName: 'siliconbox-connection-check',
    serverSelectionTimeoutMS: timeoutMs,
  });
  const started = performance.now();
  try {
    await client.db().command({ ping: 1 });
    return Math.round(performance.now() - started);
  } finally {
    await client.close();
  }
}
