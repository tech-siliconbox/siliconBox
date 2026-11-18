# Content delivery and protection

formal.org shipped course text in static JavaScript chunks, so anyone with the bundle URL could read it without an account. SiliconBox never does that.

## Rendering model

| Page type | How it is served |
| --- | --- |
| Landing, pricing, course outlines, Industry Ready cards, question bank (questions and company tags) | Static or cached at the CDN. Outline only: titles, durations, first free lesson |
| Lessons, Drills, question answers | Server-rendered per request after session and entitlement check |
| Admin | Separate host, Cloudflare Access + MFA |

## Rules

- Paid responses send `Cache-Control: private, no-store`; the CDN never caches them.
- No lesson text in any JS file, sitemap, RSS feed or search index.
- Lessons are structured blocks; an author's course page is kept as sanitised markup in `html` blocks (ADR 0024). One lesson per response, never a whole course.
- Diagrams are inline SVG. Raster images only via short-lived signed links, watermarked.
- Page addresses are readable slugs (ADR 0026); API identifiers stay random and opaque.
- Golden rule (ADR 0027): content reaches the browser only inside its page. No content API, no link prefetch, no extra calls on load.
- Sequential release: the API only serves lessons the level allows.

## Anti-crawl controls

| Control | Detail |
| --- | --- |
| Account wall | No valid session, no content. Crawling needs a paid account that ties requests to a person |
| Entitlement check | Every request, server-side, against the database |
| Pacing | About a dozen lesson fetches a minute and a daily cap per account; over the cap soft-locks and alerts |
| AI crawlers | Refused by user agent in the proxy (403), named in robots.txt, `X-Robots-Tag: noai, noimageai` on every response |
| Edge bots | Cloudflare WAF and bot scoring |
| Anomaly alerts | Sessions from different countries at once, headless-browser signs, read bursts: lock and review |
| Watermarks | See `docs/security/watermarking.md` |

## Honest limit

A paying learner can always read what is shown, copy it by hand or film the screen. The goal is to make bulk extraction slow, expensive and traceable, and to deter sharing with watermarks, one device at a time and terms that forbid sharing.

## Caching

Keep the published lesson in a server memory cache for 30 to 60 seconds and clear it on publish. Drills and answers are checked against the database every time so an expired or revoked entitlement takes effect at once.
