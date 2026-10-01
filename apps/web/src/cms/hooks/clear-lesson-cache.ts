import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload';

/**
 * After any course, module or lesson change, drop this server's cached lessons. The cache also
 * expires within 30 seconds, which covers other server instances. Loaded lazily because the
 * CMS config is also read by command-line scripts, where server modules cannot load.
 */
async function clear(): Promise<void> {
  const { clearLessonCache } = await import('../../server/lessons');
  clearLessonCache();
}

export const clearLessonCacheAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  await clear();
  return doc as Record<string, unknown>;
};

export const clearLessonCacheAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await clear();
  return doc as Record<string, unknown>;
};
