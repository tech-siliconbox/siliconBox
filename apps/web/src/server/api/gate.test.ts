import type { ProtectedResource } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Identity } from '@/server/auth/authenticate';
import { AppError } from '@/server/errors';
import type { RateLimitPolicy } from '@/server/rate-limit';
import { type GateDeps, createApiGate, gateKindOf } from './gate';

const ORIGIN = 'https://siliconbox.test';
const POLICY: RateLimitPolicy = { name: 'test', limit: 2, windowMs: 60_000 };
const learner: Identity = {
  userId: 'learner-test-1',
  email: 'learner@example.test',
  role: 'learner',
  emailVerified: true,
  twoFactorEnabled: false,
};

function fakeDeps(overrides: Partial<GateDeps> = {}): GateDeps {
  const counts = new Map<string, number>();
  return {
    authenticate: () => Promise.resolve(learner),
    assertEntitled: () => Promise.resolve(),
    rateLimiter: (key, policy) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Promise.resolve({ allowed: count <= policy.limit, retryAfterMs: 30_000 });
    },
    allowedOrigins: () => [ORIGIN],
    ...overrides,
  };
}

const ok = () => Promise.resolve(Response.json({ ok: true }));
const noParams = { params: Promise.resolve({}) };

function call(
  handler: ReturnType<ReturnType<typeof createApiGate>['withApiGate']>,
  init?: RequestInit,
) {
  return handler(new Request(`${ORIGIN}/api/v1/thing`, init), noParams);
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe('withApiGate', () => {
  it('passes a signed-in request and marks the response private, no-store', async () => {
    const { withApiGate } = createApiGate(fakeDeps());
    const handler = withApiGate(
      { access: { kind: 'signedIn' }, rateLimit: POLICY, schemas: {} },
      ok,
    );
    const response = await call(handler);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(gateKindOf(handler)).toBe('full');
  });

  it.each([
    ['no session', 'UNAUTHENTICATED', 401],
    ['a session ended by a sign-in on another device', 'SESSION_REPLACED', 401],
  ] as const)('rejects %s', async (_label, code, status) => {
    const deps = fakeDeps({ authenticate: () => Promise.reject(new AppError(code)) });
    const handler = createApiGate(deps).withApiGate(
      { access: { kind: 'signedIn' }, rateLimit: POLICY, schemas: {} },
      ok,
    );
    const response = await call(handler);
    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
  });

  it('rejects a learner without the entitlement for the object', async () => {
    const seen: ProtectedResource[] = [];
    const deps = fakeDeps({
      assertEntitled: (resource) => {
        seen.push(resource);
        return Promise.reject(new AppError('NOT_ENTITLED'));
      },
    });
    const handler = createApiGate(deps).withApiGate(
      {
        access: {
          kind: 'entitled',
          resource: ({ query }) => Promise.resolve({ kind: 'drill', level: query.level }),
        },
        rateLimit: POLICY,
        schemas: { query: z.strictObject({ level: z.enum(['basic', 'advance']) }) },
      },
      ok,
    );
    const response = await handler(new Request(`${ORIGIN}/api/v1/thing?level=advance`), noParams);
    expect(response.status).toBe(403);
    expect(seen).toEqual([{ kind: 'drill', level: 'advance' }]);
  });

  it.each([
    ['an unknown field', { title: 'x', price: 1 }],
    ['a MongoDB operator', { title: { $ne: null } }],
    ['a missing field', {}],
  ])('rejects a body with %s', async (_label, body) => {
    const handler = createApiGate(fakeDeps()).withApiGate(
      {
        access: { kind: 'signedIn' },
        rateLimit: POLICY,
        schemas: { body: z.strictObject({ title: z.string() }) },
      },
      ok,
    );
    const response = await call(handler, {
      method: 'POST',
      headers: { origin: ORIGIN },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
  });

  it('refuses an oversized body before reading it', async () => {
    const handler = createApiGate(fakeDeps()).withApiGate(
      {
        access: { kind: 'signedIn' },
        rateLimit: POLICY,
        schemas: { body: z.strictObject({ title: z.string() }) },
      },
      ok,
    );
    const response = await call(handler, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-length': String(1024 * 1024) },
      body: JSON.stringify({ title: 'x'.repeat(1024 * 1024) }),
    });
    expect(response.status).toBe(400);
  });

  it('rate-limits per account and tells the client when to retry', async () => {
    const handler = createApiGate(fakeDeps()).withApiGate(
      { access: { kind: 'signedIn' }, rateLimit: POLICY, schemas: {} },
      ok,
    );
    await call(handler);
    await call(handler);
    const response = await call(handler);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  it.each([
    ['from another site', { origin: 'https://evil.example' }],
    ['without an Origin header', {}],
  ])('refuses a write %s', async (_label, headers) => {
    const handler = createApiGate(fakeDeps()).withApiGate(
      { access: { kind: 'signedIn' }, rateLimit: POLICY, schemas: {} },
      ok,
    );
    const response = await call(handler, { method: 'POST', headers });
    expect(response.status).toBe(403);
  });

  it('does not look up a session on a public route', async () => {
    const deps = fakeDeps({ authenticate: () => Promise.reject(new Error('must not be called')) });
    const handler = createApiGate(deps).withApiGate(
      { access: { kind: 'public' }, rateLimit: POLICY, schemas: {} },
      ({ identity }) => Promise.resolve(Response.json({ identity })),
    );
    const response = await call(handler);
    expect(await response.json()).toEqual({ identity: null });
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const handler = createApiGate(fakeDeps()).withApiGate(
      { access: { kind: 'signedIn' }, rateLimit: POLICY, schemas: {} },
      () => Promise.reject(new Error('database password is hunter2')),
    );
    const response = await call(handler);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('hunter2');
  });
});
