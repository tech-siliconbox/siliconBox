#!/bin/sh
# Praman's ported tests (tests/praman) inside the solver image: the toolchain sessions run with in
# production (ADR 0031), as formal-verify's CI runs them. The image holds the app; only the tests
# are mounted. The throwaway container also gets pytest and ps (the process tests read it); the
# image itself does not. The tests' work folders (sby logs included) are left in $2 (default: a
# new temporary folder) for CI to keep when a test fails.
# Usage, from apps/solver: sh scripts/praman-tests-in-image.sh [image] [work folder]
set -eu
image="${1:-siliconbox-solver:dev}"
work="${2:-$(mktemp -d)}"
mkdir -p "$work"
docker run --rm --user 0 \
  --volume "$(pwd)/tests:/app/tests:ro" \
  --volume "$work:/out" \
  --env SOLVER_REQUIRE_SBY=1 \
  --entrypoint sh "$image" -c '
    set -e
    apt-get update -qq && apt-get install -y -qq --no-install-recommends procps >/dev/null
    python -m pip install --quiet --no-cache-dir -c constraints.txt pytest fakeredis httpx2
    status=0
    PATH=/opt/oss-cad-suite/bin:$PATH /usr/local/bin/python -m pytest -q -p no:cacheprovider \
      --basetemp=/out/pytest tests/praman || status=$?
    chmod -R a+rX /out    # the runner reads them back (CI keeps them when a test failed)
    exit "$status"'
