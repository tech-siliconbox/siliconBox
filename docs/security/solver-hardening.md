# Solver hardening (required before any paying learner)

Findings come from reading the code in `formal-verify-backend`. They were not tested against the live service. Reproduce each with a test before fixing.

| # | Finding | Risk | Fix | Status |
| --- | --- | --- | --- | --- |
| 1 | `project_name` from the request is joined onto the work folder and deleted with `shutil.rmtree` | Crafted name escapes the folder and deletes other directories | Ignore client names; server-generated UUID folder; confirm resolved path stays inside the work root | Open |
| 2 | `mode`, `solver` and `top_module` go into the `.sby` file unchecked | Injected lines could run Yosys commands | Allow-list mode and solver; validate top module; build `.sby` from a fixed template | Open |
| 3 | `timeout` and `depth` come from the client | One user can hold a CPU for a long time | Server-set caps per level; kill the process group | Open |
| 4 | CORS is `*` with credentials | Any site can call the API from a visitor's browser | Accept only SiliconBox backend calls with a signed service token | Open |
| 5 | No authentication on any route | Anyone can run jobs on your compute | Service auth (mutual TLS or signed JWT) plus network allow-list | Open |
| 6 | Jobs in an in-memory dict, short ids | Lost on restart, single instance, guessable | Persist jobs; UUIDv4 ids; results owned by a user | Open |
| 7 | `/run-sync` holds a request open | Ties up workers, proxy timeouts | Remove for learners; async only | Open |
| 8 | RAG and LLM packages in the solver image | Bigger attack surface, slow cold start | Split the assertion generator into its own service; minimal solver image | Open |

## Runner isolation target

One container per job; no network; read-only root; CPU, memory and time limits; gVisor or Firecracker.

## Gate

Phase 3 is done only when every row is Fixed with a regression test and an attack test against the deployed runner passes. Update the Status column as you go.
