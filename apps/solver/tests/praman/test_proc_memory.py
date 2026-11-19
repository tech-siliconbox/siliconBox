"""PRAMAN_JOB_MEMORY_MB: the memory a check's tools use is measured (resident memory
of the whole process tree) and the tools are stopped when they use more.  Nothing
limits the address space: that stopped threads from starting, not memory from
being used (every proof failed with "can't start new thread" on a 512 MB server)."""

import os
import subprocess
import sys

import pytest

from app.praman.services import proc

linux = pytest.mark.skipif(not os.path.isdir("/proc"), reason="needs /proc (Linux)")
GROW = ("import time\nblocks = []\nfor _ in range(60):\n    blocks.append(bytearray(8 * 1024 * 1024))\n"
        "    time.sleep(0.05)\ntime.sleep(5)\n")


@linux
def test_the_tools_are_stopped_when_they_use_too_much(monkeypatch):
    monkeypatch.setenv("PRAMAN_JOB_MEMORY_MB", "120")
    monkeypatch.setattr(proc, "MEMORY_LOOK", 0.2)
    # the memory is used by a child of the command, as a solver is under sby
    cmd = [sys.executable, "-c", f"import subprocess, sys; subprocess.run([sys.executable, '-c', {GROW!r}])"]
    with pytest.raises(proc.MemoryLimitExceeded) as e:
        proc.run_tree(cmd, timeout=60)
    assert e.value.used_mb > 120 and e.value.limit_mb == 120


@linux
def test_within_the_limit_nothing_happens_and_threads_start(monkeypatch):
    monkeypatch.setenv("PRAMAN_JOB_MEMORY_MB", "400")
    code = "import threading; ts = [threading.Thread(target=lambda: None) for _ in range(50)]; [t.start() for t in ts]; print('ok')"
    done = proc.run_tree([sys.executable, "-c", code], timeout=60)
    assert done.returncode == 0 and done.stdout.strip() == "ok"


def test_no_limit_unless_asked(monkeypatch):
    monkeypatch.delenv("PRAMAN_JOB_MEMORY_MB", raising=False)
    assert proc.memory_limit_mb() == 0
    monkeypatch.setenv("PRAMAN_JOB_MEMORY_MB", "abc")
    assert proc.memory_limit_mb() == 0


@linux
def test_resident_memory_of_a_tree():
    child = subprocess.Popen([sys.executable, "-c", "import time; x = bytearray(60 * 1024 * 1024); time.sleep(3)"])
    try:
        import time
        time.sleep(1)
        assert proc.tree_rss_mb(os.getpid()) > 60, "the child's memory counts for its parent's tree"
    finally:
        child.kill()
        child.wait()
