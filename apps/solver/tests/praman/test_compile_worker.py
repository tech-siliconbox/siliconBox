"""
Elaboration runs in worker processes (compile_worker.run_isolated): a crash
of the native compiler ends the worker, not the server.  A crashed worker is
replaced and the call retried once; a second crash, or a call that does not
finish, fails with a clear message, and later calls work again.
"""

import os
import time

import pytest

import app.praman.services.compile_worker as compile_worker
from app.praman.services.compile_worker import CompilerCrash, run_isolated
from app.praman.services.sva.frontend import FrontendError
from app.praman.services.sva.pipeline import DesignReadError


# Run in the worker (module level, so they can be sent there)

def _crash() -> None:
    os.abort()


def _crash_once(flag: str) -> str:
    if not os.path.exists(flag):
        open(flag, "w").close()
        os.abort()
    return "recovered"


def _reject(kind: str) -> None:
    if kind == "read":
        raise DesignReadError("syntax error, unexpected '#'", "d.sv", 4)
    raise FrontendError("d.sv:2:3: error: unknown module 'sub'")


def test_work_runs_in_another_process():
    assert run_isolated(os.getpid) != os.getpid()


def test_a_crash_is_retried_once(tmp_path):
    assert run_isolated(_crash_once, str(tmp_path / "crashed")) == "recovered"


def test_a_repeated_crash_fails_clearly_and_the_next_call_works():
    with pytest.raises(CompilerCrash, match="crashed while reading the design"):
        run_isolated(_crash)
    assert run_isolated(os.getpid) != os.getpid()


def test_a_worker_that_died_while_idle_is_replaced():
    pid = run_isolated(os.getpid)
    os.kill(pid, 9)                       # e.g. killed by the system between jobs
    time.sleep(0.5)
    assert run_isolated(os.getpid) not in (pid, os.getpid())


def test_design_errors_pass_through_unchanged():
    with pytest.raises(DesignReadError) as read:
        run_isolated(_reject, "read")
    assert (read.value.file, read.value.line) == ("d.sv", 4)
    assert "Testbench-only code" in read.value.hint
    with pytest.raises(FrontendError, match="unknown module 'sub'"):
        run_isolated(_reject, "elaborate")


def test_a_compile_that_does_not_finish_is_stopped(monkeypatch):
    monkeypatch.setattr(compile_worker, "TIMEOUT_SECONDS", 2)
    started = time.monotonic()
    with pytest.raises(CompilerCrash, match="did not finish"):
        run_isolated(time.sleep, 60)
    assert time.monotonic() - started < 30
    assert run_isolated(os.getpid) != os.getpid()
