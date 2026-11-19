"""The Tcl interpreter of a session (app/praman/tclhost.py, host.tcl): real
Tcl in a safe interpreter, Praman commands called back in Python."""

import time

import pytest

from app.praman.tclhost import CommandError, ExitRequested, TclError, TclHost, tcl_list, tcl_split, tclsh_path

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")


@pytest.fixture
def host():
    h = TclHost(["analyze", "elaborate", "prove", "fail", "exit", "glob", "__read", "slow"])
    yield h
    h.close()


class Recorder:
    def __init__(self, files=None):
        self.calls, self.out, self.echo, self.files = [], [], [], files or {}

    def call(self, name, args):
        self.calls.append((name, args))
        if name == "__read":
            return self.files[args[0]]
        if name == "fail":
            raise CommandError("no such design")
        if name == "exit":
            raise ExitRequested("exit")
        if name == "glob":
            return tcl_list(["a b.sv", "c.sv"])
        if name == "slow":
            time.sleep(1.5)
        return f"<{name}>"

    def run(self, host, script):
        return host.evaluate(script, self.call, lambda text, nl: self.out.append(text),
                             lambda depth, text: self.echo.append((depth, text)))


def test_tcl_substitutes_before_a_command_is_called(host):
    r = Recorder()
    assert r.run(host, "set top fifo; elaborate -top $top; expr {1 + 2}") == "3"
    assert r.calls == [("elaborate", ["-top", "fifo"])]


def test_braces_arrive_as_one_argument(host):
    r = Recorder()
    r.run(host, "prove -property {a.b c.d} -bg")
    assert r.calls == [("prove", ["-property", "a.b c.d", "-bg"])]
    assert tcl_split(r.calls[0][1][1]) == ["a.b", "c.d"]


def test_source_echoes_each_command_and_prints_results(host):
    script = "# setup\nset n 2\nanalyze -sv \\\n   a.sv b.sv\nif {$n > 1} {\n  elaborate -top t\n}\n"
    r = Recorder({"pm.tcl": script})
    r.run(host, "source pm.tcl")
    assert [text.split("\n")[0] for _, text in r.echo] == ["# setup", "set n 2", "analyze -sv \\", "if {$n > 1} {"]
    assert all(depth == 1 for depth, _ in r.echo)
    assert ("analyze", ["-sv", "a.sv", "b.sv"]) in r.calls and ("elaborate", ["-top", "t"]) in r.calls
    assert r.out == ["2", "<analyze>", "<elaborate>"]


def test_an_error_stops_a_sourced_script_with_file_and_line(host):
    r = Recorder({"pm.tcl": "analyze a.sv\nfail\nprove -all\n"})
    with pytest.raises(TclError) as e:
        r.run(host, "source pm.tcl")
    assert "no such design" in str(e.value) and '(file "pm.tcl" line 2)' in str(e.value)
    assert ("prove", ["-all"]) not in r.calls


def test_exit_stops_the_script(host):
    r = Recorder({"pm.tcl": "analyze a.sv\nexit\nprove -all\n"})
    with pytest.raises(ExitRequested):
        r.run(host, "source pm.tcl")
    assert [name for name, _ in r.calls] == ["__read", "analyze", "exit"]


@pytest.mark.parametrize("script", ["exec ls", "open /etc/passwd", "socket localhost 80", "cd /",
                                    "file delete x", "load x", "pwd"])
def test_scripts_cannot_reach_the_server(host, script):
    with pytest.raises(TclError):
        Recorder().run(host, script)


def test_state_is_kept_between_evaluations(host):
    r = Recorder()
    r.run(host, "proc twice {x} { return [expr {$x * 2}] }; set v 21")
    assert r.run(host, "twice $v") == "42"


def test_a_command_result_is_a_tcl_list(host):
    assert Recorder().run(host, "llength [glob *.sv]") == "2"
    assert Recorder().run(host, "lindex [glob *.sv] 0") == "a b.sv"


def test_puts_goes_to_the_log(host):
    r = Recorder()
    r.run(host, 'puts "hello"; puts -nonewline stderr x')
    assert r.out == ["hello", "x"]


def test_an_endless_loop_is_stopped_but_a_long_command_is_not(monkeypatch):
    monkeypatch.setenv("PRAMAN_TCL_BUDGET", "1")
    h = TclHost(["slow"])
    try:
        r = Recorder()
        assert r.run(h, "slow; expr {6 * 7}") == "42"          # 1.5 s inside a command: not counted
        with pytest.raises(TclError, match="time limit"):
            r.run(h, "while 1 {}")
        assert r.run(h, "expr {1 + 1}") == "2"                 # the interpreter is usable again
    finally:
        h.close()


def test_tcl_list_quotes_what_needs_quoting():
    assert tcl_split(tcl_list(["a.b", "x y", "", "p{q", "$v [z]"])) == ["a.b", "x y", "", "p{q", "$v [z]"]
