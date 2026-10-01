# formal.org — Extraction Spec (light theme only)

> Note for SiliconBox: formal.org's own word for a Drill was replaced with "Drill" throughout this copy, including route and file names it quotes from formal.org. The mandatory naming rule applies to our code, UI and docs.


Source: live site inspected in the built-in browser on 2026-10-01 (computed CSS, compiled stylesheet, JS bundles, network, response headers), cross-checked against the 10 screenshots.
Measured at a 1440×900 viewport, light color-scheme. Dark theme deliberately ignored.

Legend: **[M]** measured from live DOM/CSS · **[B]** read from compiled JS bundle · **[S]** read from screenshot only (not verified in DOM) · **[?]** not observable from the browser.

---

## 1. Stack

| Layer | Finding | Src |
|---|---|---|
| UI framework | React (Vite build, hashed `/assets/*.js`, route-level code-splitting: ~320 chunks) | M |
| Router | wouter (`<Route path=… component=…>`) | B |
| Data | TanStack Query (`queryKey: ["/api/profile"]` etc.) | B |
| Styling | Tailwind CSS 3 + shadcn/ui token convention (`hsl(var(--x) / <alpha>)`) + Radix primitives (toast `ol`, accordion, hover-card, dropdown) + `cmdk` (⌘K search on leaderboard) + `tailwindcss-animate` (`enter`/`exit` keyframes) + `@tailwindcss/typography` (compiled but NOT used by module pages) | M/B |
| Split panes | `react-resizable-panels` (`data-panel-group-direction`, `data-panel-size`) | M |
| Charts | Recharts | B |
| Editor | Monaco (lazy) — SystemVerilog + INI language chunks | M |
| Waveforms | VCD + WaveDrom code paths present (counterexample viewer) | B |
| Validation | zod | B |
| Icons | lucide (chunks like `circle-check`, `chevron-right`) | M |
| Web server | Express (`x-powered-by: Express`), behind Cloudflare; origin likely on Google Cloud (`via: 1.1 google`, `x-cloud-trace-context` headers) | M |
| Verification backend | **Modal** (badge "Powered by Modal" → modal.com); Yosys + SymbiYosys + Boolector per page copy | M |
| Analytics | Google Analytics gtag (`G-4F8PPK929L`), Cloudflare Web Analytics/RUM | M |
| PWA/meta | `site.webmanifest`, `favicon.png`, `apple-touch-icon.png`, `og-image.png` 1200×630, `sitemap.xml`, `theme-color #000000` | M |

`<html lang="en">` gets `class="dark"` for dark mode; light = no class. Theme toggle is a moon icon button (drill/module pages), 32×32, `border border-border rounded`.

---

## 2. Fonts (exactly two)

| Role | Family | Loaded from | Weights used |
|---|---|---|---|
| Sans (everything) | **Geist** | Google Fonts `family=Geist:wght@100..900` | 400, 500, 600, 700 |
| Mono (labels, eyebrows, stats, code, terminal) | **Geist Mono** | Google Fonts `family=Geist+Mono:wght@100..900` | 400, 500, 700 |

