import 'server-only';
import type { ProtectedResource } from '@siliconbox/shared';
import type { Identity } from '@/server/auth/authenticate';
import { AppError, toResponse } from '@/server/errors';
import { type RateLimitPolicy, type RateLimiter, enforceRateLimit } from '@/server/rate-limit';
import { type InputSchemas, type ParsedInput, parseInput } from './input';

export type Access<I> =
  | { kind: 'public' }
  | { kind: 'signedIn' }
  | { kind: 'entitled'; resource: (input: I, identity: Identity) => Promise<ProtectedResource> };

export type GateSpec<S extends InputSchemas, A extends Access<ParsedInput<S>>> = {
  access: A;
  rateLimit: RateLimitPolicy;
  schemas: S;
};

export type GateContext<S extends InputSchemas, A> = {
  request: Request;
  input: ParsedInput<S>;
  identity: A extends { kind: 'public' } ? null : Identity;
};

export type GateDeps = {
  authenticate: (headers: Headers) => Promise<Identity>;
  assertEntitled: (resource: ProtectedResource, identity: Identity) => Promise<void>;
  rateLimiter: RateLimiter;
  allowedOrigins: () => readonly string[];
};

type RouteContext = { params: Promise<unknown> };
export type RouteHandler = (request: Request, context: RouteContext) => Promise<Response>;

/** `full` passes all four gates; `delegated` is only for the auth library's own endpoints. */
type GateKind = 'full' | 'delegated';
const gatedHandlers = new WeakMap<RouteHandler, GateKind>();

export function gateKindOf(handler: unknown): GateKind | undefined {
  return typeof handler === 'function' ? gatedHandlers.get(handler as RouteHandler) : undefined;
}

function mark(handler: RouteHandler, kind: GateKind): RouteHandler {
  gatedHandlers.set(handler, kind);
  return handler;
}

export function createApiGate(deps: GateDeps) {
  const guard = gateSteps(deps);

  /**
   * Every /api/v1 handler is built with this. Order: origin check on writes, authenticate,
   * rate-limit (per account when known, else per IP), validate, then authorise the object.
   */
  function withApiGate<S extends InputSchemas, A extends Access<ParsedInput<S>>>(
    spec: GateSpec<S, A>,
    handler: (context: GateContext<S, A>) => Promise<Response>,
  ): RouteHandler {
    return mark(async (request, context) => {
      try {
        guard.origin(request);
        const identity =
          spec.access.kind === 'public' ? null : await deps.authenticate(request.headers);
        await guard.rateLimit(request, spec.rateLimit, identity);
        const input = await parseInput(spec.schemas, request, await context.params);
        if (spec.access.kind === 'entitled' && identity !== null) {
          await deps.assertEntitled(await spec.access.resource(input, identity), identity);
        }
        const identityForHandler = identity as GateContext<S, A>['identity']; // null only when public
        return withNoStoreDefault(await handler({ request, input, identity: identityForHandler }));
      } catch (error) {
        return toResponse(error);
      }
    }, 'full');
  }

  /** For a library that validates and authenticates its own endpoints: origin and rate limit only. */
  function withDelegatedGate(
    rateLimit: RateLimitPolicy,
    handler: (request: Request) => Promise<Response>,
  ): RouteHandler {
    return mark(async (request) => {
      try {
        guard.origin(request);
        await guard.rateLimit(request, rateLimit, null);
        return await handler(request);
      } catch (error) {
        return toResponse(error);
      }
    }, 'delegated');
  }

  return { withApiGate, withDelegatedGate };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function gateSteps(deps: GateDeps) {
  return {
    /** CSRF defence for writes: the browser-set Origin must be one of ours. */
    origin(request: Request): void {
      if (SAFE_METHODS.has(request.method)) return;
      const origin = request.headers.get('origin');
      if (origin === null || !deps.allowedOrigins().includes(origin)) {
        throw new AppError('FORBIDDEN', `cross-origin write from ${origin ?? 'no origin'}`);
      }
    },
    async rateLimit(
      request: Request,
      policy: RateLimitPolicy,
      identity: Identity | null,
    ): Promise<void> {
      const key = identity === null ? `ip:${clientIp(request)}` : `user:${identity.userId}`;
      await enforceRateLimit(deps.rateLimiter, key, policy);
    },
  };
}

/** Cloudflare sets cf-connecting-ip; the host sets x-real-ip. Both are overwritten upstream. */
function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? 'unknown';
}

function withNoStoreDefault(response: Response): Response {
  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}
