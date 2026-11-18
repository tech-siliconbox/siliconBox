# 0027. Golden rule: copyrighted content leaves the server only inside its page

- Status: Accepted (founder, 2026-11-18)
- Date: 2026-11-18

## Context

The founder wants course content safe from AI agents and crawlers, and nothing visible in the
browser's network panel beyond the page being read. JSON APIs returned a lesson's blocks, a
paid answer and the whole question bank: none was used by the site, all were easy to crawl.

## Decision

1. Lesson, Drill, answer and question text reaches the browser only inside the server-rendered
   page that shows it, after the session and entitlement check. No API returns it.
2. Pages load nothing else: no API call on load, and no link prefetches (`SiteLink`, the only
   use of `next/link`, enforced by lint), so a page is sent only when the learner opens it.
3. AI crawlers and scraping tools are refused on every page (`src/lib/ai-crawlers.ts`, the
   proxy), named in `robots.txt`, and every response carries `X-Robots-Tag: noai, noimageai`.
4. The existing controls stay: account wall, per-request entitlement, read pacing, one device at
   a time, copy protection and watermarks.

Removed: `GET /api/v1/lessons/:id`, `GET /api/v1/questions/:id/answer`, `GET /api/v1/questions`.
`tests: e2e/course-pages.spec.ts` checks the rule on a real page.

## Consequences

- Whatever a learner may read is, by definition, in their browser: the developer tools show the
  page they opened. The rule keeps it to that one page, for that one learner, marked as theirs.
- A crawler that fakes a browser and signs in with a paid account is limited by pacing, one
  device, headless-browser alerts and the watermarks that trace what it takes.
- A future mobile app or partner API needs a new ADR before any content API returns.
