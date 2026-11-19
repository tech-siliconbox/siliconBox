//======================================================================
// Company         : Infineon Technologies AG
// Description     : SystemVerilog Assertions for formal verification of
//                   FIFO module
//----------------------------------------------------------------------
// Copyright (c) Infineon Technologies AG, 2022
//======================================================================

module fifo_sva ();

//------------------------------------------ Macros -------------------------------------------

  `define clk_in        fifo.clk
  `define rst_n_in      fifo.rst_n
  `define wr_en_in      fifo.wr_en
  `define rd_en_in      fifo.rd_en
  `define din_in        fifo.din
  `define dout_out      fifo.dout
  `define full_out      fifo.full
  `define empty_out     fifo.empty
  `define count_out     fifo.count

//---------------------------------------- Properties -----------------------------------------

  //===========================================================================================
  // Reset behavior check
  //===========================================================================================
  property p_reset;
    @(posedge `clk_in)
    (!`rst_n_in) |-> (`count_out == 0 && `empty_out && !`full_out && `dout_out == 0);
  endproperty: p_reset

  //===========================================================================================
  // Full flag assertion property
  //===========================================================================================
  property p_full_flag;
    @(posedge `clk_in) disable iff (!`rst_n_in)
    (`count_out == fifo.DEPTH) |-> `full_out;
  endproperty: p_full_flag

  //===========================================================================================
  // Empty flag assertion property
  //===========================================================================================
  property p_empty_flag;
    @(posedge `clk_in) disable iff (!`rst_n_in)
    (`count_out == 0) |-> `empty_out;
  endproperty: p_empty_flag

  //===========================================================================================
  // Write operation property (count increments on write-only)
  //===========================================================================================
  property p_write_inc;
    @(posedge `clk_in) disable iff (!`rst_n_in)
    (`wr_en_in && !`rd_en_in && !`full_out) |=> (`count_out == $past(`count_out) + 1'b1);
  endproperty: p_write_inc

  //===========================================================================================
  // Read operation property (count decrements on read-only)
  //===========================================================================================
  property p_read_dec;
    @(posedge `clk_in) disable iff (!`rst_n_in)
    (`rd_en_in && !`wr_en_in && !`empty_out) |=> (`count_out == $past(`count_out) - 1'b1);
  endproperty: p_read_dec

  //===========================================================================================
  // Simultaneous Read & Write property (count remains unchanged)
  //===========================================================================================
  property p_simultaneous_rw;
    @(posedge `clk_in) disable iff (!`rst_n_in)
    (`wr_en_in && `rd_en_in && !`full_out && !`empty_out) |=> (`count_out == $past(`count_out));
  endproperty: p_simultaneous_rw

  //===========================================================================================
  // Overflow protection property (write when full maintains count)
  //===========================================================================================
  property p_no_overflow;
    @(posedge `clk_in) disable iff (!`rst_n_in)
    (`full_out && `wr_en_in && !`rd_en_in) |=> (`count_out == $past(`count_out));
  endproperty: p_no_overflow

  //===========================================================================================
  // Underflow protection property (read when empty maintains count)
  //===========================================================================================
  property p_no_underflow;
    @(posedge `clk_in) disable iff (!`rst_n_in)
    (`empty_out && `rd_en_in && !`wr_en_in) |=> (`count_out == $past(`count_out));
  endproperty: p_no_underflow
//---------------------------------------------------------------------------------------------

//-------------------------------------- Covers/Witness ---------------------------------------

  wp_full             : cover property (@(posedge `clk_in) disable iff (!`rst_n_in) `full_out);
  wp_empty            : cover property (@(posedge `clk_in) disable iff (!`rst_n_in) `empty_out);
  wp_simultaneous_rw  : cover property (@(posedge `clk_in) disable iff (!`rst_n_in) (`wr_en_in && `rd_en_in));
//---------------------------------------------------------------------------------------------

//---------------------------------------- Assertions -----------------------------------------

  ap_reset            : assert property(p_reset);
  ap_full_flag        : assert property(p_full_flag);
  ap_empty_flag       : assert property(p_empty_flag);
  ap_write_inc        : assert property(p_write_inc);
  ap_read_dec         : assert property(p_read_dec);
  ap_simultaneous_rw  : assert property(p_simultaneous_rw);
  ap_no_overflow      : assert property(p_no_overflow);
  ap_no_underflow     : assert property(p_no_underflow);
//---------------------------------------------------------------------------------------------

//--------------------------------------- Constraints -----------------------------------------

  //cp_reset_sequence : assume property (@(posedge `clk_in) !`rst_n_in ##1 `rst_n_in);
//---------------------------------------------------------------------------------------------

endmodule: fifo_sva

bind fifo fifo_sva inst_fifo_sva(.*);
