# apps/solver

FastAPI service around OSS CAD Suite (Yosys and SymbiYosys). Private: only the SiliconBox backend calls it.

Origin: `gk2work/formal-verify-backend`. Do not ship it as it is; fix the findings first.

Read before editing: `../../docs/security/solver-hardening.md`, `../../docs/architecture/solver-integration.md`, `../../.claude/rules/solver.md`.

## Must stay true

- No unauthenticated route. No wildcard CORS. Signed service token on every call.
- Work folders are server-generated UUIDs; resolved paths are checked before any delete.
- `.sby` files come from a fixed template; `mode` and `solver` are allow-listed; `top_module` is validated.
- `timeout` and `depth` are set by the server per level.
- Jobs are persisted; ids are UUIDv4; results belong to a user.
- No synchronous run endpoint for learners.
- No RAG or LLM packages in this image.

## Layout (create as you build)

```
app/           FastAPI app, routers, services, job store
tests/         pytest, including one regression test per finding
Dockerfile     minimal runner image with OSS CAD Suite
```

Result shape: status (PASS, FAIL, TIMEOUT, ERROR), elapsed time, output, assertion, failure cycle, counterexample trace.
