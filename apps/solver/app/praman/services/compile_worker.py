"""
SystemVerilog elaboration (pyslang, a native library) runs in worker
processes, not in the server process.

pyslang aborted the process on rare occasions ("nanobind: unexpected
collision": a compilation freed while Python still held wrappers of its
objects; fixed in frontend._new_compilation).  A native crash of the compiler
must never end every job in progress, so it still runs here: in a worker a
crash only ends that call.  A crashed worker is replaced and the call retried
once; if it crashes again, the call fails with a clear message.

Workers are started with "spawn" (no copy of the server's threads), stay
warm between calls, and run any module-level function whose arguments and
result can be pickled.  FORMAL_COMPILE_IN_PROCESS=1 runs everything in the
calling process instead (debugging).  Spawned workers re-import the main
script, so a script that calls run_isolated needs an
`if __name__ == "__main__":` guard (the server, run with `python -m
uvicorn`, and pytest have one).
"""

from __future__ import annotations

import logging
import multiprocessing
import os
import signal
import threading
from concurrent.futures import ProcessPoolExecutor, TimeoutError as FutureTimeout
from concurrent.futures.process import BrokenProcessPool
from typing import Any, Callable, Optional, TypeVar

from app.praman.services.sva.frontend import FrontendError

logger = logging.getLogger("veriassist.compile_worker")

WORKERS = int(os.environ.get("FORMAL_COMPILE_WORKERS", "") or 2)
TIMEOUT_SECONDS = float(os.environ.get("FORMAL_COMPILE_TIMEOUT", "") or 300)
IN_PROCESS = os.environ.get("FORMAL_COMPILE_IN_PROCESS", "") == "1"

T = TypeVar("T")


class CompilerCrash(FrontendError):
    """The SystemVerilog compiler crashed or did not finish."""


_lock = threading.Lock()
_pool: Optional[ProcessPoolExecutor] = None


def run_isolated(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """func(*args, **kwargs) in a worker process.  Exceptions raised by func
    are re-raised here; a crash of the worker is retried once."""
    if IN_PROCESS:
        return func(*args, **kwargs)
    for attempt in (1, 2):
        pool = _get_pool()
        try:
            # submit fails too when a worker died while idle
            future = pool.submit(func, *args, **kwargs)
            return future.result(timeout=TIMEOUT_SECONDS)
        except BrokenProcessPool:
            logger.error(f"compile worker crashed running {func.__name__} (attempt {attempt})")
            _discard(pool)
        except FutureTimeout:
            _discard(pool, kill=True)
            raise CompilerCrash(f"The SystemVerilog compiler did not finish within {TIMEOUT_SECONDS:.0f} s.")
    raise CompilerCrash("The SystemVerilog compiler crashed while reading the design (twice). "
                        "This is a problem in the tool, not in your files; please run again.")


def _quiet_worker() -> None:
    """Ctrl-C in the terminal reaches the workers too; the server ends them
    itself (shutdown), so they must not each print a KeyboardInterrupt."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)


def _get_pool() -> ProcessPoolExecutor:
    global _pool
    with _lock:
        if _pool is None:
            _pool = ProcessPoolExecutor(max_workers=WORKERS, mp_context=multiprocessing.get_context("spawn"),
                                        initializer=_quiet_worker)
        return _pool


def shutdown() -> None:
    """End the workers (when the server stops)."""
    pool = _pool
    if pool is not None:
        _discard(pool, kill=True)


def _discard(pool: ProcessPoolExecutor, kill: bool = False) -> None:
    """Drop a broken (or stuck) pool; the next call starts a new one.  Other
    calls that were running in it see BrokenProcessPool and retry."""
    global _pool
    with _lock:
        if _pool is pool:
            _pool = None
    if kill:
        # a stuck worker never returns: end it (no public API before 3.14)
        for process in list(getattr(pool, "_processes", {}).values()):
            process.kill()
    pool.shutdown(wait=False, cancel_futures=True)
