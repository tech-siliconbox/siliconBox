import { describe, expect, it } from 'vitest';
import { screenCv } from './rules';

// Invented CVs for tests only.
const STRONG = `Invented Learner
Formal Verification Engineer
learner@example.test | +91 98765 43210 | linkedin.com/in/invented-learner | github.com/invented
Summary
Formal verification engineer writing SystemVerilog Assertions (SVA) and closing proofs with JasperGold and SymbiYosys.
Skills
SystemVerilog, SVA, Verilog, Python, Tcl, model checking, equivalence checking, k-induction, UVM, coverage, AXI, AHB, APB
Experience
Verification Intern, Invented Chips, 2025-01 to Present
• Wrote 42 SVA properties for an AXI4 bridge and proved 38 with JasperGold in 3 weeks.
• Found 5 deadlock bugs in an arbiter using bounded model checking (BMC) to depth 40.
• Reduced proof runtime by 60% with abstraction and cutpoints on the FIFO data path.
• Automated nightly formal regressions in Python, cutting debug time by 30%.
Projects
FIFO formal verification
• Verified a parameterised FIFO with SymbiYosys; proved no overflow with k-induction.
• Achieved 100% cover property hit rate across 24 cover points.
Education
B.Tech Electronics and Communication, Invented Institute of Technology, 2021-08 to 2025-05
${'Additional detail on testbench, liveness and safety properties, cache coherence and PCIe exposure. '.repeat(25)}`;

const WEAK = `My Resume
Name: Invented Person
Date of Birth: 01-01-2000
Marital Status: Single
Father's Name: Invented
I am a hard working person and I want a job. I like electronics and I studied my degree well.`;

describe('screenCv', () => {
  it('scores a strong formal verification CV highly', () => {
    const report = screenCv(STRONG, 2);
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.keywords.found).toEqual(
      expect.arrayContaining(['SVA', 'JasperGold', 'k-induction', 'AXI']),
    );
    expect(report.checks.filter((c) => c.status === 'fail')).toEqual([]);
  });

  it('flags a weak CV with personal details and no sections', () => {
    const report = screenCv(WEAK, 1);
    expect(report.score).toBeLessThan(40);
    const statusOf = (id: string) => report.checks.find((c) => c.id === id)?.status;
    expect(statusOf('personal')).toBe('warn');
    expect(statusOf('skills')).toBe('fail');
    expect(statusOf('pronouns')).toBe('warn');
    expect(statusOf('phone')).toBe('warn'); // the date of birth is not a phone number
    expect(statusOf('bullets')).toBe('fail');
  });

  it('caps the score of a CV whose text cannot be read, like a scanned image', () => {
    const report = screenCv('', 1);
    expect(report.score).toBeLessThanOrEqual(20);
    expect(report.checks.find((c) => c.id === 'text')?.status).toBe('fail');
  });

  it('marks a short but readable CV as short, not unreadable', () => {
    const report = screenCv(WEAK, 1);
    expect(report.checks.find((c) => c.id === 'text')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'words')?.status).toBe('fail');
  });

  it('warns about more than two pages', () => {
    expect(screenCv(STRONG, 3).checks.find((c) => c.id === 'pages')?.status).toBe('warn');
  });

  it('reports every category with a score from 0 to 100', () => {
    const { categories } = screenCv(STRONG, 2);
    expect(categories.map((c) => c.id)).toEqual([
      'readable',
      'contact',
      'structure',
      'length',
      'impact',
      'keywords',
    ]);
    for (const category of categories) expect(category.score).toBeGreaterThanOrEqual(0);
  });
});
