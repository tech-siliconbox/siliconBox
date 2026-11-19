//======================================================================
// Company         : Infineon Technologies AG
// Description     : SystemVerilog Assertions for formal verication of
//                   ECC module
//----------------------------------------------------------------------
// Copyright (c) Infineon Technologies AG, 2022
//======================================================================

module ecc_sva ();

//------------------------------------------ Macros -------------------------------------------

  `define gen_in          ecc.gen
  //`define correct_n_in    ecc.correct_n
  `define data_in         ecc.datain
  //`define chk_in          ecc.chkin
  //`define alarm_out       ecc.alarm
  //`define err_detect_out  ecc.err_detect
  //`define err_multpl_out  ecc.err_multpl
  `define data_out        ecc.dataout
  //`define chk_out         ecc.chkout

//---------------------------------------- Properties -----------------------------------------

  //===========================================================================================
  // Example 1 property description
  //===========================================================================================
  property example1;
    ( (`gen_in)
  |->
    (`data_out == `data_in) );
  endproperty: example1

  //===========================================================================================
  // Example 2 property description
  //===========================================================================================
  property example2;
    ( (!`gen_in)
  |->
    (`data_out != `data_in) );
  endproperty: example2
//---------------------------------------------------------------------------------------------

//-------------------------------------- Covers/Witness ---------------------------------------

  wp_example1 : cover property(example1);
  wp_example2 : cover property(example2);
//---------------------------------------------------------------------------------------------

//---------------------------------------- Assertions -----------------------------------------

  ap_example1 : assert property(example1);
  ap_example2 : assert property(example2);
//---------------------------------------------------------------------------------------------

//--------------------------------------- Constraints -----------------------------------------

  //cp_example1 : assume property(example1);
  //cp_example2 : assume property(example2);
//---------------------------------------------------------------------------------------------

endmodule: ecc_sva

bind ecc ecc_sva inst_ecc_sva(.*);
