# Access model (confirmed)

Currency is INR. No GST for now (business not registered); the tax rate is a setting, default 0.

## Levels

| Level | Price | Opens | Content access | Tool access |
| --- | --- | --- | --- | --- |
| Basic | ₹5,000 | Basic | 3 months | 3 months |
| Intermediate | ₹10,000 | Basic and Intermediate | 6 months (3 + 3) | 3 months |
| Advance | ₹15,000 | All three levels | 9 months (3 + 3 + 3) | 3 months |

## What each purchase gives

| You buy | You already hold | You pay | You get |
| --- | --- | --- | --- |
| Basic | Nothing | ₹5,000 | Basic for 3 months |
| Intermediate | Nothing | ₹10,000 | Basic and Intermediate for 6 months |
| Advance | Nothing | ₹15,000 | All three levels for 9 months |
| Intermediate | Basic, still active | ₹5,000 | Intermediate for 3 months from purchase; Basic keeps its own end date |
| Advance | Basic, still active | ₹10,000 | All three levels for 9 months from purchase |
| Advance | Intermediate, still active | ₹5,000 | All three levels for 9 months from purchase |
| Any level | A lower tier that has ended | Full price | Same as buying with nothing held |

## Rules

- **Tool access** is its own 3-month window. Every purchase, including an upgrade, starts a new one from the purchase date. It covers running Drills and Praman, the formal tool page (below).
- **Window ends:** lessons, Drills and answers for that level lock. The public outline stays. The learner can buy again at full price.
- **Free for everyone:** question bank (questions with company logo and name), public course outlines.
- **Free with an account:** all of Module 1 of each course (its whole page, with its lab), for any signed-in learner (decided 2026-11-18). The course home and outline stay public.
- **Free for buyers only:** question answers, Resume Builder and CV screening, while the learner holds an active content entitlement. Basic is the minimum.
- **Industry Ready:** own tab. Only Resume Builder and CV screening are open; every other service is locked until built.
- **One device at a time.** A second sign-in ends the first session. All content is watermarked.
- **Admin control:** an admin can shorten or extend any learner's content or tool window. A reason is required and the change is audit-logged.
- **No video.** Text, code and diagrams.

## Praman, the formal tool page (`/tool`, ADR 0031)

- **Who:** learners with an active tool window and an active content window, as for running a Drill (no plan, no tool access). Everyone else sees a locked card with "See pricing". Phones get a note to open it on a computer.
- **Level:** the learner's highest active content level sets the ceilings and the allowance.
- **Learner-chosen settings (the one exception to hard rule 6):** top module, proof time and trace length, within these ceilings. The engine is never the learner's choice.

| Level | Proof time (one proof) | Trace length | Proof minutes a day |
| --- | --- | --- | --- |
| Basic | 5 min | 50 cycles | 60 |
| Intermediate | 15 min | 100 cycles | 120 |
| Advance | 30 min | 200 cycles | 240 |

- **Allowance:** proof minutes are the real time engines run, separate from Drill runs. One open session per learner.
- **Saved work:** sessions and run history are kept 180 days after last use, and are part of the data download and account deletion. Caps: 20 sessions, the last 50 runs, 1 MB of files per session, 2 MB per trace.

## Out of scope for now

Promo codes, scholarships and refunds are handled by admin grants and the refund webhook. GST invoices start when the business registers.
