import { describe, expect, it } from 'vitest';
import { REDACTED, cvPassages, redactCv } from './redact';

// An invented CV for tests only.
const CV = `Invented Learner
learner@example.test | +91 98765 43210 | linkedin.com/in/invented-learner | https://github.com/invented
Date of Birth: 01-01-2000
Skills
SystemVerilog, SVA, JasperGold
Experience
• Wrote 42 SVA properties for an AXI4 bridge and proved 38 of them with JasperGold.
• Learner and mentor for two interns on formal sign-off at Invented Chips.`;

describe('redactCv', () => {
  const redacted = redactCv(CV, 'Invented Learner');

  it('removes the name, contact details, links and personal details', () => {
    for (const personal of [
      'Invented Learner',
      'learner@example.test',
      '98765 43210',
      'linkedin.com',
      'github.com',
      '01-01-2000',
    ]) {
      expect(redacted).not.toContain(personal);
    }
    expect(redacted.split('\n')[0]).toBe(REDACTED.name);
    expect(redacted).toContain(REDACTED.personal);
  });

  it('removes each part of the name as a whole word, in any case', () => {
    expect(redacted).toContain(`• ${REDACTED.name} and mentor`);
    expect(redacted).toContain(`${REDACTED.name} Chips`);
  });

  it('keeps the work, numbers included', () => {
    expect(redacted).toContain('Wrote 42 SVA properties for an AXI4 bridge and proved 38');
    expect(redacted).toContain('SystemVerilog, SVA, JasperGold');
  });

  it('leaves a first line that is a sentence, not a name', () => {
    const text = 'Formal verification engineer with three years of SVA work\nSkills';
    expect(redactCv(text, 'Someone Else').split('\n')[0]).toBe(text.split('\n')[0]);
  });
});

describe('cvPassages', () => {
  it('numbers the lines worth rewriting, without their bullet marks', () => {
    const passages = cvPassages(redactCv(CV, 'Invented Learner'));
    expect([...passages.keys()]).toEqual(['P1', 'P2']);
    expect(passages.get('P1')).toBe(
      'Wrote 42 SVA properties for an AXI4 bridge and proved 38 of them with JasperGold.',
    );
  });
});