Stacks:
- sans: `Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
- mono: `"Geist Mono", "SF Mono", Monaco, Consolas, monospace`
- Monaco editor body: `monospace`, 13px (inherits OS mono, see §8).

`--fv-font-display / body / mono` (Space Grotesk / Inter / IBM Plex Mono) are **declared but never referenced** in the compiled CSS — leftovers. Do not use them. Classes named `w1-display`, `w1-body`, `w1-mono` have no CSS rules; they are marker classes only (real styling comes from Tailwind utilities).

`body { -webkit-font-smoothing: antialiased; }`

---

## 3. Colour tokens (light)

Full copy-paste file: `formal-tokens-light.css`. Essentials:

| Token | HSL | Hex | Used for |
|---|---|---|---|
| `--background` | 0 0% 100% | #FFFFFF | page |
| `--foreground` | 0 0% 7% | #121212 | text, primary buttons, active tab underline |
| `--border` / `--input` | 0 0% 92% | #EBEBEB | every 1px border, dividers, progress track |
| `--muted` | 0 0% 98% | #FAFAFA | code/spec boxes, zebra fills (often `bg-muted/30`, `/40`) |
| `--muted-foreground` | 0 0% 35% | #595959 | body copy, secondary text, idle tabs |
| `--primary` | 0 0% 7% | #121212 | buttons |
| `--sidebar` | 0 0% 98% | #FAFAFA | dashboard sidebar |
| `--sidebar-accent` | 0 0% 95% | #F2F2F2 | active sidebar item |
| `--radius` | .5rem | 8px | base radius |

The palette is **pure greyscale**. Colour appears only as status:

| Meaning | Colour |
|---|---|
| PASS / solved | `#22c55e` |
| FAIL / bug / "vacuous" rows | `#ef4444`, row tint `rgba(239,68,68,.06)` |
| TIMEOUT / ERROR | `#f97316` |

Hard-coded (not variables): idle link `#525252` → hover `#0a0a0a`; footer blurb `#767676`; nav "Get Started" bg `#0a0a0a`; terminal bg `#0A0A0A`, text `#e8e8e8`, placeholder `#808080`.
Heatmap ramp (profile page, 90 days): `#ebedf0 #d0d0d0 #909090 #505050 #141414`.

---

## 4. Type scale (measured)

| Use | Classes | Size / line-height | Weight | Tracking | Font |
|---|---|---|---|---|---|
| Landing H1 | `text-5xl sm:text-6xl font-bold tracking-tighter leading-[1.06]` | 60 / 60 (≥640px); 48 below | 700 | −3px (−0.05em) | Geist |
| Course H1 | `text-4xl sm:text-5xl font-bold tracking-tighter leading-[1.06]` | 48 | 700 | −0.05em | Geist |
| Module H1 | `text-5xl font-bold leading-tight` | 48 / 60 | 700 | −1px | Geist |
| Landing H2 (section) | `text-3xl sm:text-4xl font-bold tracking-tight` | 36 / 40 | 700 | −0.025em | Geist |
| Card H2 | `text-xl font-bold tracking-tight` | 20 / 28 | 700 | −0.5px | Geist |
| Module section H2 | `text-2xl font-bold` | 24 / 32 | 700 | — | Geist |
| Card H3 | `text-base font-bold tracking-tight leading-tight` | 16 / 20 | 700 | −0.4px | Geist |
| Module H3 | `text-base font-semibold mt-6|8 mb-3` | 16 | 600 | — | Geist |
| Module H4 (callout title) | `text-[16px] font-semibold mb-2` | 16 | 600 | — | Geist |
| Drill task title | `text-lg font-bold tracking-tight mb-4` | 18 | 700 | −0.025em | Geist |
| Lead / body | `text-base text-muted-foreground leading-relaxed` | 16 / 26 | 400 | — | Geist |
| Drill body | `text-[14px] text-muted-foreground leading-relaxed` | 14 / ~22.75 | 400 | — | Geist |
| Drill spec box | `text-[13px] leading-relaxed` | 13 / 21 | 400 | — | Geist |
| **Eyebrow / label** | `font-mono text-[11px] uppercase tracking-widest text-muted-foreground` | 11 / 16.5 | 400 | 0.1em (1.1px) | Geist Mono |
| Micro label | `font-mono text-[10px] uppercase tracking-widest` | 10 | 400 | 0.1em | Geist Mono |
| Stat number | `font-mono text-3xl font-bold tracking-tight` (course page: `text-2xl`) | 30 / 36 (24) | 700 | −0.025em | Geist Mono |
| Inline code | `font-mono text-[12px]` (+ `bg-muted px-1` in drill concepts) | 12 | 400 | — | Geist Mono |
| Code block | `font-mono text-[12px] leading-[1.75]` (landing) / `leading-relaxed` (module `pre`) | 12 | 400 | — | Geist Mono |
| Nav brand | `text-base font-bold tracking-[-0.03em]` | 16 | 700 | −0.03em | Geist |
| Footer brand | `font-bold text-[18px] tracking-[-0.03em]` | 18 | 700 | −0.03em | Geist |
| Nav link | `text-[14px] text-[#525252]`; "Courses" `text-[13px] text-muted-foreground` | 14 / 13 | 400 | — | Geist |
| Button (large) | `font-medium` | 16 | 500 | — | Geist |
| Button (nav CTA) | inline | 13 | 600 | — | Geist |

