import 'server-only';

/**
 * Praman's example design: a FIFO whose count has no full guard, with properties that catch it
 * (from formal-verify's "Load Example Files"). Loaded into a session on the server, so the page
 * itself carries no design text.
 */
export const EXAMPLE_FILES: Readonly<Record<string, string>> = {
  'fifo.sv': `module fifo (input clk, input rst_n,
             input push, input pop,
             output reg full, output reg empty);
  reg [2:0] count;
  always @(posedge clk)
    if (!rst_n) count <= 0;
    else        count <= count + push - pop;  // no full guard
  always @(*) begin
    full  = count == 4;
    empty = count == 0;
  end
endmodule
`,
  'fifo_sva.sv': `module fifo_sva ();
  // a push while full must not overflow
  a_no_overflow : assert property (@(posedge fifo.clk)
      disable iff (!fifo.rst_n)
      fifo.full && fifo.push |=> fifo.full);

  // the FIFO can actually fill up
  c_full : cover property (@(posedge fifo.clk) fifo.full);

  // full and empty are never set together
  a_flags : assert property (@(posedge fifo.clk) !(fifo.full && fifo.empty));
endmodule

bind fifo fifo_sva u (.*);
`,
};
