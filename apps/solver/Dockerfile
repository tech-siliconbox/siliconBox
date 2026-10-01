# SiliconBox solver image. One image, three uses:
#   API:     uvicorn app.main:app            (default command)
#   worker:  python -m app.worker
#   runner:  python -m app.job_runner        (one throwaway container per job, started by the worker)
# Build: docker build -t siliconbox-solver apps/solver

# ── OSS CAD Suite (Yosys, SymbiYosys, solvers), pinned to the version CI tests ─────────────
FROM debian:bookworm-slim AS tools
ARG OSS_CAD_SUITE_DATE=2026-10-01
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in amd64) arch=x64 ;; arm64) arch=arm64 ;; *) echo "unsupported $TARGETARCH"; exit 1 ;; esac; \
    stamp=$(echo "$OSS_CAD_SUITE_DATE" | tr -d -); \
    curl -fsSL -o /tmp/oss.tgz \
      "https://github.com/YosysHQ/oss-cad-suite-build/releases/download/${OSS_CAD_SUITE_DATE}/oss-cad-suite-linux-${arch}-${stamp}.tgz"; \
    tar -xzf /tmp/oss.tgz -C /opt; \
    rm /tmp/oss.tgz

# ── App ─────────────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SOLVER_TOOL_PATH=/opt/oss-cad-suite/bin \
    SOLVER_WORK_ROOT=/work
COPY --from=tools /opt/oss-cad-suite /opt/oss-cad-suite
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir . \
 && mkdir -p /work && chown 65534:65534 /work
# nobody: the app never needs root.
USER 65534:65534
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
