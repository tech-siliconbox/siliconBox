"""SV preprocessor (app/services/sv_preprocessor.py): rewrites for Yosys's own reader."""

from app.praman.services.sv_preprocessor import preprocess


def test_packed_2d_arrays_become_unpacked_for_every_name_of_a_list():
    assert preprocess("logic [3:0][1:0] a;") == "logic [1:0] a [0:3];"
    # PULP's UART declares two at once: both must change, or `regs_n = regs_q` no longer type-checks
    assert preprocess("logic [9:0][7:0]  regs_q, regs_n;") == "logic [7:0] regs_q [0:9], regs_n [0:9];"
    assert preprocess("logic [7:0] plain, other;") == "logic [7:0] plain, other;"
