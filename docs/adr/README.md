# Architecture Decision Records

Each file records one hard-to-reverse decision. Add a new one with `/new-adr <title>`. Never rewrite history: supersede an ADR with a new one.

| ADR | Decision |
| --- | --- |
| [0001](0001-modular-monolith.md) | Modular monolith plus one separate solver |
| [0002](0002-mongodb-over-postgres.md) | MongoDB Atlas as the database |
| [0003](0003-payload-cms-admin.md) | Payload CMS for the admin area |
| [0004](0004-better-auth-sessions.md) | Better Auth with opaque cookie sessions |
| [0005](0005-one-active-device.md) | One active device per learner |
| [0006](0006-razorpay-webhook-access.md) | Razorpay with webhook-only access |
| [0007](0007-server-rendered-paid-content.md) | Paid content server-rendered per request; no video |
| [0008](0008-watermarking.md) | Visible and invisible per-user watermarks |
| [0009](0009-sandboxed-solver.md) | Private, sandboxed solver behind a job queue |
| [0010](0010-two-entitlement-clocks.md) | Separate content and tool entitlements |
| [0011](0011-drill-naming.md) | Use the word Drill |
| [0012](0012-inr-no-gst.md) | INR pricing, no GST for now |
| [0013](0013-vercel-pro-at-first-sale.md) | Vercel Pro from the first paid sale |
| [0014](0014-cloudflare-edge.md) | Cloudflare in front of everything |
| [0015](0015-company-tags-logo-and-name.md) | Company tags show logo and name |
| [0016](0016-industry-ready-tab.md) | Industry Ready tab; free tools for buyers only |
| [0017](0017-nonce-csp-renders-every-page-dynamically.md) | Nonce-based CSP; every page renders per request (proposed) |
| [0018](0018-learners-read-published-content-directly.md) | Learners read published content directly; the CMS API is admin-only |
| [0019](0019-three-database-users.md) | Three database users: site, answers reader, admin |
| [0020](0020-solver-jobs-signed-calls-and-a-redis-queue.md) | Solver: signed calls, a Redis queue and one process per job |
| [0021](0021-grade-drill-runs-against-hidden-designs.md) | Grade Drill runs against the hidden designs |
| [0022](0022-free-tiers-until-launch.md) | Free tiers until launch, then scale by thresholds |
| [0023](0023-copy-protection-on-the-website.md) | Copy protection for paid text on the website |
| [0024](0024-course-pages-complete-in-the-site-design.md) | Course pages: one page per module, complete, in the site's design |
| [0025](0025-sign-in-without-two-factor.md) | Learner sign-in: email and password or Google, no two-factor |
| [0026](0026-readable-page-addresses.md) | Readable page addresses: slugs, never ids |
| [0027](0027-content-only-in-its-page.md) | Golden rule: copyrighted content leaves the server only inside its page |
| [0028](0028-email-through-resend.md) | Email through Resend; verify the address before a purchase |
