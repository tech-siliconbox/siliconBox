import { describe, expect, it } from 'vitest';
import { matchJobDescription } from './job-match';
import { FORMAL_VERIFICATION_KEYWORDS, HARDWARE_KEYWORDS } from './keywords';
import { screenCv } from './rules';

// Invented postings and CV text for tests only.
const POSTING = `Formal Verification Engineer, Invented Silicon
About us
We build RISC-V SoCs for the edge.
Requirements
- SystemVerilog and SVA
- JasperGold or VC Formal
- Python scripting
Nice to have
- UVM
Benefits
- Health insurance and a Linux laptop`;

const CV =
  'Wrote SVA properties in SystemVerilog, proved them with JasperGold, scripted in Python.';

describe('matchJobDescription', () => {
  it('weights requirements, skips the offer part and lists the most wanted gaps first', () => {
    // Asked: six requirement terms (1.5 each) and three from the blurb and title (1 each).
    // The CV shows four requirement terms: 6 of 12.
    expect(matchJobDescription(CV, POSTING)).toEqual({
      score: 50,
      found: ['SystemVerilog', 'SVA', 'Python', 'JasperGold'],
      missing: ['VC Formal', 'UVM', 'Formal verification', 'SoC', 'RISC-V'],
    });
  });

  it('counts a requirement for more than a term from the role overview', () => {
    const posting = `About the role
You will build FPGA prototypes.
Requirements
- Strong UVM experience`;
    expect(matchJobDescription('FPGA bring-up', posting).score).toBe(40);
    expect(matchJobDescription('UVM testbenches', posting).score).toBe(60);
  });

  it('scores 0 with empty lists when the posting names none of our terms', () => {
    const posting = 'We sat with the arm of the business to hire a friendly sales lead.';
    expect(matchJobDescription(CV, posting)).toEqual({ score: 0, found: [], missing: [] });
  });

  it('keeps Questa Formal apart from Questa simulation', () => {
    expect(matchJobDescription('', 'Requirements\n- Questa Formal').missing).toEqual([
      'Questa Formal',
    ]);
  });

  it('gives every term its own label', () => {
    const labels = [...FORMAL_VERIFICATION_KEYWORDS, ...HARDWARE_KEYWORDS].flatMap((group) =>
      group.keywords.map((keyword) => keyword.label),
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('screenCv with a job description', () => {
  it('adds the match without changing the score', () => {
    const plain = screenCv(CV, 1);
    const matched = screenCv(CV, 1, POSTING);
    expect('jobMatch' in plain).toBe(false);
    expect(matched.jobMatch?.score).toBe(50);
    expect({ ...matched, jobMatch: undefined }).toEqual({ ...plain, jobMatch: undefined });
  });
});
