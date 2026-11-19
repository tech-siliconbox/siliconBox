// Lets this computer reach the Atlas database from a new network (a hotspot, an office): when
// Atlas refuses the connection, adds this computer's public IP to the project's access list for
// 24 hours, then waits until Atlas lets it in. A network Atlas already accepts is left alone, so a
// permanent entry (a home IP) never gets an expiry.
// Usage: pnpm db:allow-my-ip   (after `atlas auth login`; the Atlas CLI profile's project is used)
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  type ConnectionProblem,
  PROBLEM_HINTS,
  connectionProblem,
  describeDatabase,
  pingDatabase,
} from '../src/db/connection-status';

const HOURS = 24;
// Atlas takes about a minute to apply an access-list change.
const RECHECKS = 12;
const RECHECK_EVERY_MS = 10_000;

type AccessEntry = { ipAddress?: string; deleteAfterDate?: string };

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function problemNow(uri: string): Promise<ConnectionProblem | null> {
  try {
    await pingDatabase(uri);
    return null;
  } catch (error) {
    return connectionProblem(error);
  }
}

/** Adds this computer's IP until `deleteAfter`; returns the IP when the CLI's answer shows it. */
function addThisComputer(deleteAfter: string): string | undefined {
  const args = ['accessLists', 'create', '--currentIp', '--deleteAfter', deleteAfter];
  const comment = ['--comment', `pnpm db:allow-my-ip, ${HOURS} h`];
  try {
    const answer = execFileSync('atlas', [...args, ...comment, '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const { results = [] } = JSON.parse(answer) as { results?: AccessEntry[] };
    return results.find((entry) => entry.deleteAfterDate === deleteAfter)?.ipAddress;
  } catch (error) {
    const missing = (error as { code?: string }).code === 'ENOENT';
    say(
      missing
        ? 'The Atlas CLI is not installed: brew install mongodb-atlas-cli, then atlas auth login.'
        : 'The Atlas CLI could not add the entry (see above). Sign in with atlas auth login and try again.',
    );
    process.exit(1);
  }
}

async function waitUntilAccepted(uri: string): Promise<boolean> {
  for (let check = 1; check <= RECHECKS; check += 1) {
    await sleep(RECHECK_EVERY_MS);
    if ((await problemNow(uri)) === null) return true;
  }
  return false;
}

const uri = process.env.MONGODB_URI_APP;
if (!uri) throw new Error('MONGODB_URI_APP is not set (apps/web/.env.local).');
const { host } = describeDatabase(uri);

const problem = await problemNow(uri);
if (problem === null) {
  say(`This network can already reach ${host}. Nothing changed.`);
  process.exit(0);
}
if (problem !== 'network refused') {
  say(PROBLEM_HINTS[problem]);
  process.exit(1);
}

const deleteAfter = new Date(Date.now() + HOURS * 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z');
const ip = addThisComputer(deleteAfter);
say(
  `Added ${ip ?? "this computer's IP"} to the Atlas access list until ${new Date(deleteAfter).toLocaleString()}. Waiting for Atlas to apply it…`,
);
if (await waitUntilAccepted(uri)) {
  say(`Atlas accepts this network now: ${host} is reachable.`);
  process.exit(0);
}
say(
  'Atlas still refuses after two minutes: is the cluster paused? Check with atlas clusters list.',
);
process.exit(1);