Brand wordmark is plain lowercase text **"formal"** in Geist 700 with −0.03em tracking — no logo image.

---

## 5. Layout & spacing

- Breakpoints: Tailwind defaults (640 / 768 / 1024 / 1280 / 1536). The drill workspace switches at **lg (1024)**.
- `.container` = `width:100%`, max-width steps 640→1536, `mx-auto px-6` (24px gutters). Content wrappers inside it: `max-w-4xl` (896, hero / course pages), `max-w-6xl` (1152, card grids), `max-w-2xl` (672, CTA), `max-w-5xl` (1024, module page).
- Top nav: `fixed top-0 w-full z-50 border-b bg-background`, inner `container px-6 h-[52px]` (real height 53 with border).
- Landing section rhythm (from `<main>` children): hero `pt-28 pb-14 px-6` → primary-path cards `px-6 pb-12` → tracks `px-6 py-14` → `border-t` → demo `py-16` → `border-t` → stats `py-14` → `border-t` → CTA `py-20`. Separators are `div.border-t.border-border`.
- Cards: `border border-border rounded-xl (12px) p-6 hover:border-foreground transition-colors`, **no shadow anywhere** on content cards.
- Grid gutters 24px; stat tiles use the `gap-px` trick: `grid gap-px border border-border rounded-xl overflow-hidden` with `bg-background` cells (`px-5 py-4`).
- Radii seen: 4px (`rounded`: badges, spec boxes, run button, Guided pill), 7px (nav CTA), 9px (large buttons), 12px (cards, stat grid), 9999px (round icon buttons, progress track, drill dots). `rounded-sm` for module `pre` blocks.
- Shadows: essentially none (`shadow-sm` only on the 24px floating-chat close button).
- Z-index: nav 50, module sticky strip 40, toasts 100.

---

## 6. Components (classes to reproduce)

**Top nav (public)** — `[formal] [Courses ▾] [Leaderboard] …… [Sign in] [Get Started]`. Get Started: bg `#0a0a0a`, white, 13/600, padding 8×18, radius 7, no border. Courses = dropdown button with chevron. Mobile: hamburger (`sm:hidden`).

**Breadcrumb nav (module/drill)** — `sticky top-0 h-[52px]`: `formal › Discrete Mathematics › Module 1`, separators `›` in muted, current crumb `text-foreground`. Drill adds a "Module 1 ▾" dropdown and a **Guided** pill: `font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded bg-foreground text-background`. Right side: theme toggle + avatar menu.

**Buttons** — Primary large: `h-12 px-8 rounded-[9px] bg-foreground text-background font-medium border` (+ right-arrow icon, gap). Secondary large: same but `bg-background text-foreground border-border`. Run button: `bg-foreground text-background font-bold rounded text-[12px] px-5 py-2 hover:opacity-80`. Mono chip button: `font-mono text-[12px] border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground`.

**Eyebrow + tag chips** — "COURSE 1" chip `font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-muted text-muted-foreground`; the main-course chip is inverted (`bg-foreground text-background`).

**Course card** (landing) — header row: chip + category label → H2 → `text-sm` description → **mini-preview well** (`rounded-lg border border-border overflow-hidden bg-muted/30` for the truth-table card; black `#0a0a0a` code card with filename header + PASS/FAIL footer for the others) → footer row `10 modules  42 drills … Start here →` in `font-mono text-[11px]`.

