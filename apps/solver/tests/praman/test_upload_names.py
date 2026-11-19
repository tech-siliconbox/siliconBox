"""Uploaded files keep their names in messages, but are compiled under a
name Yosys can be given: "dut (1).sv" (a downloaded copy) used to end in
"File `dut' not found"."""

from app.praman.services.design_check import check_design
from app.praman.services.formal_service import SVA_FILENAME
from app.praman.services.sby_generator import sanitize_filename
from app.praman.services.uploads import join_sources
from tests.praman.conftest import requires_yosys
from tests.praman.session.designs import PAIR, PAIR_SVA


def check(design: str, design_name: str):
    return check_design(join_sources([(design_name, design)], sanitize_filename(design_name)),
                        join_sources([("pair_sva (1).sv", PAIR_SVA)], SVA_FILENAME), top="pair")


@requires_yosys
def test_a_design_with_spaces_and_brackets_in_its_name_is_read():
    body = check(PAIR, "pair (1).sv")
    assert body["ok"], body["issues"]
    assert body["stages"]["read"] == "pass" and body["design"]["top"] == "pair"


@requires_yosys
def test_messages_still_name_the_uploaded_file():
    body = check(PAIR.replace("assign full = &q;", "assign full = &nothing;"), "pair (1).sv")
    assert not body["ok"]
    assert any(issue["file"] == "pair (1).sv" and issue["line"] == 3 for issue in body["issues"]), body["issues"]
