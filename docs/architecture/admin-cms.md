# Admin area (Payload CMS)

Payload runs inside the Next.js app and writes to the same MongoDB, so content edits need no deploy.

## What admins can do

- Create and order courses, modules, lessons and Drills with a block editor.
- Edit a Drill's starter code, reference solution, hidden properties, top module, depth and timeout in validated form fields.
- Manage the question bank: questions, company tags (from the companies list), topics, year, private answers.
- Draft, preview as a learner, schedule, publish and roll back. Every save is a version.
- Manage prices, promo codes and free preview lessons.
- View learners and grant, revoke, extend or shorten any content or tool window, with a reason.
- Flip an Industry Ready service between locked and open.
- Bulk import from Markdown (`pnpm content:import`).

## Roles

| Role | Can do |
| --- | --- |
| Author | Edit drafts only |
| Editor | Publish and unpublish |
| Support | View users and entitlements, grant or extend access |
| Owner | Everything, including prices and admin users |

## Safety

- **Publish gate for Drills:** the reference solution must PASS and each seeded-bug variant must FAIL on the real solver.
- Host `admin.siliconbox.in` behind Cloudflare Access with MFA, short session.
- Hidden properties, solutions and answers live in collections the learner-facing database user cannot read.
- Every entitlement change needs a reason and is audit-logged.

## Built so far (2026-10-01)

- Payload 3 inside `apps/web`: admin UI at `/admin`, REST at `/cms-api`, GraphQL off. Config: `src/payload.config.ts`; collections in `src/cms/`.
- Roles enforced by `src/cms/access.ts`: Author saves drafts only, Editor and Owner publish and delete, only Owner manages admins and changes roles. Support has no content rights.
- The first admin created on the setup screen becomes Owner. **Until that account exists, anyone who can reach `/admin` can create it**, so create the Owner before any environment is reachable (see `docs/runbooks/deploy.md`).
- Admin sessions last two hours, lock after five failed sign-ins, and use SameSite=Strict cookies; cookie calls are accepted only from our origin.
- `/admin` alone gets `style-src 'unsafe-inline'` in the CSP because Payload's UI uses inline styles; the site keeps the strict policy.
- Not yet: preview as learner, scheduled publishing (needs the host's cron), Drill fields and the publish gate, questions and answers, entitlement grants for Support.