**Mini truth-table** — `font-mono text-[12px]`, header cells `text-[11px] font-semibold text-muted-foreground`, cell padding `px-3.5 py-1.5`, rows `border-b border-border/50`; "vacuous" rows red `#ef4444` with `rgba(239,68,68,.06)` bg.

**Landing code-card syntax colours (dark card, VS-Code-Dark+ palette)** — comment `#4a7a4a`, keyword `#569cd6`, ident/text `#9cdcfe`, control `#c586c0`, function `#dcdcaa`, plain `#cccccc`, dim `#555555`; counterexample text `#333/#444` on the light variant, fail `#ef4444` 600.

**Stat tiles** — 4 cells, number in Geist Mono bold + unit word in mono muted, caption `text-xs`/`text-[12px]` muted below; cell `px-5 py-6`, right border between cells.

**Progress bar** — label row (`YOUR PROGRESS` mono 11px uppercase ⟷ `0/10 modules completed` mono 11px bold) over `h-1.5 bg-border rounded-full` with inner `bg-foreground rounded-full transition-all duration-500 ease-out`.

**Phase tabs (course page)** — sticky `top-0 z-40 bg-background border-b`, `h-11`, buttons `px-4 font-mono text-[11px] uppercase tracking-widest border-b-2`; active `text-foreground border-foreground`, idle `text-muted-foreground border-transparent hover:text-foreground`; secondary span `ml-1.5 text-muted-foreground` ("Modules 1–5").

**Module row (course page)** — `a > div.grid lg:grid-cols-[220px_1fr] border border-border hover:border-foreground/50`. Left cell `px-5 py-5 border-r`: numbered circle (`w-7 h-7 rounded-full border-2 font-mono text-[11px] font-bold`) + phase label (mono 10px), title `font-semibold text-[15px] leading-snug tracking-tight`, blurb `text-[12px] text-muted-foreground`, footer `~6 hrs` + `START →` + "Mark done" chip. Right cell `divide-y divide-border`: one row per drill: `px-5 py-3.5 flex gap-3`, badge column `min-width:96px` with `GUIDED` / `OPEN` badge (`font-mono text-[9.5px] uppercase tracking-widest px-1.5 py-0.5 border border-border text-muted-foreground`, square corners), description `text-[13px] text-muted-foreground`. Rows animate in: `transition-all duration-500 ease-out opacity-0 translate-y-4 → opacity-100 translate-y-0` (stagger on scroll).

**Floating feedback launcher** — fixed bottom-right, 48×48 round `bg-foreground` chat button with a 24×24 round white "×" dismiss chip on its corner (`border shadow-sm`). (likely posts to `/api/feedback` — inferred, not opened).

**Footer** — `border-t bg-white`, inline border `#e8e8e8`, `container px-6`, padding 48 top / 32 bottom. Grid `grid-cols-2 sm:grid-cols-[1.6fr_1.2fr_1fr_1fr] gap-y-10 sm:gap-x-10`: brand + blurb (`text-[13px] #767676 max-w-[220px]`), then three link columns with mono label (`font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground font-medium mb-3`) and links (`text-[13px] #525252 → #0a0a0a`, `gap-[9px]`). Bottom bar: `© 2026 formal.org` (mono) left, "Powered by [Modal]" right.

**Toasts** — Radix/shadcn toast stack: `ol.fixed.top-0.z-[100] … sm:bottom-0 sm:right-0 md:max-w-[420px]`.

---

## 7. Information architecture

### 7.1 Routes (265 registered; pattern-level)

