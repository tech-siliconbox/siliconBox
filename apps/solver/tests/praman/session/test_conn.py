"""Connectivity (check_conn, as JasperGold's CONN app): a spreadsheet of
connections becomes assertions."""

import pytest

from app.praman import conn
from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby
from tests.praman.session.conftest import run
from tests.praman.test_sva_hierarchy import DUT

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")

CSV = """name,source,destination,condition,latency
# the pipeline: in -> s0 -> s1 -> out
c_mid,in,s0.q,,1
c_out,pipe.in,out,,2
c_bad,in,out,,1
c_same,mid,s1.d,,0
,in,nope,,0
"""


def test_rows_become_expressions():
    rows = conn.parse("src\tdst\tcond\tdelay\nu_a.q\tqa\ten\t0\nb\tc\t\t3\n", "top")
    assert [r["expr"] for r in rows] == ["(en) |-> qa == u_a.q", "1'b1 |-> ##3 c == $past(b, 3)"]
    assert rows[1]["what"] == "b -> c after 3"
    assert [r["expr"] for r in conn.parse("x,y\n", "top")] == ["y == x"], "no header: name, source, destination ..."
    for bad in ("a,b,c,d,soon\n", "a,b c,d\n", "", "a,,,\n"):
        with pytest.raises(conn.ConnError):
            conn.parse(bad, "top")
    assert conn.unique_name("c-1", {"c_1"}) == "conn_1" and conn.unique_name("ok", set()) == "ok"


@requires_sby
def test_a_spreadsheet_is_loaded_and_proven(session):
    session.files["pipe.sv"] = DUT
    session.files["conn.csv"] = CSV
    run(session, "analyze -sv pipe.sv", "elaborate -top pipe", "clock clk", "reset !rst_n",
        "check_conn -load conn.csv", "prove -all")
    status = {p.id: p.status for p in session.props.values()}
    assert status == {"c_mid": "proven", "c_out": "proven", "c_bad": "cex", "c_same": "proven"}
    assert session.props["c_out"].file == "Tcl" and session.props["c_out"].expr == "conn: in -> out after 2"
    errors = [e["text"] for e in session.events if e["kind"] == "error"]
    assert any(t.startswith("conn.csv(7): the connection in -> nope cannot be checked") for t in errors), errors
    assert any("4 of 5 connections from conn.csv added" in e["text"] for e in session.events)
    assert session.commands.call("check_conn", ["-list"]) == "pipe.c_mid pipe.c_out pipe.c_bad pipe.c_same"
