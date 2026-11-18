import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, RequestContext } from 'payload';

/**
 * Passed as `context` by command-line scripts that write content. A script has no lesson cache
 * of its own, and server modules cannot load there; running servers expire theirs in 30 s.
 */
export const SCRIPT_CONTEXT: RequestContext = { fromScript: true };

/**
 * After any course, module or lesson change, drop this server's cached lessons. The cache also
 * expires within 30 seconds, which covers other server instances. Loaded lazily because the
 * CMS config is also read by command-line scripts, where server modules cannot load.
 */
async function clear(context: RequestContext): Promise<void> {
  if (context.fromScript === true) return;
  const { clearLessonCache } = await import('../../server/lessons');
  clearLessonCache();
}

export const clearLessonCacheAfterChange: CollectionAfterChangeHook = async ({ doc, context }) => {
  await clear(context);
  return doc as Record<string, unknown>;
};

export const clearLessonCacheAfterDelete: CollectionAfterDeleteHook = async ({ doc, context }) => {
  await clear(context);
  return doc as Record<string, unknown>;
};
