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

// Wider hardware terms that verification job descriptions also ask for. They count only in a
// match against a job description, so the CV score above keeps its meaning.
export const HARDWARE_KEYWORDS: KeywordGroup[] = [
  {
    group: 'Hardware design',
    keywords: [
      k('RTL', /\bRTL\b/i),
      k('ASIC', /\bASICs?\b/i),
      k('FPGA', /\bFPGAs?\b/i),
      k('SoC', /\bSoCs?\b|\bsystems?[- ]on[- ](a[- ])?chip\b/i),
      k('CDC', /\bCDC\b|\bclock[- ]domain[- ]crossings?\b/i),
      k('RDC', /\bRDC\b|\breset[- ]domain[- ]crossings?\b/i),
      k('Low power (UPF)', /\bUPF\b|\blow[- ]power\b/i),
      k('Synthesis', /\bsynthesis\b/i),
      k('Static timing analysis', /\bSTA\b|\bstatic timing\b/i),
      k('Lint', /\blint(ing)?\b/i),
    ],
  },
  {
    group: 'Architecture and protocols',
    keywords: [
      k('RISC-V', /\bRISC[- ]?V\b/i),
      // Case-sensitive: "arm" is also an everyday word.
      k('Arm', /\b(ARM|Arm)\b/),
      k('CPU and microarchitecture', /\bCPUs?\b|\bprocessors?\b|\bmicro-?architectures?\b/i),
      k('Interconnect / NoC', /\bNoCs?\b|\binterconnects?\b|\bnetwork[- ]on[- ]chip\b/i),
      k('CHI / ACE', /\b(CHI|ACE)(-?Lite)?\b/),
      k('DDR / memory controller', /\b(LP)?DDR\d?\b|\bmemory controllers?\b/i),
      k('Ethernet', /\bethernet\b/i),
      k('USB', /\bUSB\b/i),
    ],
  },
  {
    group: 'Simulation and tools',
    keywords: [
      k('Simulation', /\bsimulations?\b/i),
      k('Constrained random', /\bconstrained[- ]random\b/i),
      k('Regressions', /\bregressions?\b/i),
      k('VCS', /\bVCS\b/),
      k('Xcelium', /\bxcelium\b/i),
      // "Questa Formal" is its own formal tool above.
      k('Questa', /\bquesta(sim)?\b(?![- ]?formal)/i),
      k('Verdi', /\bverdi\b/i),
      k('SpyGlass', /\bspy ?glass\b/i),
    ],
  },
  {
    group: 'Programming',
    keywords: [
      k('C++', /\bC\+\+/),
      k('SystemC', /\bSystemC\b/i),
      k('Perl', /\bperl\b/i),
      k('Shell scripting', /\b(shell|bash|csh|tcsh)\b/i),
      k('Linux', /\blinux\b|\bunix\b/i),
      k('Git', /\bgit\b/i),
    ],
  },
  {
    group: 'Methods',
    keywords: [
      k('Verification plans', /\b(verification|test|formal) plans?\b|\bvplans?\b/i),
      k('Sign-off', /\bsign[- ]?off\b/i),
      k('Deadlock and livelock', /\b(dead|live)locks?\b/i),
      // Case-sensitive: "sat" is also an everyday word.
      k('SAT / SMT solvers', /\b(SAT|SMT)\b/),
      k('Theorem proving', /\btheorem prov(ing|ers?)\b/i),
    ],
  },
];
