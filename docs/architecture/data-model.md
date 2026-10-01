# Data model

MongoDB. Schemas are Zod in `packages/shared` and validate every write. Field lists below are the starting design; change them by migration and update this file.

## Collections

| Collection | Holds | Readable by |
| --- | --- | --- |
| `courses`, `modules`, `lessons` | Course tree; lesson body in blocks. Written by Payload; `publicId` (UUID) for URLs | Server reads published only; outline public |
| `_courses_versions`, `_lessons_versions` | Payload's saved versions for draft, publish, rollback (drafts of published documents live only here) | Admin |
| `admins` | CMS accounts with role (Author, Editor, Support, Owner), separate from learner `users` | Admin |
| `access-grants` | Append-only record of each admin grant: learner, kind, level, window, reason, who granted | Support, Owner |
| `payload-preferences`, `payload-migrations`, `payload-locked-documents` | Payload's own bookkeeping | Admin |
| `drills` | Title, module (level comes from its course), topic, top module, mode, solver, target, depth, timeout, brief, design and starter code, `publicId`; drafts | Server (read-only) |
| `drill_private` | Reference solution, hidden properties, seeded-bug variants (one per Drill) | Runner service and admin only |
| `questions` | Text, topics, company tags (company, year, internal source note), `publicId`; written by Payload with drafts | Public (published only; source note internal) |
| `answers` | Private answer blocks, one per question (`question` unique); written by Payload | Admin now; server for active learners once the reader user is decided |
| `companies` | Name, slug (logo later, with permission and storage); written by Payload | Public |
| `users` | Account, roles, MFA state (Better Auth) | Server |
| `sessions` | Active session, device, created, last seen (Better Auth) | Server |
| `accounts`, `verifications`, `twoFactors` | Better Auth: sign-in methods, email and reset tokens, TOTP secrets | Server |
| `ended_sessions` | Hash of each session ended by a newer sign-in, kept 7 days to tell the old device why | Server |
| `products` | Levels, prices (INR), tax rate setting | Server |
| `orders` | Order id, user, product, credit applied, amount, status, Razorpay ids | Server |
| `entitlements` | user, kind (`content` or `tool`), level, starts, ends, source (order or admin), reason | Server |
| `progress` | Lesson progress: `{ userId, lessonId (public id), completedAt }`; Drill progress later | Owner |
| `runs` | Run summary: user, Drill, status, elapsed, hash, log pointer | Owner |
| `run_cache` | Result by content hash | Server |
| `services` | Industry Ready service cards and status (`open` or `locked`), locked reason, order | Public list |
| `security-alerts` | Alerts for review: kind, learner, details, reviewed flag | Support, Owner (site inserts only) |
| `resumes` | One saved Resume Builder resume per learner | Owner, with delete |
| `cv_screenings` | CV screening reports only (score, checks, keywords, file name); uploaded files are never stored | Owner, with delete |
| `audit_log` | Append-only: sign-ins, purchases, admin edits, entitlement changes | Owner role |
| `watermark_codes` | Invisible watermark code to learner, for tracing leaks; `{ code, userId }` unique | Server |

## Indexes

- Unique: payment id in `orders` (partial: only once a payment id is set); session token; user email; `{ userId, kind, level }` in `entitlements` (a later purchase of the same level replaces its window).
- `{ userId, level, kind }`, `{ userId, lessonId }` for progress, `{ userId, createdAt }` for runs.
- TTL on old `runs` (retention period to be set in phase 3), expired `sessions` and `verifications`, and `ended_sessions` after 7 days. Raw logs go to object storage.
- Text index on public question text.

## Integrity

- Multi-document changes (order status plus entitlements) use a transaction.
- Hidden collections (`drill_private`, `answers`) are unreadable by the learner-facing database user.
- Strip MongoDB operators from user input.
- Migrations: migrate-mongo, from CI, with a down step.
