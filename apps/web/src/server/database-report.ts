import 'server-only';
import {
  PROBLEM_HINTS,
  connectionProblem,
  describeDatabase,
  pingDatabase,
} from '@/db/connection-status';
import { getConfig } from '@/server/config';
import { log } from '@/server/log';

/** Each database user the server signs in as, by the short name the log lines use. */
function databaseUsers(): [string, string | undefined][] {
  const config = getConfig();
  return [
    ['app', config.MONGODB_URI_APP],
    ['answers', config.MONGODB_URI_ANSWERS],
    ['grader', config.MONGODB_URI_GRADER],
    // Payload's user: payload.config.ts reads it itself, so it is not part of getConfig.
    ['admin', process.env.MONGODB_URI_ADMIN],
  ];
}

async function reportConnection(connection: string, uri: string): Promise<void> {
  const where = { connection, ...describeDatabase(uri) };
  try {
    log('info', 'db_connected', { ...where, ms: await pingDatabase(uri) });
  } catch (error) {
    const problem = connectionProblem(error);
    log('error', 'db_unreachable', { ...where, problem, hint: PROBLEM_HINTS[problem] });
  }
}

/**
 * One log line per database user: where it connects and how long it took, or why it could not
 * connect. Called by the dev server at startup (instrumentation.ts); it never throws.
 */
export async function reportDatabaseConnections(): Promise<void> {
  await Promise.all(
    databaseUsers().map(async ([connection, uri]) => {
      if (uri) await reportConnection(connection, uri);
      else log('warn', 'db_not_set', { connection });
    }),
  );
}
