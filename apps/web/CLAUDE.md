# apps/web

Next.js (App Router, TypeScript) with Payload CMS in the same app. Public site, learning API, payment webhook and the admin host.

Root rules in `../../CLAUDE.md` apply. Scoped rules: `.claude/rules/api-routes.md`, `content-protection.md`, `mongodb.md`, `ui-design.md`.

## Layout (create as you build)

```
src/app/(site)/(public)/   public pages: landing, pricing, outlines, sign-in (rendered per request, ADR 0017)
src/app/(site)/(member)/   signed-in pages, watermarked: account, lessons (/learn), later Drills and answers
src/app/(payload)/         Payload admin (/admin) and its REST API (/cms-api), admins only
src/app/api/v1/            API routes, all through the shared wrapper
src/cms/                   Payload collections, fields and access rules
src/server/         auth, entitlements, pricing, watermark, rate limit, audit
src/db/             MongoDB client (one per instance) and repositories
src/components/     UI components (light theme, Geist)
migrations/         migrate-mongo scripts
loadtest/           k6 scripts
public/brand/       siliconbox-logo.png (icon only; the name is live text)
src/payload.config.ts   Payload config (collections live in src/cms/)
```

## Code standard

Senior-engineer style: reuse first, one source of truth, no duplication, small components, strict types. Read `.claude/rules/code-quality.md` and `.claude/rules/react-components.md`; check `docs/engineering/component-catalog.md` before adding a component or hook.

## Rules of thumb

- Paid pages are dynamic and `no-store`. Never `generateStaticParams` or ISR for lessons, Drills or answers.
- Put entitlement logic only in `src/server/entitlements`. Routes call `assertEntitled()`.
- Put price logic only in `src/server/pricing`. Tests for both live next to them.
- Watermark is added in the server render path, not in client code.
- Payload access control mirrors these rules; do not widen it for convenience.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
