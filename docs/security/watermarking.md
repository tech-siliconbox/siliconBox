# Watermarking

Goal: a leaked copy names its source. Watermarks apply to everything a signed-in learner sees: lessons, Drills, answers, question answers, signed images.

## Visible mark

A subtle repeated mark with the learner's identity (name or short id plus email fragment) and the date, tiled across the content area. It must not hide text or reduce WCAG AA contrast.

## Invisible mark

A per-user pattern in the text itself, for example zero-width characters at varying positions, plus small per-user variations in whitespace. It survives copy and paste of text.

## Images

Raster images are stamped with the learner's mark on the server and delivered through short-lived signed links.

## Rules

- Generated on the server per request from the session. Never stored in shared caches.
- Never log the invisible pattern alongside lesson text.
- Keep a lookup from pattern to user in a private table for tracing.
- A test checks that paid views carry both marks.

## Copy protection

Paid text cannot be selected, copied, cut, dragged, right-clicked or printed, and blurs while the window is out of focus; code examples keep a Copy button (ADR 0023, `ProtectedContent`). Screenshots and recordings cannot be blocked from a web page, which is why the marks below matter.

## Limits

A filmed screen or hand-typed copy can still carry the visible mark, but a cropped screenshot might not. Watermarking deters and traces; it does not prevent.

## Implementation (2026-10-01)

- Visible: `Watermarked` tiles `visibleMark` (last six characters of the user id, the first three letters of the email with its domain, and the date) as an SVG pattern at 7% opacity over every signed-in page.
- Invisible: `markCode` derives a 32-bit code from the user id with a keyed hash; `embedMark` hides it as zero-width characters after the first word of every paragraph, callout and list item (including those inside reveals). Code samples are left untouched so they still run when copied. `findMarks` reads codes back from pasted text.
- Trace table: `watermark_codes` maps codes to learners; each sign-in registers the learner's code. Deleting an account deletes its codes (DPDP), so text leaked before the deletion no longer traces to a person.
- Trace tool (2026-11-18): `/admin-tools/trace`, Support and Owner only (Payload session). Paste leaked text or a visible mark read off a screenshot; it decodes hidden codes (`findMarks`) and parses visible marks (`parseVisibleMarks`), then lists the matching accounts. Text goes by POST, is never stored or logged, lookups are rate-limited (20 an hour per admin), and each trace is audit-logged as `watermark_trace`.
- Tests: unit tests for encoding and round trips; the lesson end-to-end test checks both marks on a paid view.
