import { fullResume } from '@siliconbox/shared/testing/resume';
import { describe, expect, it } from 'vitest';
import { extractCvText } from '../cv-text';
import { renderResumeDocx } from './render';

describe('resume Word file', () => {
  it('holds every section as plain text, bold marks turned into bold', async () => {
    const docx = await renderResumeDocx(fullResume());
    const { text, kind } = await extractCvText('resume.docx', new Uint8Array(docx));
    expect(kind).toBe('docx');
    for (const expected of [
      'Invented Learner',
      'Formal Verification Engineer',
      'Verification Intern, Invented Chips',
      'Wrote 42 SVA properties for an AXI4 bridge.',
      'Positions of responsibility',
      'writing SVA and closing proofs',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('**');
  });
});