```
/                               landing
/about /research /support /privacy /terms /changelog /curriculum
/leaderboard  /score  /u/:nickname                      public profile
/login /register /forgot-password /reset-password /auth/callback
/verify-email /verify-university /verification-pending
/dashboard  /dashboard/{performance,activity,leaderboard,settings,help,profile,account}
/admin  /admin/{users,users/:id,activity,emails,feedback,error-logs,classic}

Courses  (slug → name)                          modules  drills/exercises
/discrete-math   Discrete Mathematics (Foundations)        10   42
/abv             Hardware Formal Verification (main)       10   (drill)
/wb2axip         AXI Formal Verification (applied)         10   (drill ×3 each)
/model-theory    Math Foundations of Model Checking        10
/solvers         Decision Procedures                        8   (exercises + drills)
/scaling         Industrial Practice: Scaling FV            5

Per course:   /{course}                    overview
              /{course}/module/{n}         reading page
              /{course}/module/{n}/drill/{k}        workspace
              /{course}/module/{n}/exercise/{k}    paper problem (solvers, scaling)
```
Internal drill id format: `math-drill-1-1`, `drill-1-1` (see §8).

### 7.2 Page templates

1. **Landing** — Hero (eyebrow · H1 · lead · 2 CTAs · mono fact line "155 engine-verified drills · open-source toolchain · real production RTL") → "THE PRIMARY PATH" 3 course cards → "CROSS-CUTTING TRACKS" 3 cards (+ right-aligned "Take in any order after Foundations") → "WHAT IT LOOKS LIKE" H2 + paragraph + **live-looking editor demo** (tabs `design.sv | verify.sby`, pill "DRILL 9.1 — VALID STABILITY", PASS/FAIL output) → stat strip (155 drills / 53 modules / 0 installations / 100% open-source) → closing CTA ("Six courses. Choose your starting point.") → footer.
2. **Course overview** — breadcrumb-less nav; header (eyebrow category · H1 · description · "Start Module 1 →") → 4-up stat grid (drills/modules/guided/installations) → progress bar → sticky phase tabs → phase sections (mono H2 + module-range + one-line description) each containing module rows → Prerequisites box → further sections.
3. **Module page** — breadcrumb nav → sticky "THIS MODULE:" drill strip (current drill inverted pill `bg-foreground text-background font-bold`, others outlined; right side `6 drills · ~3–4 hrs`) → header (`max-w-2xl`: eyebrow "Module 1 · Language", H1, lead, mono meta "~40 min reading · ~30 min exercises · ~90–180 min drills") → two-column body `max-w-5xl`: `main` + right rail "ON THIS PAGE" (scroll-spy TOC, active = bold with left bar) and "DRILLS" list with status dots.
4. **Drill workspace** — see §8.
5. **Dashboard** — left sidebar (Overview · Performance · Activity · Leaderboard │ Settings · Help) + avatar/account menu at bottom; empty states are centred (`No performance to track yet` / helper text / `Get started →` dark button). [S]
6. **Leaderboard** — per-course (chips: Discrete Math · Formal Verification · AXI · Model Checking · Decision Procedures · Industrial Practice), ⌘K search, scoring-rules accordion (`10 pts per drill · 8 if solution viewed first · exercises don't earn points`), "Add affiliation" nudge, ranked rows (rank · avatar · handle · affiliation "INDEPENDENT" · progress bar 42/42 · circular progress · points). Ties share rank. [S]
7. **Settings** — Profile (photo, handle 3–30 chars letters/numbers/underscore with "changing breaks old links" warning, bio ≤500, full name, display name, LinkedIn/GitHub/website, leaderboard preview) and Account tabs. [S]
8. **Help** — FAQ cards grouped by topic (Scoring & Completion, Profile & Identity …). [S]

### 7.3 Module-page content pattern (what your authored content must fit)

Sections are `<section class="section-anchor mb-16">` with a header block `div.mb-5 > div.section-number ("00") + h2`:

