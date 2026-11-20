# 0031. Praman, the formal tool page: one sandboxed container per session

- Status: Accepted (founder, 2026-11-19)
- Date: 2026-11-19

## Context

Today learners run code on the formal tool only inside Drills. The server attaches each Drill's
top module, depth and timeout (hard rule 6), and every run is a short job in a fresh container
(ADR 0020). The founder wants a page of its own where a learner works on their own design the
way formal-verify's Praman works: a JasperGold-style session with a menu bar, design hierarchy,
property table, log, Tcl console, waveforms, reports and run history, driven by more than 40 Tcl
commands.

Praman cannot be deployed as it is. It brings back the findings the solver import fixed
(`docs/security/solver-hardening.md`):
- the browser calls it directly, with CORS `*`;
- it has its own accounts, with a token in `localStorage`;
- `tclsh`, Yosys and the engines run on the server itself;
- the user sets the top module, the trace length and time limits of hours.

The plan, the options and what each part of formal-verify does are in
`docs/roadmap/tool-page-plan.md`. The founder confirmed every decision there on 2026-11-19.

## Decision

### What it is

- The tool keeps the name **Praman**. The page is `/tool`, and the header link is
  **"Formal Tool"**. It is for computers and tablets; phones see a short note to open it on a
  computer.
- **Scope:** the whole Praman tool, in two UI releases.
  - Core: files, hierarchy, source tabs, property table, log, Tcl console; elaborate, clock and
    reset; prove and stop; waveform, example files and run history.
  - Deeper checks: coverage and proof core, assertion strength, equivalence, case split, tasks,
    abstraction, connectivity, assumptions and dead ends, reset check, drivers, what-if and
    quiet trace, HTML report, history diff and restore.
- **Not included:** the Formal Agent (AI on Ollama or OpenAI), Certifaiger certified proofs, and
  sharing sessions between learners.
- **Source:** ported from the formal-verify copy at backend `1bfa69ba` and frontend `f20fdbf`.
  Later changes there are ported on purpose, never synced. Never copied: the `app/agent`
  package, the `backend/docs` PDFs (IEEE 1800-2017 and the SymbiYosys manual), `backend/data`,
  `backend/eval`, `backend/runs`, LoRA files and `.env` files.

### Architecture: one sandboxed container per open session

```
Browser    ──commands, poll──▶ web app /api/v1/tool/… (four gates)
web app    ──signed token────▶ solver /sessions (supervisor)
supervisor ──stdin/stdout────▶ session container: Praman session (Tcl safe mode, Yosys, engines)
```

- **Browser to web app.** The browser talks only to the web app. Every route goes through the
  four gates (`withApiGate`): the Better Auth session, an owner check, Zod schemas from
  `packages/shared`, and rate limits. The page polls for updates, as Drill runs do; there is no
  SSE.
- **Web app to solver.** Calls carry signed HS256 tokens as in ADR 0020, with new scopes for
  sessions. The solver's `/sessions` API opens a session, runs a command, stops a proof, polls
  and closes. A session belongs to the learner in the token's `sub`; anyone else gets 404.
- **Supervisor to container.** The supervisor starts one container per open session from the
  solver image. Its isolation is the same as a Drill job container's:
  - no network, read-only root and a temporary work folder;
  - user 65534, every Linux capability dropped, `no-new-privileges`;
  - gVisor where the host has it;
  - 1 CPU and about 1.5 GB of memory.

  Commands go in on stdin and results come out on stdout. A container holds one session and no
  secrets.
- **Inside the container.** Praman's session and command code runs almost unchanged:
  - a Tcl interpreter in safe mode (no `exec`, `open`, `socket`, `file` or `cd`), with its own
    memory cap below the container's;
  - Yosys and the engines.

  Its HTTP routes, accounts, storage and folder queue are not ported, and its three imports
  from the agent package are cut.
- **Saved state lives in the web app's database, not in the container.** The solver has no
  database. After each command the web app stores what changed (files, journal, log, run
  results, traces) in MongoDB through `src/db`. The supervisor keeps only which container holds
  which session, in Redis. A container can be thrown away: the next command reopens the session
  by replaying its journal, as Praman restores sessions today.
- **Idle close.** A session's container closes after **15 minutes** without a command while no
  proof is running. Praman waits 4 hours, but here each open session holds a slot on a shared
  host. The value is set once in the solver's limits and tuned by the load test. The page also
  closes its session when it goes away (`DELETE /tool/sessions/:id/open`), as Praman does, so a
  closed tab frees its slot at once; the session opens again from its last save.
- **Capacity.** One open session per learner. Each host runs a fixed number of session
  containers. When it is full, learners wait in line and see their position. Past the line's
  length limit they are told the tool is busy and to try again.
- **A new engine for the tool only.** The tool uses Praman's engine:
  - the SystemVerilog and SVA front end on `pyslang` 12.0.0 (MIT, exact pin);
  - its own BMC, k-induction and SMT engines, and its SymbiYosys adapter;
  - Tcl added to the solver image.

  Drills stay on today's pipeline and the grading of ADR 0021. Moving them to the new engine is
  a later ADR, which runs the publish gate again on every Drill. Until then the solver carries
  two engines.

The fallback is option B: every command is a fresh job that replays the session's journal. It
fits today's job runner, but every command waits 2 to 5 seconds for a container and a fresh
elaboration, so the console stops feeling like a tool. It replaces A only if long-lived
containers prove hard to host.

### Learner-chosen settings: an exception to hard rule 6, on this page only

On `/tool` the learner chooses the top module, the proof time and the trace length, as in
JasperGold. They choose within ceilings the server sets for their level:

