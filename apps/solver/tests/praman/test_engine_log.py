"""Live solver output (app/services/engine_log.py): the lines of an sby log
worth showing, and following a log while sby writes it."""

import threading
import time

import pytest

from app.praman.services import engine_log
from app.praman.services.engine_log import condense, follow_run

P = "SBY 22:19:23 [/work/p__01_ap_x_prove/p__01_ap_x_prove_prove] "


@pytest.mark.parametrize("line, kept", [
    (P + "engine_0: abc pdr", ("engine_0", "abc pdr", False)),
    (P + "engine_1: smtbmc yices", ("engine_1", "smtbmc yices", False)),
    (P + "engine_1.basecase: ##   0:00:00  Checking assertions in step 7..", ("engine_1.basecase", "step 7", True)),
    (P + "engine_1.induction: ##   0:00:03  Trying induction in step 11..",
     ("engine_1.induction", "induction step 11", True)),
    (P + "engine_1.induction: ##   0:00:00  Temporal induction successful.",
     ("engine_1.induction", "induction successful", False)),
    (P + "engine_0: 3 : 0 2 1 3 ~5                                       2    10      0.01 sec  CEX =   0",
     ("engine_0", "frame 3", True)),
    (P + "engine_0: Properties:  All = 3. Proved = 3. Disproved = 0. Undecided = 0.   Time =     0.01 sec",
     ("engine_0", "3 of 3 proved, 0 disproved, 0 undecided", False)),
    (P + "engine_0: ##   0:00:01  Assert failed in pair.__va_mon: ap_bad", ("engine_0", "ap_bad failed", False)),
    (P + "engine_0: ##   0:00:00  Reached cover statement in step 3 at pair.__va_mon: ap_bad__pre",
     ("engine_0", "ap_bad__pre reached in step 3", False)),
    (P + "engine_0: ##   0:00:00  Unreached cover statement at pair.__va_mon: ap_x__wit", ("engine_0", "ap_x__wit not reached", False)),
    (P + "engine_0: ##   0:00:00  Status: passed", ("engine_0", "status: passed", False)),
    (P + "summary: engine_0 (abc --keep-going pdr) returned PASS", ("engine_0", "abc --keep-going pdr returned PASS", False)),
    (P + "DONE (PASS, rc=0)", ("", "done: PASS", False)),
    (P + "summary: engine_1 (smtbmc yices) returned pass for induction",
     ("engine_1", "smtbmc yices returned pass for induction", False)),
])
def test_lines_worth_showing(line, kept):
    assert condense(line) == kept


@pytest.mark.parametrize("line", [
    P + 'engine_0: starting process "cd /work && abc ..."',
    P + "engine_1.basecase: ##   0:00:00  Checking assumptions in step 3..",
    P + "aig: Warning: Treating undriven bit pair.\\clk like $anyseq.",
    P + "engine_0: SAT solving =     0.00 sec ( 14.00 %)",
    P + "engine_0: Proved output 2 in frame 1.",
    P + "summary: Elapsed clock time [H:MM:SS (secs)]: 0:00:00 (0)",
    P + "Removing directory '/work/x'.",
    P + "prep: finished (returncode=0)",
    P + "engine_0: ##   0:00:01  BMC failed!",
])
def test_noise_is_left_out(line):
    assert condense(line) is None


def test_a_log_is_followed_while_it_is_written(tmp_path, monkeypatch):
    monkeypatch.setattr(engine_log, "LOOK_EVERY", 0.05)
    monkeypatch.setattr(engine_log, "PROGRESS_EVERY", 60.0)
    log = tmp_path / "run_prove" / "logfile.txt"
    log.parent.mkdir()
    got, stop = [], threading.Event()
    thread = threading.Thread(target=follow_run, args=(tmp_path, lambda t, p: got.append((t, p)), stop))
    thread.start()
    with open(log, "w") as f:
        f.write(P + "engine_0: smtbmc boolector\n")
        f.write(P + "engine_0: ##   0:00:00  Checking assertions in step 0..\n")
        f.flush()
        time.sleep(0.3)
        assert got == [("engine_0: smtbmc boolector", False), ("engine_0: step 0", True)], "shown as they come"
        for step in range(1, 30):                      # within PROGRESS_EVERY: held back
            f.write(P + f"engine_0: ##   0:00:00  Checking assertions in step {step}..\n")
        f.write(P + "engine_0: ##   0:00:01  Status: pa")  # half a line
        f.flush()
        time.sleep(0.3)
        assert len(got) == 2
        f.write("ssed\n" + P + "DONE (PASS, rc=0)\n")
    stop.set()
    thread.join(5)
    assert got[2:] == [("engine_0: step 29", True), ("engine_0: status: passed", False), ("done: PASS", False)], \
        "where it got to, then the result"


def test_progress_that_did_not_move_is_not_repeated(tmp_path, monkeypatch):
    monkeypatch.setattr(engine_log, "LOOK_EVERY", 0.02)
    monkeypatch.setattr(engine_log, "PROGRESS_EVERY", 0.0)
    log = tmp_path / "run_prove" / "logfile.txt"
    log.parent.mkdir()
    frame = P + "engine_0: 1 : 0 2                                  1     2      0.00 sec  CEX =   0\n"
    log.write_text(frame * 3 + frame.replace(": 1 :", ": 2 :"))
    got, stop = [], threading.Event()
    stop.set()
    follow_run(tmp_path, lambda t, p: got.append(t), stop)
    assert got == ["engine_0: frame 1", "engine_0: frame 2"]


def test_a_morning_time_is_read_too():
    """sby pads an hour below 10 with a space."""
    assert condense("SBY  1:25:53 [/work/p__bmc000/p__bmc000_bmc] engine_0: smtbmc yices") == \
        ("engine_0", "smtbmc yices", False)
    assert condense("SBY  9:05:01 [/work/x] DONE (PASS, rc=0)") == ("", "done: PASS", False)