| # | Section | Notes |
|---|---|---|
| 00 | "What is …?" | 1 lead paragraph |
| 01 | Learning Outcomes | `ol.list-decimal.pl-5.space-y-3` (6 items) |
| 02 | Table of Contents | anchor links `flex gap-3 py-1 text-muted-foreground hover:text-foreground` |
| 03 | Why This Matters | 3 paragraphs, `mb-4` |
| 04…n | Concept sections | each = H2 → `H3` sub-topics → paragraphs → `pre` blocks → `div.takeaway` callout → **H3 "Worked example — …"** → **H3 "Try it yourself"** (bordered box with "Show answer →") → **H3 "Apply this concept"** (drill teaser card with H4 = drill title) |
| n+1 | Key Takeaways | |
| n+2 | What's Next | link to next module (`mb-8`) |

Reusable blocks:
- Paragraph: `text-base text-muted-foreground leading-relaxed mb-4`
- `pre`: `w1-mono text-[12px] bg-muted/40 border border-border rounded-sm p-4 overflow-x-auto leading-relaxed mb-4 whitespace-pre` (truth tables are monospaced text, not `<table>`)
- Try-it box: `border border-border p-5 mb-5`; label `font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-3`; body `text-[14px] text-foreground leading-relaxed`; reveal button `font-mono text-[12px] mt-4 border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground`
- Inline formatting: `strong`, `em`, `code.w1-mono.text-[12px]`; a `div.takeaway` callout exists (its CSS rule was not found — style unverified).
- Module/drill data live in TS data files compiled into chunks (`discreteMathModuleData-*.js`, `drill-registry-*.js`, `drill-designs-*.js` 355 KB) — i.e. **content is code, not a CMS/DB**.

---

## 8. The embedded verification tool

### 8.1 Drill workspace layout (≥1024px)
`div.h-screen [height:100dvh] flex flex-col overflow-hidden`, stacked strips, then a two-pane body:

| Strip | Height | Content |
|---|---|---|
| Breadcrumb nav | 52 | `formal › Module 1 ▾ › Drill 1.1 [GUIDED]` · theme toggle · avatar |
| Nav strip | 42 | `Module 1 / The Vacuous Pass` ⟷ 6 round progress dots (22px, `border-[1.5px]`; current = filled `#111` with 6px white core; others border `#ccc`) ⟷ `← —` / `DRILL 1.2 →` mono buttons (26px) |
| Score bar | 40 | `DRILL 1.1  0 / 10 pts · NOT YET SOLVED · 0 RUNS · SOLUTION UNLOCKS AT 3` (signed-out: "Sign in to track your score") ⟷ `First solved by @user · date` (links `/u/:nick`) |
| Body | flex-1 | **react-resizable-panels** horizontal group: **left 38% / handle 12px / right 62%** |

- **Left panel (brief)** — `border-r overflow-y-auto`, `p-6`: eyebrow (`MATH DRILL 1.1 — PROPOSITIONAL LOGIC`) → H2 → sections with mono eyebrows (`WHAT IS A FIFO?`, `SPECIFICATION (ENGLISH)`, `YOUR TASK`, `GOAL`, `NOTE`, `DESIGN — READ ONLY`, `SUPPORTED SYNTAX`, `CONCEPTS`) → callout boxes `bg-muted border border-border rounded p-4 mb-4 text-[13px]` → figure/diagram cards (`border border-border rounded p-4`) → `pre.bg-muted font-mono text-[11px] p-4 rounded`. Dividers `border-t border-border my-5`.
- **Resize handle** — `w-[12px] bg-border hover:bg-foreground/10 cursor-col-resize`, five 3-px dots `bg-foreground/25 → /50` on hover.
- **Right panel** — column: (a) **file-tab bar** `h-[44px] border-b px-1` with tabs `px-4 h-[44px] text-[13px] font-medium border-b-2` (active `text-foreground border-foreground`, idle `text-muted-foreground border-transparent`): `design.sv [read-only]` · `properties.sv` · `verify.sby` · `🔒 solution` (disabled until unlocked, `cursor-not-allowed`, title "Run more times to unlock the solution"); **Run Verification** button right-aligned. (b) **Monaco editor** (top ≈ 55%) (c) horizontal drag handle (dotted) (d) **Output terminal** (bottom ≈ 45%).
- **Mobile (<1024)** — 3 tabs `Task | Editor | Output` (`h-[44px] border-b-2`), compressed header (52 + 40 + 42), mobile Run button; module pages add `pb-24 lg:pb-0` on mobile.