| Level | Proof time (one proof) | Trace length | Proof minutes a day |
| --- | --- | --- | --- |
| Basic | 5 min | 50 cycles | 60 |
| Intermediate | 15 min | 100 cycles | 120 |
| Advance | 30 min | 200 cycles | 240 |

- **Where the numbers live.** They are defined once in `packages/shared`. The web app sends the
  learner's ceilings in every signed session call. The solver also keeps its own absolute
  ceilings in `app/limits.py`, at the Advance values. A bug or a forged call upstream still
  cannot go past them.
- **Where they are enforced.** Ceilings apply where an engine starts, not only in the commands
  that set them, so every path obeys them: prove, the deeper checks, what-if, drivers and
  coverage traces.
- **Settings above a ceiling** (`set_prove_time_limit`, `set_prove_per_property_time_limit`,
  `prove -time_limit`, `set_max_trace_length`) are lowered to the ceiling, with a line in the
  log. JasperGold scripts still run.
- **The learner never chooses the engine or solver.** Praman accepts settings such as
  `set_engine_mode` only so existing scripts run; they have no effect.
- **Drills are unchanged.** Rule 6 still holds for them. Nothing on `/tool` grades or solves a
  Drill, and a Drill's hidden designs never reach the tool.

### Access

- **Who can use it.** The page needs an active **tool window** and an active content window (a
  plan), as running a Drill does: no plan, no tool access. Without both, the learner sees a
  locked card with "See pricing"; signed-out visitors are asked to sign in.
- **Which level applies.** The ceilings and the allowance follow the learner's highest active
  content level, the rule that sets the Drill run quota (`highestActiveLevel`).
- **One device (hard rule 4).** A tool session belongs to the learner, not the browser. When a
  sign-in elsewhere ends the first device's session, the new device reopens the same tool
  session.
- **Watermark (hard rule 5).** The page carries the learner's watermark, like every member page.

### Daily allowance: proof minutes

- **What counts.** The real time engines run in the learner's sessions: proofs and every check.
  Time spent typing or reading does not count.
- **Separate from Drills.** Using the tool never spends Drill runs, and Drill runs never spend
  proof minutes.
- **It cannot be overrun.** A proof or check starts only while minutes remain. Its time limit is
  the lower of the level's ceiling and the minutes left today. The real time is counted when it
  ends.
- **How it is counted.** In Redis, per 24 hours, like the Drill run quota. The allowance is
  defined once in `packages/shared`.
- **Commands that start no proof engine** (analyse, elaborate, reports, `get_*`, help) do not
  count. They have a time limit per command and a rate limit instead.

### Saved work

- **What is kept.** Sessions and run history per learner, as signed-in Praman keeps them: files,
  journal, settings, log, and runs with per-property results and traces. They go in the
  collections `tool_sessions`, `tool_files`, `tool_runs` and `tool_traces`, with a migration,
  indexes and database role grants.
- **Caps:**
  - 20 sessions per learner; a 21st asks the learner to delete one first;
  - the last 50 runs; older ones are dropped;
  - 1 MB of files per session;
  - 2 MB per trace; a longer trace is not kept, but its run keeps its results.
- **Retention.** A session and its runs are deleted 180 days after the session was last used.
- **Data rights (DPDP).** Sessions and runs are part of the learner's data download and are
  deleted with the account.
- **After the tool or content window ends.** The work stays, locked, until it expires. A new
  purchase opens it again.
- **Database size.** Free Atlas holds 512 MB in all. This is one more reason for M10 at launch
  (ADR 0022).
- **Logs.** They hold session ids, timings and outcomes, never files, commands or traces.

### Hosting

- **Before learners use it.** Option A needs a host that keeps containers running: Docker, or
  Fly Machines started per session.
- **Development and tests.** Docker Desktop.
- **Still open.** Which host the solver runs on (`docs/architecture/solver-integration.md`).
  The load test records how many sessions a host takes.

### Delivery

Six PRs, each merged on the founder's go:
1. this ADR and the doc updates;
2. the solver port, with the session runner and attack tests;
3. web data and API;
4. the core page;
5. the deeper checks;
6. load test and hosting.

Details are in `docs/roadmap/tool-page-plan.md`, section 7.

## Consequences

- Learners get a real formal tool beside the course. Commands answer at once, as on
  formal-verify, inside the same sandbox boundary as Drill runs.
- Hard rule 6 has its first exception. It is bounded by ceilings set on the server, written into
  CLAUDE.md and covered by attack tests. Drills are not affected.
- **New attack surface:** a Tcl console and long-lived containers. The page opens to learners
  only when the Praman rows in `docs/security/solver-hardening.md` are fixed with regression
  tests and the attack tests pass against a session container.
- **Capacity:** each open session holds 1 CPU and about 1.5 GB. Idle close and the waiting line
  keep that bounded. Hosting cost is unknown until the load test.
- **Size of the port:** about 20k lines of Python come over with their tests. They must keep
  passing while their edges change. The solver carries two engines until Drills move.
- **Storage:** MongoDB grows with saved sessions and traces. The caps and the 180 days bound it.
- **If long-lived containers prove hard to host,** option B replaces A and the page stays the
  same.

## Notes

- 2026-11-20 (PR 2): a closed session reopens from its last save (files, analysed sources, the
  elaborated design and results), the way Praman restores a session after a restart, not by
  replaying its journal. Tcl variables are not kept. The journal stays the session's script.
- 2026-11-20 (founder): the tool page is laid out like formal-verify's Praman, in SiliconBox's
  theme, and the header link carries Praman's own mark and name (the blue P and "Praman")
  instead of the words "Formal Tool". The page opens on "How Praman Works" for a learner without
  a session.
