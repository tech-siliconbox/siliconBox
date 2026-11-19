"""The ceilings a learner's level puts on Praman, and the proof time their engines use (ADR 0031).

The web app sends the ceilings with every call and the session host sets them here. The ported
code asks this module where it starts engines:
- `seconds` and `depth` lower a time limit or a trace length to the ceiling (the settings
  commands, `prove -time_limit`, and `run_formal`, which every proof, what-if and drivers run
  goes through);
- `engine_timeout` caps each engine process at the ceiling and at the proof time left today
  (0 when none is left: `run_tree` then times out without starting it);
- `engine_running` counts the real time engines run: proof minutes are that time, never the
  time spent typing or reading.

Without ceilings (Praman's own tests) nothing is lowered and nothing is counted.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager

from app.praman.protocol import Ceilings


class _State:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.ceilings: Ceilings | None = None
        self.running = 0  # engine processes running now
        self.since = 0.0  # when the first of them started
        self.used_since_set = 0.0  # engine seconds since the ceilings were last set
        self.unreported = 0.0  # engine seconds not yet handed to the web app

    def settle(self, now: float) -> None:
        """Count the engine time up to `now` (call with the lock held)."""
        if self.running:
            self.used_since_set += now - self.since
            self.unreported += now - self.since
            self.since = now


_state = _State()


def set_ceilings(ceilings: Ceilings | None) -> None:
    with _state.lock:
        _state.settle(time.monotonic())
        _state.ceilings = ceilings
        _state.used_since_set = 0.0


def current() -> Ceilings | None:
    return _state.ceilings


def seconds(limit: float) -> int:
    """A time limit lowered to the proof-time ceiling."""
    ceilings = _state.ceilings
    return int(limit) if ceilings is None else int(min(limit, ceilings.proof_seconds))


def depth(cycles: int) -> int:
    """A trace length lowered to the ceiling."""
    ceilings = _state.ceilings
    return cycles if ceilings is None else min(cycles, ceilings.trace_length)


def seconds_left() -> float:
    """Proof time left today; infinite without ceilings."""
    with _state.lock:
        _state.settle(time.monotonic())
        if _state.ceilings is None:
            return float("inf")
        return max(0.0, _state.ceilings.seconds_left - _state.used_since_set)


def engine_timeout(requested: float | None) -> float | None:
    """The timeout an engine process gets: the lowest of what was asked, the proof-time ceiling
    and the time left today (0 when less than a second is left)."""
    ceilings = _state.ceilings
    if ceilings is None:
        return requested
    left = seconds_left()
    capped = min(float(ceilings.proof_seconds), left if left >= 1 else 0.0)
    return capped if requested is None else min(requested, capped)


@contextmanager
def engine_running() -> Iterator[None]:
    """Counts the time while at least one engine process runs (parallel ones count once)."""
    with _state.lock:
        now = time.monotonic()
        _state.settle(now)
        if _state.running == 0:
            _state.since = now
        _state.running += 1
    try:
        yield
    finally:
        with _state.lock:
            _state.settle(time.monotonic())
            _state.running -= 1


def take_used() -> float:
    """Engine seconds since the last call: what the web app counts against the allowance."""
    with _state.lock:
        _state.settle(time.monotonic())
        used, _state.unreported = _state.unreported, 0.0
        return used