### 8.2 Editor (Monaco) — light theme "formal-bw"
Custom theme extends `vs`; everything black/grey, keywords bold:

```
comment #888888 · keyword #000000 bold · keyword.control #000 bold · string/number/type/identifier/delimiter/operator #000000
editor.background #ffffff · foreground #000000 · lineHighlightBackground #ffffff
lineNumber #bbbbbb (active #555555) · cursor #000000
selection #d0d0d0 · inactiveSelection #e8e8e8 · indentGuide #f0f0f0
```
Options: `fontFamily:"monospace", fontSize:13, minimap off, lineNumbers on, wordWrap off, scrollbar vertical 6px, overviewRulerLanes 0, renderLineHighlight none, padding top 12, automaticLayout, quickSuggestions off, suggestOnTriggerCharacters off, wordBasedSuggestions off, parameterHints off, contextmenu off, snippetSuggestions none`. `design.sv` tab is `readOnly`. Languages lazily imported (`systemverilog`, `ini` for `.sby`). Monaco workers bundled (`monacoWorkerSetup-*.js` 3.7 MB + CSS incl. codicon font).
Per-drill editor state appears to be persisted: a hook takes `(drillId, "properties_sv" | "verify_sby", starter)` and an `/api/drafts/:id` endpoint exists — so edits likely save server-side (inferred, not exercised).

### 8.3 Output terminal (always dark, even in light theme)
Container `bg-[#0A0A0A] text-white flex-1 min-h-0 flex flex-col`, `data-testid=panel-output`:
- Header `px-4 pt-3 pb-2`: `OUTPUT` (mono 11px uppercase tracking-widest `text-neutral-400`) · status badge (`font-mono text-[11px] font-bold px-2 py-0.5 rounded`, colour+1px border from status: PASS `#22c55e`, FAIL `#ef4444` (or green when FAIL is the *target*, label **"BUG FOUND"**), TIMEOUT/ERROR `#f97316`) · `running…` (pulse) · `Clear` right (`text-neutral-400 text-[12px]`).
- Body `flex-1 overflow-y-auto px-4 font-mono text-[13px] leading-relaxed`:
  - idle: grey `#808080` "> Waiting for verification run… > Click "Run Verification" to execute SymbiYosys > against the current files. Results will appear > here in real time. > Estimated run time: 5–15 seconds"
  - running: "> Submitting to SymbiYosys backend… > Running — this takes 5–15 seconds" (pulse)
  - result: raw solver log + (on FAIL) counterexample/trace viewer (`trace`, `assertion`, `failure_cycle`, `vcd_base64`, `vcd_truncated`) + a generated plain-English explanation (PASS-but-vacuous hint, cover-mode hint, timeout hint, backend-error hint).
- Footer badge: `a[href=https://modal.com] w-fit mx-auto mb-2 flex gap-1.5 px-2 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10` → "Powered by" (mono 10px) + `/images/modal-logo.png` (h 14) + "Modal".

### 8.4 Run contract (client → server)

