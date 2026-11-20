# Praman, the formal tool page: plan

Status: **confirmed by the founder on 2026-11-19**: every decision in section 6 as written, and the
tool keeps the name Praman. PR 1 (section 7) writes these decisions into
[ADR 0031](../adr/0031-praman-formal-tool-page.md), accepted by the founder on 2026-11-19. The
ADR also settles what this plan left open: the page needs a content window too (no plan, no tool
access), idle sessions close after 15 minutes, settings above a ceiling are lowered to it, and a
21st saved session asks the learner to delete one.

## 1. Goal

A page of its own, `siliconbox.in/tool`, where a learner works on their own design with **Praman**,
the way formal-verify's Praman works:
- add SystemVerilog design and SVA files;
- analyse and elaborate, set clock and reset;
- prove, read the property table and open waveforms;
- run the deeper checks;
- keep a run history and type commands in a Tcl console.

The Drill runner embedded in module pages stays as it is.

## 2. What formal-verify has

Read from `~/Desktop/SB/formal-verify copy`: backend `1bfa69ba`, frontend `f20fdbf` (both clean,
remotes `gk2work/formal-verify-backend` and `-frontend`).

| Part | Where | Size | What it does |
| --- | --- | --- | --- |
| Praman session and commands | `backend/app/praman` | 6.8k lines | A JasperGold-style session: files, analysed sources, elaborated design, clock and reset, results, log. 40+ Tcl commands (listed below the table). Each session has a real Tcl interpreter: `tclsh` in safe mode (no `exec`, `open`, `socket`, `file`, `cd`) with a memory cap. Every menu action sends the Tcl command a user would type, so a session's journal replays it. |
| Proof services | `backend/app/services` | 4.7k lines | `formal_service.py` (2,079 lines, the proof pipeline), counterexamples, equivalence, assertion strength (mutants), reset analysis, HTML report, result cache, uploads, Yosys reader |
| SVA front end | `backend/app/services/sva` | 6.0k lines | A new SystemVerilog/SVA compiler built on `pyslang` 12.0.0. It replaces the older parser SiliconBox imported in October. |
| Engines | `backend/app/engine` | 2.2k lines | Its own BMC, k-induction, portfolio, SMT, proof cores, lemmas, cross-check and witness; a SymbiYosys adapter; certified proofs through Certifaiger (optional) |
| Proof jobs | `praman/jobs.py`, `worker.py` | | A folder queue on one machine, 2 worker processes, fair share per workspace |
| Storage | `praman/store.py`, `store_mongo.py` | | Sessions, files, log, runs, per-property results and traces, users, tokens, result cache (SQLite, PostgreSQL or MongoDB) |
| Accounts | `praman/auth.py` | | Its own email and password accounts; a bearer token kept in `localStorage` |
| API | `routers/praman.py` | 640 lines | 30 routes, grouped under the table |
| Tool UI | `frontend/src/praman` | 4.8k lines | Menu bar (File, View, Design, Prove, Reports, Tools), hierarchy and files panel, property table, log, Tcl console, source tabs, dialogs. The waveform (1,123 lines) has drivers, what-if, quiet trace, a "why" diagram and saved signal lists. Also report panels, run history, server status and the example FIFO. |
| Formal Agent (AI) | `backend/app/agent`, `frontend/src/pages/AgentPanel.jsx` | 9.0k + 1.6k lines | An agent that goes from a spec to proofs, on Ollama or OpenAI, with training data. Not part of the tool. |
| Tests | `backend/tests` | 682 tests | |
| Docs | `backend/docs` | | Include the IEEE 1800-2017 PDF and the SymbiYosys manual PDF: copyrighted, never copied |

Praman's Tcl commands:
- **Design:** `analyze`, `elaborate`, `clock`, `reset`.
- **Proving:** `prove`, `stop`, `assert`/`assume`/`cover`.
- **Checks:** `check_assumptions [-dead_end]`, `check_reset`, `check_conn`, `check_cov [-type proof]`, `check_strength`, `check_equivalence`.
- **Shaping the proof:** `case_split`, `stopat`, `abstract`, `task`.
- **Reading results:** `visualize`, `report`, `get_*` info.
- **Limits:** `set_prove_time_limit`, `set_max_trace_length`.
- **Scripts and help:** `source`, `help`.

The API's 30 routes:
- **Sessions:** create, files, command, stop, poll, SSE stream.
- **Results:** trace, what-if, drivers, coverage trace, equivalence trace, HTML report, script.
- **Run history:** list, files, trace, diff, restore, delete.

## 3. What SiliconBox has today

- **`apps/solver`:** a FastAPI job service.
  - Every call carries a signed HS256 token. Jobs go through a Redis queue and a worker.
  - `ContainerRunner` gives each job a fresh container: no network, read-only root, 1 CPU, 1 GB, ready for gVisor.
  - 13 hardening fixes are in place (`docs/security/solver-hardening.md`), with ceilings in `limits.py`.
  - Its engine is the October import: the older SVA parser plus SymbiYosys.
