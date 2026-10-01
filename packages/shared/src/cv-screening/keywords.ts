// What formal verification job descriptions commonly ask for, grouped for the report.
// Each keyword has the spellings recruiters' search tools usually match.

export type KeywordGroup = { group: string; keywords: { label: string; pattern: RegExp }[] };

const k = (label: string, pattern: RegExp) => ({ label, pattern });

export const FORMAL_VERIFICATION_KEYWORDS: KeywordGroup[] = [
  {
    group: 'Languages',
    keywords: [
      k('SystemVerilog', /\bsystem\s?verilog\b/i),
      k('SVA', /\bSVA\b|\bsystem\s?verilog assertions?\b/i),
      k('Verilog', /\bverilog\b/i),
      k('VHDL', /\bVHDL\b/i),
      k('Python', /\bpython\b/i),
      k('Tcl', /\btcl\b/i),
    ],
  },
  {
    group: 'Formal methods',
    keywords: [
      k('Formal verification', /\bformal (verification|methods?|property verification)\b|\bFPV\b/i),
      k('Model checking', /\bmodel[- ]checking\b/i),
      k('Equivalence checking', /\b(logic |sequential )?equivalence checking\b|\bLEC\b|\bSEC\b/i),
      k('Bounded model checking', /\bbounded model checking\b|\bBMC\b/i),
      k('k-induction', /\bk[- ]?induction\b/i),
      k('Assertions', /\bassertions?\b/i),
      k('Cover properties', /\bcover (properties|property|points?)\b/i),
      k('Liveness and safety', /\b(liveness|safety) propert(y|ies)\b/i),
      k('Abstraction', /\babstractions?\b|\bcutpoints?\b|\bblack[- ]?box(ing)?\b/i),
    ],
  },
  {
    group: 'Tools',
    keywords: [
      k('JasperGold', /\bjasper ?gold\b|\bjasper\b/i),
      k('VC Formal', /\bVC ?Formal\b/i),
      k('Questa Formal', /\bquesta ?formal\b/i),
      k('SymbiYosys', /\bsymbi ?yosys\b|\bsby\b/i),
      k('Yosys', /\byosys\b/i),
    ],
  },
  {
    group: 'Design and protocols',
    keywords: [
      k('AXI', /\bAXI4?\b/i),
      k('AHB / APB', /\bAHB\b|\bAPB\b/i),
      k('PCIe', /\bPCI[- ]?e(xpress)?\b/i),
      k('Cache coherence', /\bcache coheren(ce|cy)\b/i),
      k('FIFO / arbiter', /\bFIFOs?\b|\barbiters?\b/i),
    ],
  },
  {
    group: 'Verification',
    keywords: [
      k('UVM', /\bUVM\b/i),
      k('Coverage', /\b(functional |code |formal )?coverage\b/i),
      k('Testbench', /\btest ?benches?\b/i),
      k('Debug', /\bdebug(ging)?\b/i),
    ],
  },
];
