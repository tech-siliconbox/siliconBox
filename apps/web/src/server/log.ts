import 'server-only';

type Level = 'info' | 'warn' | 'error';

/**
 * The only way server code writes logs: one JSON line per event.
 * Never pass passwords, tokens, lesson text, answers or card data.
 */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  (level === 'info' ? process.stdout : process.stderr).write(`${line}\n`);
}