- **Web:**
  - Drill runs go through the four gates: `POST /api/v1/drills/:id/runs`, `GET /api/v1/runs/:id`.
  - They need the tool entitlement, with daily run quotas of 40/80/150 and a run cache.
  - The Drill workspace has `CodeEditor`, `RunOutput` and `WaveformView`.
- **Rules that shape the port:**
  - hard rule 6 (learners never choose depth, timeout or top module);
  - strict CSP, so no inline styles;
  - every input through Zod in `packages/shared`;
  - only `src/db` talks to MongoDB;
  - watermark on member pages;
  - data export and delete (DPDP);
  - exact dependency pins;
  - no secrets in the browser.

## 4. Why Praman cannot be deployed as it is

| Praman today | SiliconBox needs |
| --- | --- |
| The browser calls the tool directly; CORS `*` with credentials | The browser talks only to the web app; the web app calls the solver with signed tokens (hardening #4, #5) |
| Its own accounts, token in `localStorage` | Better Auth session cookie and the tool entitlement |
| `tclsh`, Yosys and the engines run on the server itself | Learner code runs only inside a sandboxed container |
| The user sets time limits (up to hours), trace length and top module | Hard rule 6 forbids this, so this page needs an exception, with ceilings set on the server |
| A folder queue on one machine | Sessions bounded per host, a waiting line, the existing Redis |
| Its own database layer, with users and blobs | MongoDB through `src/db`, Zod schemas, database roles, migrations, export and delete, retention |
| Live updates over SSE | Polling, as Drill runs do |
| Its own CSS, about 53 inline styles, `roughjs` | Site design (Tailwind, Geist, light tokens), no inline styles |
| One engine for everything | Drills keep their gated pipeline (ADR 0021 grading); the tool uses the new engine |

## 5. Architecture options

### A. One sandboxed container per open tool session (recommended)

```
Browser ──commands, poll──▶ web app /api/v1/tool/… (four gates)
        ──signed token────▶ solver /sessions (supervisor)
        ──stdin/stdout────▶ session container: Praman session (Tcl safe mode, Yosys, engines)
```

- **Little rewriting:** Praman's session and command code runs inside the container almost unchanged. Only its edges change: no HTTP, accounts or database inside.
- **The same sandbox as Drill runs:** no network, read-only root, temporary work folder, user 65534, every Linux capability dropped, gVisor where the host has it. The difference is that the container lives while the session is open.
- **Idle sessions close:** a session closes after a set idle time. Reopening it replays its journal; Praman already restores sessions this way.
- **Fast:** commands answer at once, as in formal-verify. Proofs run inside the session's container, within the server's ceilings.
- **Bounded capacity:** one session per learner, each with 1 CPU and about 1.5 GB. A host takes a fixed number of sessions; when it is full, learners wait in line and see their position.
- **Hosting:** needs an always-on host that runs Docker, or Fly Machines started per session.

### B. Every command is a job that replays the session

- The session is its files plus a journal in MongoDB. Each command runs in a fresh container that replays the journal, then runs the command.
- Fits today's solver exactly, scales out easily and costs nothing while idle.
- But every command waits for a container to start and the design to be elaborated again: 2 to 5 seconds, longer for big designs. The console no longer feels like a tool, and what-if, drivers and coverage pay that wait every time.

**Chosen: A** (decision 1). The tool is interactive, the way JasperGold is, and matching formal-verify needs instant commands. The container keeps the same security boundary as Drill runs. B stays as the fallback if long-lived containers prove hard to host.

## 6. Decisions (confirmed 2026-11-19)

| # | Decision | Confirmed |
| --- | --- | --- |
| 1 | Architecture | **A**: one sandboxed container per open session |
| 2 | Who can use the page | Learners with an active **tool window**, as for running Drills. Others see a locked card with "See pricing". (Alternatives: a small free allowance for any signed-in learner, or everyone signed in.) |
| 3 | Learner-chosen settings (hard rule 6) | On this page only, the learner chooses the **top module, proof time and trace length within server ceilings per level**: Basic 5 min per proof and 50 cycles, Intermediate 15 min and 100, Advance 30 min and 200. Drills keep rule 6 unchanged; CLAUDE.md rule 6 gets one line for the exception. |
| 4 | Daily allowance | **Proof minutes per day per level** (Basic 60, Intermediate 120, Advance 240), counted from real solver time and separate from Drill runs. **One open session** per learner. |
| 5 | Saved work | **Keep sessions and run history** per learner, as signed-in Praman does, for 180 days, included in data export and delete. Caps: 20 sessions, the last 50 runs, 1 MB of files per session, 2 MB per trace. Free Atlas holds 512 MB in all, another reason for M10 at launch. |
| 6 | Scope | **The whole Praman tool**, in two releases: core first, then the deeper checks. Not included: the Formal Agent (AI), Certifaiger certified proofs, sharing sessions between learners. |
| 7 | Name and address | The tool keeps the name **Praman** (page title and inside the tool, as on formal-verify). Page `/tool`, header link **"Formal Tool"** (since 2026-11-20 Praman's own mark and name; ADR 0031 notes). |
| 8 | Phones | Computers and tablets; phones get a short "open this on a computer" note |
| 9 | Drills' engine | Drills **stay on today's pipeline**. Moving them to the new front end is a later ADR, with the publish gate run again on every Drill. |

The solver's host is still an open decision (`docs/architecture/solver-integration.md`). Option A
needs an always-on Docker host before launch. Development and testing do not wait for it
(Docker Desktop locally); launch does.

Docs that change with these decisions:
- CLAUDE.md hard rule 6;
- `docs/product/access-model.md` and the glossary ("tool window" today means running Drills);
- `docs/architecture/solver-integration.md` (it plans to reuse the formal-verify UI as a library);
- `docs/security/solver-hardening.md` (new rows for the session container and the Tcl console).

## 7. Delivery

Each PR runs every check and is merged on the founder's go: branch, PR, green CI, merge, delete the
branch.

| # | PR | Contents | Done when |
| --- | --- | --- | --- |
| 1 | Decisions | ADR 0031 (architecture, the rule 6 exception, access, ceilings, allowance, storage) and the doc updates above | The founder approves the ADR |
| 2 | Solver: Praman core | Port `praman/`, `services/` (with `sva/`) and `engine/` into `apps/solver`. Cut the agent links (3 small imports), accounts, storage, routers and the folder queue. Pin `pyslang` 12.0.0 (MIT); add Tcl to the image. Session container runner and supervisor; `/sessions` API with signed tokens, size limits and ceilings. Port Praman's tests, plus attack tests: Tcl escapes, memory, endless scripts, proof ceilings, another learner's session. | Solver tests and attack tests pass; Drill tests unchanged |
| 3 | Web: data and API | Zod schemas in `packages/shared`. Collections `tool_sessions`, `tool_files`, `tool_runs`, `tool_traces`, with a migration, indexes, retention and database role grants (`db:verify-roles`). `/api/v1/tool/…` routes through `withApiGate`: entitlement, owner, allowance, rate limits. Route-coverage and gate tests; data export and delete. | Unit, entitlement and route tests pass |
| 4 | Tool page: core | `/tool` in the site design: menu bar, files and hierarchy, source tabs (`CodeEditor`), property table, log and console. Elaborate, clock and reset, and limits dialogs; prove and stop. Waveform (extend `WaveformView`, no second copy), example files, run history, locked card, header link. | e2e: a learner loads the example, proves, and sees the failing assertion with its waveform |
| 5 | Tool page: deeper checks | Coverage and proof core, assertion strength, equivalence, case split, tasks, abstraction, connectivity, assumptions and dead ends, reset check, drivers, what-if and quiet trace, HTML report, history diff and restore | An e2e test for each panel |
| 6 | Load and launch readiness | k6 load test for sessions, capacity per host, catalog and runbook | Numbers recorded; hosting decided |

## 8. Risks

- **Size:** about 20k lines of Python come over with their tests. They must keep passing while their edges change.
- **New attack surface:** the Tcl console. Tcl safe mode plus the container cover it; attack tests run before release.
- **Capacity:** each open session holds a container. Idle close and the waiting line keep it bounded.
- **Two engines in one solver** until Drills move.
- **MongoDB storage** on the free tier (decision 5).
- **formal-verify keeps changing:** we port from the commits above and record them in the ADR. Later changes are ported on purpose, never by syncing.

## 9. For the session that builds it

- **Order:** read this plan, then ADR 0031 once it exists.
- **The formal-verify copy is read-only:** copy code from it, never change it. Never copy:
  - `backend/docs` PDFs;
  - `backend/data`, `backend/eval`, `backend/runs`;
  - LoRA files;
  - the `app/agent` package;
  - `.env` files.
- **Where to look in formal-verify:**
  - backend: `backend/app/praman`, `backend/app/services` (with `sva/`), `backend/app/engine`, `backend/app/routers/praman.py`, `backend/Dockerfile`, `backend/tests`;
  - frontend: `frontend/src/praman`, `frontend/src/config/examples.js`.
- **In SiliconBox:**
  - solver: `apps/solver` (runner, limits, auth);
  - web: `apps/web/src/features/drills` (editor, waveform, run polling) and `apps/web/src/server/api` (gates);
  - rules: `docs/security/solver-hardening.md`, `docs/engineering/component-catalog.md`, `.claude/rules/*`.
