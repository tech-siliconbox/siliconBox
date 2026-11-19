/** Runs once when a server starts. */
export async function register(): Promise<void> {
  // Dev server only: where each database user connects, so a refused network shows at startup.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'development') {
    const { reportDatabaseConnections } = await import('@/server/database-report');
    // Not awaited, so the server is ready at once; the lines follow as each check finishes.
    void reportDatabaseConnections();
  }
}
