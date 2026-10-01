import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gateKindOf } from './gate';

// Fails the build when any exported route handler skips the shared gate.
const API_DIR = fileURLToPath(new URL('../../app/api/', import.meta.url));
const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Only the auth library's catch-all route may use the delegated gate. */
const DELEGATED_ROUTES = new Set(['auth/[...all]/route.ts']);

const routeFiles = globSync('**/route.{ts,tsx}', { cwd: API_DIR });

describe('every API route goes through the gate', () => {
  it('finds route files to check', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(routeFiles)('%s', async (file) => {
    const routeModule = (await import(`${API_DIR}${file}`)) as Record<string, unknown>;
    const handlers = HTTP_METHODS.filter((method) => method in routeModule);
    expect(handlers.length).toBeGreaterThan(0);
    const expected = DELEGATED_ROUTES.has(file) ? 'delegated' : 'full';
    for (const method of handlers) {
      expect(gateKindOf(routeModule[method]), `${method} ${file}`).toBe(expected);
    }
  });
});
