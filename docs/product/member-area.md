# Member area

A signed-in learner's own pages, reached from the avatar menu in the header (name, email, Overview, Performance, Activity, Settings, Help, Sign out). A sidebar links the pages; on a phone it is a row of tabs. Every member page is watermarked, rendered on the server, and makes no extra calls for its data (golden rule, ADR 0027).

## Built

| Page | Address | Shows |
| --- | --- | --- |
| Overview | `/dashboard` | The learner's profile card (photo, name, handle, bio, links); modules done, Drills solved, day streak; the next lesson to read; each course with its access window and progress; getting-started steps (verify email, finish Module 1, solve a first Drill); the five most recent finished lessons and runs |
| Performance | `/performance` | Each course's assessment (best score, attempts left) and capstone (waiting, or the expert's score); the course passes when both pass. Links open the module page at each (ADR 0029) |
| Activity | `/activity` | Day streak, longest streak, days active, lessons finished and Drill runs; the last 12 months as a square a day (darker for more done: 1–2, 3–4, 5–7, 8 or more); the 20 most recent lessons and runs |
| Settings | `/settings` | Profile: photo (JPEG, PNG or WebP up to 5 MB, cropped to a 256 px square, camera and location details removed), handle (3 to 30 lowercase letters, digits or underscores, one learner each), bio (500 characters), LinkedIn, GitHub and website links (https only). Name; email and whether it is verified, with a button to send the link again; password change (other devices are signed out) or, for Google-only accounts, how to add one; each level's and the formal tool's window (open until, ended, not bought); your data: download it as JSON, or delete the account |
| Help | `/help` | Questions and answers written in the CMS (`faqs`, published only), and the team's contact address. Public, so it helps before sign-in; a signed-in learner sees it with the sidebar |

Activity days and streaks use India time (`SITE_TIME_ZONE`). A streak counts back from today, or from yesterday when today has no activity yet, so it stays alive until a day without activity ends.

The photo also replaces the initials in the avatar menu. Profiles are private for now: only the learner sees theirs. A public profile page (`/u/<handle>`) or a leaderboard would need the founder's decision first.

## Graded course work (ADR 0029)

The last module of a course holds its assessment and capstone project, answered and uploaded in the page. The assessment is scored on the server (at most 3 attempts, no waiting; the answer key and explanations appear only once the learner passed or used every attempt). The capstone is one .zip of up to 10 MB, graded by our experts (Editors and the Owner) at `/admin-tools/capstones`, who score each rubric criterion and write feedback; a learner can replace a submission until it is graded, and send a new version after a failing grade.
