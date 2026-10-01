import { ResumeSchema, screenCv } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import { extractCvText } from '../cv-text';
import { renderResumePdf } from './render';

// An invented resume; the round trip proves the builder's PDF reads well in the screener.
const resume = ResumeSchema.parse({
  basics: {
    fullName: 'Invented Learner',
    headline: 'Formal Verification Engineer',
    email: 'learner@example.test',
    phone: '+91 98765 43210',
    links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/invented-learner' }],
  },
  summary:
    'Formal verification engineer writing SVA and closing proofs with JasperGold and SymbiYosys.',
  skills: [
    { category: 'Formal', items: ['SystemVerilog', 'SVA', 'model checking', 'k-induction', 'AXI'] },
  ],
  experience: [
    {
      role: 'Verification Intern',
      company: 'Invented Chips',
      start: '2025-01',
      end: 'Present',
      bullets: [
        'Wrote 42 SVA properties for an AXI4 bridge.',
        'Found 5 deadlock bugs with bounded model checking.',
      ],
    },
  ],
  education: [
    { degree: 'B.Tech ECE', institution: 'Invented Institute', start: '2021-08', end: '2025-05' },
  ],
});

describe('resume PDF', () => {
  it('renders a text PDF that the CV screener can read, heading by heading', async () => {
    const pdf = await renderResumePdf(resume);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const { text, pages } = await extractCvText('resume.pdf', new Uint8Array(pdf));
    expect(pages).toBe(1);
    expect(text).toContain('Invented Learner');
    expect(text).toMatch(/^EXPERIENCE$/m);

    const report = screenCv(text, pages);
    expect(report.keywords.found).toEqual(expect.arrayContaining(['SVA', 'JasperGold', 'AXI']));
    expect(report.checks.find((check) => check.id === 'experience')?.status).toBe('pass');
  }, 20_000);

  it.each([
    ['a text file renamed to .pdf', 'cv.pdf', new TextEncoder().encode('hello')],
    ['an empty file', 'cv.pdf', new Uint8Array()],
    ['a zip that is not a .docx', 'cv.zip', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])],
  ])('refuses %s', async (_label, name, bytes) => {
    await expect(extractCvText(name, bytes)).rejects.toMatchObject({ code: 'FILE_NOT_SUPPORTED' });
  });
});
