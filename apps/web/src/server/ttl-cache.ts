import 'server-only';

type Entry<V> = { value: V; expiresAt: number };

/** A small in-memory cache whose entries expire `ttlMs` after they are set. */
export function createTtlCache<V>(ttlMs: number, now: () => number = Date.now) {
  const entries = new Map<string, Entry<V>>();
  return {
    get(key: string): V | undefined {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: V): void {
      entries.set(key, { value, expiresAt: now() + ttlMs });
    },
    clear(): void {
      entries.clear();
    },
  };
}
