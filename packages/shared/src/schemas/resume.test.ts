import { describe, expect, it } from 'vitest';
import { ResumeSchema, emptyResume, formatResumePeriod } from './resume';

const resume = {
  basics: {
    fullName: 'Invented Learner',
    email: 'learner@example.test',
    links: [{ label: 'GitHub', url: 'https://github.com/invented' }],
  },
  experience: [
    {
      role: 'Verification intern',
      company: 'Invented Chips',
      start: '2025-01',
      end: 'Present',
      bullets: ['Wrote 40 SVA properties for an AXI bridge.'],
    },
  ],
};

describe('ResumeSchema', () => {
  it('accepts a resume and fills defaults', () => {
    const parsed = ResumeSchema.parse(resume);
    expect(parsed.template).toBe('classic');
    expect(parsed.skills).toEqual([]);
  });

  it('starts a blank resume from the account', () => {
    expect(emptyResume('Invented Learner', 'learner@example.test').basics.fullName).toBe(
      'Invented Learner',
    );
  });

  it.each([
    ['an unknown field', { ...resume, photo: 'x' }],
    [
      'a non-https link',
      {
        ...resume,
        basics: { ...resume.basics, links: [{ label: 'Site', url: 'javascript:alert(1)' }] },
      },
    ],
    ['a bad month', { ...resume, experience: [{ ...resume.experience[0], start: '2025-13' }] }],
    [
      'too many bullets',
      { ...resume, experience: [{ ...resume.experience[0], bullets: Array(9).fill('x') }] },
    ],
    ['an invalid email', { ...resume, basics: { ...resume.basics, email: 'not-an-email' } }],
  ])('rejects %s', (_label, input) => {
    expect(ResumeSchema.safeParse(input).success).toBe(false);
  });
});

describe('formatResumePeriod', () => {
  it('formats months for people', () => {
    expect(formatResumePeriod('2024-06', 'Present')).toBe('Jun 2024 \u2013 Present');
    expect(formatResumePeriod('2021-08', '2025-05')).toBe('Aug 2021 \u2013 May 2025');
  });
});