Drill content lives client-side as objects, e.g.
```js
"drill-1-1": {
  starter:  { design_sv, properties_sv, verify_sby },   // template strings
  solution: { properties_sv, ... }                      // gated
}
```
`verify_sby` is a normal SymbiYosys file: `[tasks] [options](mode bmc|cover, depth N) [engines](smtbmc boolector) [script](read -formal design.sv properties.sv; prep -top formal_tb) [files]`. A `formal_tb` testbench module instantiates `dut` and `properties`; `properties.sv` starts with `` `default_nettype none `` and contains the `f_past_valid` reset idiom plus the learner's `assert` / `cover`.

**Request** (both endpoints, JSON, `Content-Type: application/json`):
```json
POST /api/drill/{drillId}/verify      // signed-in → graded
POST /api/run-proof                 // signed-out → same body + "drill_id"; not graded
{ "design_sv": "...", "properties_sv": "...", "verify_sby": "..." }
```
**Response**
```jsonc
// /api/run-proof  → the runner object directly
// /api/drill/:id/verify →
{
  "runner":  { "status": "PASS|FAIL|TIMEOUT|ERROR", "elapsed_seconds": 7.4, "raw_output": "…",
               "trace": …, "assertion": …, "failure_cycle": …, "vcd_base64": "…", "vcd_truncated": false },
  "grading": { "solved": true, "awarded": true, "attemptCount": 3, "finalPoints": 10, "totalPoints": 10 }
}
```
Client behaviours worth copying:
- `401` → open sign-in; `429` → show server `message` ("You're running proofs too fast…"); if `error_code === "server_busy"` **auto-retry** using `Retry-After` + 0–1 s jitter, capped retries.
- Non-JSON or network failure → synthesise `{status:"ERROR", raw_output:"Could not reach the verification backend."}`.
- Attempt counting drives UX: run N unlocks the **solution** tab (`/api/drill/:id/solution-status`, `/view-solution`; viewing first caps points 10→8).
- Completion side-effects: `POST /api/drill/attempt {drillId,result}`, `POST /api/drill/:id/complete {result}`, first solver lookup `GET /api/drill/:id/first-solver → {firstSolverId, firstSolvedAt, displayName, profileNickname}`.
- Each drill has a **target status** (`PASS` = prove correct, `FAIL` = find the bug). Solved = runner status equals target. Vacuous-pass teaching flow uses `cover` mode.

### 8.5 Other API surface (for data-model planning)
`/api/auth/{login,register,logout,me}` (cookie session; `me` → 401 when signed out) · `/api/profile[/…]`, `/api/users/{profile,email,password,email-preferences}`, `/api/upload/image` · `/api/scores/me`, `/api/leaderboard`, `/api/activity/me`, `/api/last-activity` · `/api/{abv,math,model-theory,solvers,scaling,wb2axip}-progress` (one progress table per course) · `/api/drill/*`, `/api/drafts/:id`, `/api/run-proof` · `/api/verify-email`, `/api/verify-university[-token]`, `/api/university-status` (affiliation verification) · `/api/forgot-password`, `/api/reset-password`, `/api/validate-reset-token` · `/api/feedback`, `/api/error-logs` · `/api/admin/*` (users, learners, stats, retention cohorts, audit log, drill-config, course-modules, export-scores.csv, emails, error groups).

### 8.6 What the browser cannot reveal [?]
The Modal function itself (container image, Yosys/SymbiYosys/Boolector versions, timeouts, sandboxing, how `formal_tb` is generated, grading rules, `trace` schema details, rate-limit thresholds) runs server-side and is not visible from the front end. Only the contract above is known. You will need to design/host your own runner.

---

## 9. Gaps / not yet verified
- Dashboard, leaderboard, settings, help: captured from screenshots only (the browser pane was signed out, `/api/auth/me` = 401). Exact sidebar width / paddings need one measurement pass while signed in.
- Landing "What it looks like" demo editor and courses dropdown panel were not measured in DOM.
- Dark theme skipped by request.
- Mobile layouts only read from class names, not rendered.
- Only Module 1 / Drill 1.1 of Discrete Math was opened in full; other courses reuse the same chunks (`Drill{n}-*.js`, `Module-*.js`) so templates should match, but per-course variants (e.g. `exercise` routes in solvers/scaling) were not opened.

## 10. IP note (for the next phase)
Layout, tokens, component structure and the run-contract pattern are reproducible. Do **not** carry over: the "formal" name/wordmark, og-image, Modal logo asset, drill/module text, SVA exercises, or solutions — those are the original site's content. Your own content goes into the same data shape (`starter`/`solution`/brief/modules).
