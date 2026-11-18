# 0023. Copy protection for paid text on the website

- Status: Accepted (founder, 2026-11-18)
- Date: 2026-11-18

## Context

The founder wants learners unable to screenshot, screen-record or copy paid content, for the
website only. A web page cannot stop the operating system from capturing the screen: no
browser offers that. What a page can do is make copying and printing hard for ordinary
readers, hide content while the window is not in use, and make any leak traceable (visible and
invisible watermarks, the trace tool).

## Decision

Every paid view (lessons, Drill briefs, question answers, the admin lesson preview) wraps its
content in `ProtectedContent`:

- Text cannot be selected, copied, cut, dragged or right-clicked; an attempt shows a copyright
  notice.
- Printing and "save as PDF" show a notice instead of the content.
- The content blurs while the window is out of focus, hidden, or just after PrintScreen.
- Code examples stay selectable and have a Copy button: learners need them in the Drill editor.
  The Drill editor itself is not protected.

Because all content renders through `LessonBlockRenderer` inside `ProtectedContent`, new content
is protected without any extra work.

## Consequences

- Casual copying and printing stop. Screenshots and recordings remain possible (Mac shortcuts
  and recording tools cannot be detected); a determined reader can still bypass page scripts.
  The watermarks and the trace tool remain the real deterrent.
- Screen readers still read the text. Selecting text to look up a word is no longer possible.
- If real screenshot and recording blocking is needed later, it takes a native app (window
  content protection on desktop, FLAG_SECURE on Android, capture detection on iOS): a new ADR.
