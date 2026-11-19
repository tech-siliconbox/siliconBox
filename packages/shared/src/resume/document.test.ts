import { describe, expect, it } from 'vitest';
import { RESUME_SECTIONS, ResumeSchema, emptyResume } from '../schemas/resume';
import { CUSTOM_ID, fullResume } from '../testing/resume';
import { resumeDocument, sectionOrder } from './document';
import { resumeMarkdown } from './markdown';

const headings = (resume = fullResume()) => resumeDocument(resume).blocks.map((b) => b.heading);

describe('resumeDocument', () => {
  it('prints every filled section in the default order, custom sections last', () => {
    expect(headings()).toEqual([
      'Summary',
      'Skills',
      'Experience',
      'Projects',
      'Education',
      'Certifications',
      'Awards and achievements',
      'Publications',
      'Languages',
      'Positions of responsibility',
    ]);
  });

  it('follows the chosen order, hides hidden sections and uses renamed headings', () => {
    const resume = fullResume();
    resume.sections = {
      order: [CUSTOM_ID, 'education'],
      hidden: ['summary', 'languages'],
      titles: { skills: 'Technical skills' },
    };
    expect(headings(resume).slice(0, 4)).toEqual([
      'Positions of responsibility',
      'Education',
      'Technical skills',
      'Experience',
    ]);
    expect(headings(resume)).not.toContain('Summary');
    expect(headings(resume)).not.toContain('Languages');
  });

  it('leaves out empty sections and blank bullets kept while typing', () => {
    const resume = emptyResume('Invented Learner', 'learner@example.test');
    expect(resumeDocument(resume).blocks).toEqual([]);
    const base = fullResume();
    const draft = {
      ...base,
      experience: base.experience.map((job) => ({ ...job, bullets: ['Wrote SVA.', '  ', ''] })),
    };
    const experience = resumeDocument(draft).blocks.find((b) => b.id === 'experience');
    expect(experience?.kind === 'entries' && experience.entries[0]?.bullets).toEqual([
      'Wrote SVA.',
    ]);
  });

  it('lists every built-in section and custom section once', () => {
    expect(sectionOrder(fullResume())).toEqual([...RESUME_SECTIONS, CUSTOM_ID]);
  });

  it('reads a resume saved before sections and design existed', () => {
    const old = ResumeSchema.parse({
      template: 'compact',
      basics: { fullName: 'Invented Learner', email: 'learner@example.test' },
      summary: 'SVA.',
    });
    expect(old.design).toMatchObject({ font: 'sans', fontSize: 10, pageSize: 'A4' });
    expect(headings(old)).toEqual(['Summary']);
  });
});

describe('resumeMarkdown', () => {
  it('writes headings, entries with dates and bullets', () => {
    const markdown = resumeMarkdown(fullResume());
    expect(markdown).toMatch(/^# Invented Learner\n/);
    expect(markdown).toContain('## Experience');
    expect(markdown).toContain('### Verification Intern, Invented Chips (Jan 2025 – Present)');
    expect(markdown).toContain('- Wrote 42 SVA properties for an AXI4 bridge.');
    expect(markdown).toContain('- **Formal:** SVA, JasperGold, k-induction');
  });
});
