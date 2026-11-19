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
| `answers` | Private answer blocks, one per question (`question` unique); written by Payload | The answers-only database user, after the entitlement check (ADR 0019) |
| `companies` | Name, slug (logo later, with permission and storage); written by Payload | Public |
| `users` | Account: name, email, whether it is verified, role (Better Auth) | Server |
| `sessions` | Active session, device, created, last seen (Better Auth) | Server |
| `accounts`, `verifications` | Better Auth: sign-in methods (password, Google), email and reset tokens | Server |
| `ended_sessions` | Hash of each session ended by a newer sign-in, kept 7 days to tell the old device why | Server |
| `products` | Levels, prices (INR), tax rate setting | Server |
| `orders` | Order id, user, product, credit applied, amount, status, Razorpay ids | Server |
| `entitlements` | user, kind (`content` or `tool`), level, starts, ends, source (order or admin), reason | Server |
| `progress` | Lesson progress: `{ userId, lessonId (public id), completedAt }`; Drill progress later | Owner |
| `runs` | One learner run: user, Drill, request id, the learner's properties, state, result (with log and traces), hash, cached flag; kept 180 days | Owner |
| `run_cache` | PASS/FAIL result by hash of design, properties and settings; kept 30 days | Server |
| `services` | Industry Ready service cards and status (`open` or `locked`), locked reason, order | Public list |
| `faqs` | Help page questions and answers, order; written by Payload with drafts | Public (published only) |
| `security-alerts` | Alerts for review: kind, learner, details, reviewed flag | Support, Owner (site inserts only) |
| `resumes` | One saved Resume Builder resume per learner | Owner, with delete |
| `profiles` | One per learner: handle (unique once set), bio, links | Owner, with delete |
| `avatars` | One photo per learner: a 256 px WebP (no EXIF) and when it changed, until object storage exists | Owner, with delete |
| `assessments`, `capstones` | Graded course work (ADR 0029): questions and options; rubric and pass mark. Written by Payload with drafts | Server reads published only |
| `assessment_keys` | Each assessment's answer key and explanations | The grader database user only |
| `assessment_attempts` | One per learner and assessment: every attempt (answers, score, when), at most 3 | Owner |
| `capstone_submissions` | Uploads: file name and size, when, status (`submitted`, `graded`), the expert's scores, feedback and who graded; one waiting per learner and capstone | Owner; experts grade |
| `capstone_files` | Each submission's .zip, apart from the list, until object storage exists | Owner; experts download |
| `cv_screenings` | CV screening reports only (score, checks, keywords, file name, and the job match's score and terms when a job description was pasted); uploaded files and job descriptions are never stored | Owner, with delete |
| `audit_log` | Append-only: sign-ins, purchases, admin edits, entitlement changes | Owner role |
| `watermark_codes` | Invisible watermark code to learner, for tracing leaks; `{ code, userId }` unique | Server |

## Indexes

- Unique: payment id in `orders` (partial: only once a payment id is set); session token; user email; `{ userId, kind, level }` in `entitlements` (a later purchase of the same level replaces its window).
- `{ userId, level, kind }`, `{ userId, lessonId }` for progress, `{ userId, createdAt }` for runs.
- TTL on `runs` (180 days) and `run_cache` (30 days), expired `sessions` and `verifications`, and `ended_sessions` after 7 days. Run logs are kept in the run document (capped at 64 KB) until object storage exists.
- Text index on public question text.

## Deleting an account

A learner deletes their account from Settings (DPDP). Better Auth deletes `users`, `sessions` and `accounts`; first, `deleteLearnerData` empties `entitlements`, `progress`, `runs`, `resumes`, `cv_screenings`, `profiles`, `avatars`, `assessment_attempts`, `capstone_submissions`, `capstone_files`, `watermark_codes`, `ended_sessions` and their pending `verifications`. Kept: `audit_log` (including the `account_deleted` entry), `security-alerts` and Payload's `access-grants` (the site cannot change them; they are security and admin records), and `orders` once payments exist (the law needs them). Kept records refer to the account by id; grants also name the email they were for.

## Integrity

- Multi-document changes (order status plus entitlements) use a transaction.
- Hidden collections (`drill_private`, `answers`) are unreadable by the learner-facing database user.
- Strip MongoDB operators from user input.
- Migrations: migrate-mongo, from CI, with a down step.
