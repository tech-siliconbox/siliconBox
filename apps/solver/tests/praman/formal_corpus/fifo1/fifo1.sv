////////////////////////////////////////////////////////////////////////////////
//
// ABSTRACT: First-In First-Out (FIFO) Buffer
//
//      Parameters:
//           DEPTH      - Storage depth of FIFO (default: 8)
//           DATA_WIDTH - Data width in bits (default: 32)
//
//      Ports:
//           clk        - Clock signal
//           rst_n      - Asynchronous active-low reset
//           wr_en      - Write enable signal
//           rd_en      - Read enable signal
//           din        - Input data bus
//           dout       - Output data bus
//           full       - FIFO full status flag
//           empty      - FIFO empty status flag
//           count      - Number of elements currently stored in FIFO
//
//-----------------------------------------------------------------------------

module fifo (clk, rst_n, wr_en, rd_en, din, dout, full, empty, count);

//------------------------------ Ports & Parameters ----------------------------

  parameter integer DEPTH = 8;
  parameter integer DATA_WIDTH = 32;
  localparam integer PTR_WIDTH = $clog2(DEPTH);

  input clk;
  input rst_n;
  input wr_en;
  input rd_en;
  input [DATA_WIDTH-1:0] din;

  output reg [DATA_WIDTH-1:0] dout;
  output full;
  output empty;
  output reg [PTR_WIDTH:0] count;

//------------------------------ Internal Signals ------------------------------

  reg [DATA_WIDTH-1:0] mem [0:DEPTH-1];
  reg [PTR_WIDTH-1:0] wr_ptr;
  reg [PTR_WIDTH-1:0] rd_ptr;

//---------------------------- Status Flags -----------------------------------

  assign full  = (count == DEPTH);
  assign empty = (count == 0);

//---------------------------- Core FIFO Logic --------------------------------

  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      wr_ptr <= '0;
      rd_ptr <= '0;
      count  <= '0;
      dout   <= '0;
    end else begin
      case ({wr_en && !full, rd_en && !empty})
        2'b10: begin // Write only
          mem[wr_ptr] <= din;
          wr_ptr      <= (wr_ptr == DEPTH - 1) ? '0 : wr_ptr + 1'b1;
          count       <= count + 1'b1;
        end
        2'b01: begin // Read only
          dout   <= mem[rd_ptr];
          rd_ptr <= (rd_ptr == DEPTH - 1) ? '0 : rd_ptr + 1'b1;
          count  <= count - 1'b1;
        end
        2'b11: begin // Read and Write simultaneously
          mem[wr_ptr] <= din;
          dout        <= mem[rd_ptr];
          wr_ptr      <= (wr_ptr == DEPTH - 1) ? '0 : wr_ptr + 1'b1;
          rd_ptr      <= (rd_ptr == DEPTH - 1) ? '0 : rd_ptr + 1'b1;
          // count remains unchanged
        end
        default: ; // No operation or invalid operation
      endcase
    end
  end

endmodule
