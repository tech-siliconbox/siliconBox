////////////////////////////////////////////////////////////////////////////////
//
// ABSTRACT: Error Detection & Correction
//
//      Parameters:
//           synd_sel    - controls checkbit correction vs syndrome
//                           emission selection when gen input is not
//                           active (0 => correct check bits
//                           1 => pass syndrome to chkout)
//
//      Ports:
//           gen         - generate versus check mode control input
//                           (1 => generate check bits from datain
//                           0 => check validity of check bits on chkin
//                           with respect to data on datain and indicate
//                           the presence of errors on err_detect & err_multpl)
//           correct_n   - control signal indicating whether or not to correct
//           datain      - input data
//           chkin       - input check bits
//           err_detect  - flag indicating occurance of error
//           err_multpl  - flag indicating multibit (i.e. uncorrectable) error
//           dataout     - output data
//           chkout      - output check bits
//
//-----------------------------------------------------------------------------

module ecc (gen, correct_n, datain, chkin, err_detect, err_multpl, dataout, chkout);

//------------------------------ Ports ---------------------------------

  parameter integer synd_sel = 0;

  input gen;              // checkbit generation control input (active high)
  input correct_n;        // correct error control input (active low)
  input [31:0] datain;    // data input bus (generating, checking & correcting)
  input [6:0] chkin;      // checkbit input bus (checking & correcting)

  output err_detect;      // error detection output flag (active high)
  output err_multpl;      // multiple bit error detection output (active high)
  output [31:0] dataout;  // data output bus (generating, checking & correcting)
  output [6:0] chkout;    // checkbit output bus (generating & scrubbing)

  reg [38:0] enc_s;
  reg [38:0] dec_s;
  reg [6:0] syn_s;
  reg [38:0] loc_s;
  reg err_s;
  reg dbl_s;

  logic [38:0] codeword_s;

