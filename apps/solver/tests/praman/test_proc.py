"""
app/services/proc.run_tree: a tool's children never outlive it.  On a
timeout the whole process group goes (subprocess.run would orphan the
solver under sby or the engine's worker).
"""

import os
import subprocess
import sys
import time

import pytest

from app.praman.services.proc import run_tree

CHILD = "import subprocess, sys, time; p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)']); " \
        "print(p.pid, flush=True); time.sleep(60)"


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # a zombie no one reaps yet counts as gone
    state = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return bool(state) and not state.startswith("Z")


@pytest.mark.skipif(os.name != "posix", reason="process groups")
def test_a_timeout_kills_the_children_too():
    with pytest.raises(subprocess.TimeoutExpired) as info:
        run_tree([sys.executable, "-c", CHILD], timeout=2)
    child = int(info.value.output.split()[0])
    for _ in range(50):
        if not _alive(child):
            break
        time.sleep(0.1)
    assert not _alive(child)


def test_output_and_return_code_as_subprocess_run():
    r = run_tree([sys.executable, "-c", "import sys; print('out'); print('err', file=sys.stderr); sys.exit(3)"], timeout=10)
    assert (r.returncode, r.stdout, r.stderr) == (3, "out\n", "err\n")


def test_run_tree_stops_when_cancelled():
    """A cancel event ends the command (and its children) like a timeout would."""
    import threading
    cancel = threading.Event()
    threading.Timer(0.5, cancel.set).start()
    started = time.time()
    with pytest.raises(subprocess.TimeoutExpired):
        run_tree([sys.executable, "-c", "import time; time.sleep(60)"], timeout=120, cancel=cancel)
    assert time.time() - started < 10


def test_run_tree_with_a_cancel_event_that_is_never_set():
    import threading
    done = run_tree([sys.executable, "-c", "print('ok')"], timeout=60, cancel=threading.Event())
    assert done.returncode == 0 and done.stdout.strip() == "ok"
