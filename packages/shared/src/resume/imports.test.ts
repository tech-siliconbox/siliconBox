import { describe, expect, it } from 'vitest';
import { fullResume } from '../testing/resume';
import { contactFromCv, fitImport, type ImportAnswer } from './ai-import';
import { csvRecords, parseCsv } from './csv';
import { toLanguageLevel, toMonth } from './fit';
import { fromJsonResume, toJsonResume } from './json-resume';
import { resumeFromLinkedIn } from './linkedin';

// Invented files and text for tests only.
const account = { name: 'Account Name', email: 'account@example.test' };

describe('dates and levels from outside data', () => {
  it.each([
    ['2024-06-29', '2024-06'],
    ['2024-06', '2024-06'],
    ['Jun 2024', '2024-06'],
    ['September 2023', '2023-09'],
    ['2024', '2024-01'],
    ['soon', ''],
    [undefined, ''],
  ])('reads %s as %s', (value, month) => {
    expect(toMonth(value)).toBe(month);
  });

  it('maps free-text proficiency to our levels', () => {
    expect(toLanguageLevel('Native or bilingual proficiency')).toBe('Native');
    expect(toLanguageLevel('Full professional proficiency')).toBe('Fluent');
    expect(toLanguageLevel('Limited working proficiency')).toBe('Conversational');
    expect(toLanguageLevel('Elementary proficiency')).toBe('Basic');
  });
});

describe('JSON Resume', () => {
  it('round-trips our own export without loss', () => {
    const resume = fullResume();
    const back = fromJsonResume(JSON.parse(JSON.stringify(toJsonResume(resume))), account);
    expect(back).toEqual({ resume, dropped: 0 });
  });

  it('reads a file from another tool, dropping what cannot be valid', () => {
    const imported = fromJsonResume(
      {
        basics: { name: 'Other Tool User', label: 'DV engineer', location: { city: 'Pune' } },
        work: [
          {
            name: 'Invented Co',
            position: 'Engineer',
            startDate: '2022-03-01',
            highlights: ['Ran UVM.'],
          },
          { name: 'No Dates Co', position: 'Engineer' },
        ],
        skills: [{ name: 'Verification', keywords: ['UVM', 'SVA'] }],
        languages: [{ language: 'Hindi', fluency: 'Native speaker' }],
      },
      account,
    );
    expect(imported?.dropped).toBe(1);
    expect(imported?.resume.basics).toMatchObject({
      fullName: 'Other Tool User',
      email: account.email,
      location: 'Pune',
    });
    expect(imported?.resume.experience).toEqual([
      expect.objectContaining({
        company: 'Invented Co',
        start: '2022-03',
        end: 'Present',
        bullets: ['Ran UVM.'],
      }),
    ]);
    expect(imported?.resume.languages).toEqual([{ name: 'Hindi', level: 'Native' }]);
  });

  it('refuses something that is not an object', () => {
    expect(fromJsonResume('not json resume', account)).toBeNull();
  });
});

describe('CSV', () => {
  it('reads quoted fields, doubled quotes and line breaks inside quotes', () => {
    expect(parseCsv(`${String.fromCharCode(0xfeff)}a,b\r\n"x, y","say ""hi""\nagain"\n`)).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nagain'],
    ]);
    expect(csvRecords('Name,Level\nHindi,Native')).toEqual([{ Name: 'Hindi', Level: 'Native' }]);
  });
});

describe('LinkedIn export', () => {
  const files = {
    'Profile.csv':
      'First Name,Last Name,Birth Date,Headline,Summary,Geo Location\nInvented,Learner,01 Jan 2000,DV engineer,"Formal and UVM.",Bengaluru',
    'Positions.csv':
      'Company Name,Title,Description,Location,Started On,Finished On\nInvented Chips,Intern,"- Wrote SVA\n- Ran BMC",Bengaluru,Jan 2025,',
    'Education.csv':
      'School Name,Start Date,End Date,Notes,Degree Name,Activities\nInvented Institute,2021,2025,,B.Tech,',
    'Skills.csv': 'Name\nSVA\nUVM',
    'Languages.csv': 'Name,Proficiency\nEnglish,Full professional proficiency',
  };

  it('builds the resume from the files it knows, never the birth date', () => {
    const { resume, notes } = resumeFromLinkedIn(files, account);
    expect(resume.basics).toMatchObject({
      fullName: 'Invented Learner',
      headline: 'DV engineer',
      email: account.email,
    });
    expect(JSON.stringify(resume)).not.toContain('2000');
    expect(resume.experience[0]).toMatchObject({
      start: '2025-01',
      end: 'Present',
      bullets: ['Wrote SVA', 'Ran BMC'],
    });
    expect(resume.education[0]).toMatchObject({ start: '2021-01', end: '2025-01' });
    expect(resume.skills).toEqual([{ category: 'Skills', items: ['SVA', 'UVM'] }]);
    expect(notes).toHaveLength(1);
  });
});

describe('AI import', () => {
  const cv = `Invented Learner
learner@example.test | +91 98765 43210 | linkedin.com/in/invented
Experience
Verification Intern, Invented Chips, Jan 2025 to now
Wrote SVA properties for an AXI4 bridge.`;

  it('reads contact details from the CV itself', () => {
    expect(contactFromCv(cv, account)).toMatchObject({
      fullName: 'Invented Learner',
      email: 'learner@example.test',
      phone: '+91 98765 43210',
      links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/invented' }],
    });
  });

  it('keeps what the CV says and drops what it does not', () => {
    const answer: ImportAnswer = {
      headline: '',
      summary: 'Award-winning architect of quantum processors.',
      skills: [],
      experience: [
        {
          role: 'Verification Intern',
          company: 'Invented Chips',
          location: '',
          start: '2025-01',
          end: 'Present',
          bullets: [
            'Wrote SVA properties for an AXI4 bridge.',
            'Led a team of fifty engineers worldwide.',
          ],
        },
        {
          role: 'Chief Scientist',
          company: 'Imaginary Labs',
          location: '',
          start: '2020-01',
          end: '2021-01',
          bullets: [],
        },
      ],
      projects: [],
      education: [],
      certifications: [],
      awards: [],
      publications: [],
      languages: [],
    };
    const { resume, dropped } = fitImport(answer, {
      sourceText: cv,
      basics: contactFromCv(cv, account),
    });
    expect(resume.summary).toBe('');
    expect(resume.experience).toHaveLength(1);
    expect(resume.experience[0]?.bullets).toEqual(['Wrote SVA properties for an AXI4 bridge.']);
    expect(dropped).toBe(1);
  });
});