//---------------------------- Core Logic ------------------------------

  assign dataout = gen ? enc_s[31:0]  : !correct_n ? dec_s[31:0]  : enc_s[31:0];
  assign chkout  = gen ? enc_s[38:32] : !correct_n ? dec_s[38:32] : synd_sel ? syn_s : chkin;

  assign err_detect = gen ? 1'b0 : err_s;
  assign err_multpl = gen ? 1'b0 : dbl_s;

  assign codeword_s = {chkin,datain};

  always @(*) begin
    enc_s[31:0] <= datain[31:0];
    enc_s[32]   <= datain[0] ^ datain[1] ^ datain[2] ^ datain[3] ^ datain[4] ^ datain[5] ^ datain[6] ^ datain[7] ^ datain[8] ^ datain[13] ^ datain[17] ^ datain[26] ^ datain[27] ^ datain[29];
    enc_s[33]   <= datain[0] ^ datain[1] ^ datain[2] ^ datain[3] ^ datain[4] ^ datain[12] ^ datain[16] ^ datain[18] ^ datain[21] ^ datain[22] ^ datain[23] ^ datain[24] ^ datain[25] ^ datain[28];
    enc_s[34]   <= datain[0] ^ datain[5] ^ datain[6] ^ datain[7] ^ datain[8] ^ datain[11] ^ datain[15] ^ datain[18] ^ datain[19] ^ datain[21] ^ datain[22] ^ datain[30] ^ datain[31];
    enc_s[35]   <= datain[1] ^ datain[5] ^ datain[10] ^ datain[14] ^ datain[18] ^ datain[19] ^ datain[20] ^ datain[23] ^ datain[24] ^ datain[26] ^ datain[27] ^ datain[28] ^ datain[29] ^ datain[30];
    enc_s[36]   <= datain[2] ^ datain[6] ^ datain[9] ^ datain[14] ^ datain[15] ^ datain[16] ^ datain[17] ^ datain[19] ^ datain[20] ^ datain[21] ^ datain[23] ^ datain[25] ^ datain[29] ^ datain[31];
    enc_s[37]   <= datain[3] ^ datain[7] ^ datain[9] ^ datain[10] ^ datain[11] ^ datain[12] ^ datain[13] ^ datain[20] ^ datain[22] ^ datain[24] ^ datain[25] ^ datain[27] ^ datain[31];
    enc_s[38]   <= datain[4] ^ datain[8] ^ datain[9] ^ datain[10] ^ datain[11] ^ datain[12] ^ datain[13] ^ datain[14] ^ datain[15] ^ datain[16] ^ datain[17] ^ datain[26] ^ datain[28] ^ datain[30];
  end

  always @(*) begin
    case (syn_s)
      7'b0000111: loc_s <= 39'h00_0000_0001;
      7'b0001011: loc_s <= 39'h00_0000_0002;
      7'b0010011: loc_s <= 39'h00_0000_0004;
      7'b0100011: loc_s <= 39'h00_0000_0008;
      7'b1000011: loc_s <= 39'h00_0000_0010;
      7'b0001101: loc_s <= 39'h00_0000_0020;
      7'b0010101: loc_s <= 39'h00_0000_0040;
      7'b0100101: loc_s <= 39'h00_0000_0080;
      7'b1000101: loc_s <= 39'h00_0000_0100;
      7'b1110000: loc_s <= 39'h00_0000_0200;
      7'b1101000: loc_s <= 39'h00_0000_0400;
      7'b1100100: loc_s <= 39'h00_0000_0800;
      7'b1100010: loc_s <= 39'h00_0000_1000;
      7'b1100001: loc_s <= 39'h00_0000_2000;
      7'b1011000: loc_s <= 39'h00_0000_4000;
      7'b1010100: loc_s <= 39'h00_0000_8000;
      7'b1010010: loc_s <= 39'h00_0001_0000;
      7'b1010001: loc_s <= 39'h00_0002_0000;
      7'b0001110: loc_s <= 39'h00_0004_0000;
      7'b0011100: loc_s <= 39'h00_0008_0000;
      7'b0111000: loc_s <= 39'h00_0010_0000;
      7'b0010110: loc_s <= 39'h00_0020_0000;
      7'b0100110: loc_s <= 39'h00_0040_0000;
      7'b0011010: loc_s <= 39'h00_0080_0000;
      7'b0101010: loc_s <= 39'h00_0100_0000;
      7'b0110010: loc_s <= 39'h00_0200_0000;
      7'b1001001: loc_s <= 39'h00_0400_0000;
      7'b0101001: loc_s <= 39'h00_0800_0000;
      7'b1001010: loc_s <= 39'h00_1000_0000;
      7'b0011001: loc_s <= 39'h00_2000_0000;
      7'b1001100: loc_s <= 39'h00_4000_0000;
      7'b0110100: loc_s <= 39'h00_8000_0000;
      7'b0000001: loc_s <= 39'h01_0000_0000;
      7'b0000010: loc_s <= 39'h02_0000_0000;
      7'b0000100: loc_s <= 39'h04_0000_0000;
      7'b0001000: loc_s <= 39'h08_0000_0000;
      7'b0010000: loc_s <= 39'h10_0000_0000;
      7'b0100000: loc_s <= 39'h20_0000_0000;
      7'b1000000: loc_s <= 39'h40_0000_0000;
      default:    loc_s <= 0;
    endcase
    dec_s <= loc_s ^ codeword_s;
  end

  always @(*) begin
    syn_s[0] <= datain[0] ^ datain[1] ^ datain[2] ^ datain[3] ^ datain[4] ^ datain[5] ^ datain[6] ^ datain[7] ^ datain[8] ^ datain[13] ^ datain[17] ^ datain[26] ^ datain[27] ^ datain[29] ^ chkin[0];
    syn_s[1] <= datain[0] ^ datain[1] ^ datain[2] ^ datain[3] ^ datain[4] ^ datain[12] ^ datain[16] ^ datain[18] ^ datain[21] ^ datain[22] ^ datain[23] ^ datain[24] ^ datain[25] ^ datain[28] ^ chkin[1];
    syn_s[2] <= datain[0] ^ datain[5] ^ datain[6] ^ datain[7] ^ datain[8] ^ datain[11] ^ datain[15] ^ datain[18] ^ datain[19] ^ datain[21] ^ datain[22] ^ datain[30] ^ datain[31] ^ chkin[2];
    syn_s[3] <= datain[1] ^ datain[5] ^ datain[10] ^ datain[14] ^ datain[18] ^ datain[19] ^ datain[20] ^ datain[23] ^ datain[24] ^ datain[26] ^ datain[27] ^ datain[28] ^ datain[29] ^ datain[30] ^ chkin[3];
    syn_s[4] <= datain[2] ^ datain[6] ^ datain[9] ^ datain[14] ^ datain[15] ^ datain[16] ^ datain[17] ^ datain[19] ^ datain[20] ^ datain[21] ^ datain[23] ^ datain[25] ^ datain[29] ^ datain[31] ^ chkin[4];
    syn_s[5] <= datain[3] ^ datain[7] ^ datain[9] ^ datain[10] ^ datain[11] ^ datain[12] ^ datain[13] ^ datain[20] ^ datain[22] ^ datain[24] ^ datain[25] ^ datain[27] ^ datain[31] ^ chkin[5];
    syn_s[6] <= datain[4] ^ datain[8] ^ datain[9] ^ datain[10] ^ datain[11] ^ datain[12] ^ datain[13] ^ datain[14] ^ datain[15] ^ datain[16] ^ datain[17] ^ datain[26] ^ datain[28] ^ datain[30] ^ chkin[6];

    err_s <= |syn_s;
    dbl_s <= ~^syn_s & err_s;
  end

endmodule
