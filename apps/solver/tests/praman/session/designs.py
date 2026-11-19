"""Small designs shared by the Praman tests."""

PAIR = """module cnt #(parameter W=3)(input clk, input rst_n, input en, output reg [W-1:0] q, output full);
  always @(posedge clk) if (!rst_n) q <= 0; else if (en && !full) q <= q + 1;
  assign full = &q;
endmodule
module pair(input clk, input rst_n, input en_a, input en_b,
            output [2:0] qa, output [2:0] qb, output fa, output fb);
  cnt u_a(.clk(clk), .rst_n(rst_n), .en(en_a), .q(qa), .full(fa));
  cnt u_b(.clk(clk), .rst_n(rst_n), .en(en_b), .q(qb), .full(fb));
endmodule
"""

PAIR_SVA = """module pair_sva(input clk, input rst_n, input en_a, input fa, input [2:0] qa);
  ap_full_stays: assert property (@(posedge clk) disable iff (!rst_n) fa && en_a |=> fa);
  ap_in_range: assert property (@(posedge clk) qa <= 3'd7);
  cp_full: cover property (@(posedge clk) fa);
  ap_bad: assert property (@(posedge clk) disable iff (!rst_n) en_a |=> qa != 3'd5);
  ap_vacuous: assert property (@(posedge clk) disable iff (!rst_n) fa && qa == 3'd0 |-> en_a);
endmodule
bind pair pair_sva i_sva(.*);
"""

PM_TCL = """# the script of the Praman manual
clear -all

analyze -sv pair.sv
analyze -sv pair_sva.sv

elaborate -top pair

clock clk
reset !rst_n

prove -all
"""

# Associativity of a 32-bit multiplication: no engine decides this quickly
HARD = """module hard(input clk, input [31:0] a, input [31:0] b, input [31:0] c);
  wire [31:0] x = (a * b) * c;
  wire [31:0] y = a * (b * c);
  ap_assoc: assert property (@(posedge clk) x == y);
endmodule
"""
