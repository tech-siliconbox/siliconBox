# Phase 1: Foundations

Goal: a safe base that every later phase builds on.

## Tasks

- [x] Monorepo with pnpm workspaces: `apps/web`, `apps/solver`, `packages/shared`
- [x] TypeScript, ESLint, Prettier, Vitest, Playwright set up; scripts in `CLAUDE.md` exist and work
- [x] Code-quality tooling from `docs/engineering/coding-standards.md`: ESLint rules (complexity, function length, no unused, no console), jscpd (`pnpm dedupe:check`), knip (`pnpm unused:check`), dependency-cruiser (`pnpm deps:check`); ruff and vulture for the solver
- [x] Shared foundations created once: `packages/shared` constants, schemas, error codes; `withApiGate`, `assertEntitled`, `AppError`, config; UI primitives and `Watermarked`, `LockedCard`, `CompanyTag`; catalog updated
- [x] CI: typecheck, lint, test, dependency scan, secret scan
- [ ] Environments: dev, staging, production; preview deployments per PR
- [ ] MongoDB Atlas (Mumbai) with separate roles: learner-facing user cannot read `drill_private` or `answers`
- [x] migrate-mongo wired into CI; first migration creates core collections and unique indexes
- [ ] Nightly `mongodump` job to private storage; one restore practised
- [x] Better Auth with MongoDB adapter: email + password (breached check), Google, TOTP (Google is wired but untested until a Google client id is set)
- [ ] Email verification required before purchase
- [x] Sessions: opaque HttpOnly cookie; one active device; old device signed out within a minute with a message
- [x] Shared API wrapper: authenticate, authorise, validate, rate-limit; test that fails the build if a route skips a gate
- [x] Security headers, CSP nonces, CORS allow-list, CSRF
- [x] Redis (Upstash free) for rate limits
- [ ] Cloudflare in front; Cloudflare Access with MFA on the admin host
- [x] Design tokens and base layout from `docs/design/`; logo and live "SiliconBox" text
- [x] Public pages: landing, pricing, course outlines (static)
- [x] Audit log collection (append-only)

## Progress notes (2026-10-01)

- Done in code and verified locally; the items below still need an account or host set up.
- Atlas: local dev now runs on the founder's existing Atlas cluster, database `siliconbox`; migration applied and e2e tests pass there. The cluster is shared with other projects and the connection uses an `atlasAdmin` user, so before staging: a dedicated cluster (Mumbai) or at least a least-privilege `siliconboxApp` user (`infra/mongodb/`).
- Upstash: connected over TCP (`rediss://`); rate limits verified there with the e2e suite. Locally every request shares the `ip:unknown` bucket because no proxy sets the client IP header; on Vercel `x-real-ip` separates them.
- Deferred by founder decision (2026-10-01): Vercel, Cloudflare and the email provider are integrated later. Object storage is not added for now; MongoDB is the only store.
- Nightly backup: script and workflow written (`infra/scripts/`, `.github/workflows/nightly-backup.yml`); storage bucket not chosen. A local dump-and-restore drill passed; an encrypted drill against staging is still due.
- Better Auth: email + password with breached-password check, Google (when configured), and TOTP with a setup screen (QR code, backup codes) and a sign-in code step. Every sign-in is audit-logged. Still to do: sending verification emails (email provider deferred by founder), blocking purchase until verified (with checkout).
- Rate limits: one limiter only (ours, in Redis); Better Auth's built-in in-memory limiter is off.
- One device: second sign-in ends the first session; the open page is told within a minute (e2e test).
- CSRF: origin check on every write (with SameSite=Lax cookies). A separate CSRF token is not added yet.
- Payload CMS and admin roles: built in phase 2 (see that file).
- Gate: not formally met, because staging needs Vercel, which the founder deferred. On 2026-10-01 the founder asked to continue, so phase 2 started with this gate open.

## Gate

Sign-in, roles and backups work in staging; the wrapper test proves no route skips a gate.

## Docs to read

`docs/architecture/auth-and-sessions.md`, `api-design.md`, `data-model.md`, `docs/security/threat-model.md`.
