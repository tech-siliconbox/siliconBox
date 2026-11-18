# Member area

A signed-in learner's own pages, reached from the avatar menu in the header (name, email, Overview, Activity, Settings, Help, Sign out). A sidebar links the pages; on a phone it is a row of tabs. Every member page is watermarked, rendered on the server, and makes no extra calls for its data (golden rule, ADR 0027).

## Built

| Page | Address | Shows |
| --- | --- | --- |
| Overview | `/dashboard` | Modules done, Drills solved, day streak; the next lesson to read; each course with its access window and progress; getting-started steps (verify email, finish Module 1, solve a first Drill); the five most recent finished lessons and runs |
| Activity | `/activity` | Day streak, longest streak, days active, lessons finished and Drill runs; the last 12 months as a square a day (darker for more done: 1–2, 3–4, 5–7, 8 or more); the 20 most recent lessons and runs |
| Settings | `/settings` | Name; email and whether it is verified, with a button to send the link again; password change (other devices are signed out) or, for Google-only accounts, how to add one; each level's and the formal tool's window (open until, ended, not bought) |
| Help | `/help` | Questions and answers written in the CMS (`faqs`, published only), and the team's contact address. Public, so it helps before sign-in; a signed-in learner sees it with the sidebar |

Activity days and streaks use India time (`SITE_TIME_ZONE`). A streak counts back from today, or from yesterday when today has no activity yet, so it stays alive until a day without activity ends.

## Planned (in order, each its own change)

1. **Your data** (DPDP): download everything we hold about the learner as JSON; delete the account (order and audit records kept as the law requires). See `docs/legal/privacy-dpdp.md`.
2. **Profile**: handle, bio, social links, a photo shown in the avatar menu.
3. **Assessments and Performance**: each course's final quiz graded on the server, and the capstone project submitted and graded by the team; results on a Performance page. The open decisions (attempts, pass marks, upload format, who grades) are with the founder.
