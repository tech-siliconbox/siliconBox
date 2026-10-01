---
description: Rules for the solver service and runner image
paths:
  - "apps/solver/**"
---

# Solver rules

- No route is public. Accept calls only from the SiliconBox backend with a signed service token; allow-list the network.
- Ignore client-supplied paths and names. Use a server-generated UUID work folder and confirm the resolved path stays inside the work root before any delete.
- Allow-list `mode` and `solver`. Validate the top module name. Build the `.sby` file from a fixed template; never interpolate raw input.
- Timeout and depth are set by the server per level. Kill the whole process group on timeout.
- Jobs are persisted (MongoDB or Redis), ids are UUIDv4, results belong to a user. No in-memory job dict.
- No synchronous run endpoint for learners.
- Keep the image minimal: no RAG or LLM packages. The assertion generator is a separate service.
- Runners: one container per job, no network, read-only root, CPU, memory and time limits, gVisor or Firecracker isolation.
- Findings to fix first are in `docs/security/solver-hardening.md`.
