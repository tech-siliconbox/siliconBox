module fifo_sva ();

//------------------------------------------ Macros -------------------------------------------

  `define clk_in       fifo.clk
  `define rst_n_in     fifo.rstn
  `define wr_en_in     fifo.wr_en
  `define wr_data_in   fifo.din
  `define rd_en_in     fifo.rd_en
  `define rd_data_out  fifo.dout
  `define full_out     fifo.full
  `define empty_out    fifo.empty

//---------------------------------------- Properties -----------------------------------------

  //===========================================================================================
  // FIFO is full
  //===========================================================================================
  property fifo_full;
    (1
  |->
    (`full_out) );
  endproperty: fifo_full

  //===========================================================================================
  // FIFO is empty
  //===========================================================================================
  property fifo_empty;
    (1
  |->
    (`empty_out) );
  endproperty: fifo_empty

  //===========================================================================================
  // FIFO is not both full and empty
  //===========================================================================================
  property fifo_not_full_empty;
    (1
  |->
    ($onehot0({`full_out,`empty_out})) );
  endproperty: fifo_not_full_empty

  //===========================================================================================
  // If the FIFO is full, no data is written to the FIFO
  //===========================================================================================
  property fifo_full_no_write;
    ( (`full_out)
  |->
    (!`wr_en_in) );
  endproperty: fifo_full_no_write

  //===========================================================================================
  // If the FIFO is empty, no data is read from the FIFO
  //===========================================================================================
  property fifo_empty_no_read;
    ( (`empty_out)
  |->
    (!`rd_en_in) );
  endproperty: fifo_empty_no_read

  //===========================================================================================
  // There is a falling edge on the full output
  //===========================================================================================
  property fifo_full_falling_edge;
    (1
  |->
    ($fell(`full_out)) );
  endproperty: fifo_full_falling_edge

  //===========================================================================================
  // The concatenation of full and empty ({full,empty}) is zero onehot
  //===========================================================================================
  property fifo_onehot0_full_empty;
    (1
  |->
    ($onehot0({`full_out, `empty_out})) );
  endproperty: fifo_onehot0_full_empty

  //===========================================================================================
  // If the FIFO just became full (a rising edge of the full signal), then there was a write in
  // the previous cycle
  //===========================================================================================
  property fifo_full_prev_write;
    ( ($rose(`full_out))
  |->
    ($past(`wr_en_in)) );
  endproperty: fifo_full_prev_write

  //===========================================================================================
  // If the FIFO just became empty, then there was a read, but no write in the previous cycle
  //===========================================================================================
  property fifo_empty_prev_read_no_write;
    ( ($rose(`empty_out))
  |->
    ( ($past(`rd_en_in)) &&
    (!$past(`wr_en_in)) ));
  endproperty: fifo_empty_prev_read_no_write

  //===========================================================================================
  // If there is a write, the FIFO is not empty in the next cycle
  //===========================================================================================
  property fifo_write_not_empty;
    ( (`wr_en_in)
  |->
    ( ##1 !`empty_out) );
  endproperty: fifo_write_not_empty

  //===========================================================================================
  // In the cycle after reset, the FIFO is empty
  //===========================================================================================
  property fifo_empty_after_reset;
    ( ($rose(`rst_n_in))
  |->
    (`empty_out) );
  endproperty: fifo_empty_after_reset

  //===========================================================================================
  // If the read and write enable of the FIFO are equal, the full and empty outputs stay stable
  //===========================================================================================
  property fifo_read_write_equal;
    ( (`rd_en_in == `wr_en_in)
  |->
    ( ##1 $stable(`full_out) &&
    ($stable(`empty_out))) );
  endproperty: fifo_read_write_equal

  //===========================================================================================
  // If there is a write, but no read for 32 consecutive cycles, the FIFO is full in the next
  // cycle
  //===========================================================================================
  property fifo_write_32_full;
    ( ((`wr_en_in && !`rd_en_in) [*32])
  |->
    ( ##1 `full_out) );
  endproperty: fifo_write_32_full

  //===========================================================================================
  // 28 cycles after the FIFO is empty, it is full
  //===========================================================================================
  property fifo_full_after_28;
    ( (`empty_out)
  |->
    ( ##28 `full_out) );
  endproperty: fifo_full_after_28

  //===========================================================================================
  // If the FIFO is empty and data is written, and in the next cycle, data is read, then the
  // read data in the following cycle is the data written to the FIFO two cycles ago
  //===========================================================================================
  property fifo_data_after_empty;
    ( ((`empty_out) &&
    (`wr_en_in) ##1
    (`rd_en_in))
  |->
    ( ##1 (`rd_data_out == $past(`wr_data_in, 2))) );
  endproperty: fifo_data_after_empty

  //===========================================================================================
  // If the FIFO is empty and data is written, and in the next 1 to 4 cycles, no data is read,
  // and in the next cycle, data is read, then the read data in the following cycle is the data
  // written to the FIFO in the beginning
  //===========================================================================================
  property fifo_data_after_empty_1_4;
    reg[7:0] data_start;
    ( (((`empty_out && `wr_en_in), data_start = `wr_data_in) ##1
    (!`rd_en_in) [*1:4] ##1
    (`rd_en_in))
  |->
    ( ##1 (`rd_data_out == data_start)) );
  endproperty: fifo_data_after_empty_1_4
//---------------------------------------------------------------------------------------------

//-------------------------------------- Covers/Witness ---------------------------------------

  wp_fifo_full              : cover property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_full);
  wp_fifo_empty             : cover property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_empty);
  wp_fifo_full_falling_edge : cover property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_full_falling_edge);
  wp_fifo_full_after_28     : cover property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_full_after_28);
//---------------------------------------------------------------------------------------------

//---------------------------------------- Assertions -----------------------------------------

  ap_fifo_not_full_empty           : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_not_full_empty);
  ap_fifo_onehot0_full_empty       : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_onehot0_full_empty);
  ap_fifo_full_prev_write          : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_full_prev_write);
  ap_fifo_empty_prev_read_no_write : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_empty_prev_read_no_write);
  ap_fifo_write_not_empty          : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_write_not_empty);
  ap_fifo_empty_after_reset        : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_empty_after_reset);
  ap_fifo_read_write_equal         : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_read_write_equal);
  ap_fifo_write_32_full            : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_write_32_full);
  ap_fifo_data_after_empty         : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_data_after_empty);
  ap_fifo_data_after_empty_1_4     : assert property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_data_after_empty_1_4);
//---------------------------------------------------------------------------------------------

//--------------------------------------- Constraints -----------------------------------------

  cp_fifo_full_no_write : assume property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_full_no_write);
  cp_fifo_empty_no_read : assume property(@(posedge `clk_in) disable iff (!`rst_n_in) fifo_empty_no_read);
//---------------------------------------------------------------------------------------------

endmodule: fifo_sva

bind fifo fifo_sva inst_fifo_sva(.*);