import { RESUME_LIST_LIMITS as N, type Resume } from '../schemas/resume';
import { csvRecords } from './csv';
import { cut, fitResume, toBullets, toHttps, toLanguageLevel, toMonth } from './fit';

// A resume from LinkedIn's data export (Settings, Data privacy, Get a copy of your data). Only
// these files are read; birth date and everything else in the archive are ignored.

export const LINKEDIN_FILES = [
  'Profile.csv',
  'Positions.csv',
  'Education.csv',
  'Skills.csv',
  'Certifications.csv',
  'Languages.csv',
  'Projects.csv',
  'Honors.csv',
  'Publications.csv',
] as const;
export type LinkedInFile = (typeof LINKEDIN_FILES)[number];

type Account = { name: string; email: string };

/** Skills in groups of the most a group may hold. */
function skillGroups(names: string[]): Resume['skills'] {
  const items = names.map((name) => cut(name, 40)).filter(Boolean);
  const groups: Resume['skills'] = [];
  for (let i = 0; i < items.length && groups.length < N.skills; i += N.skillItems) {
    const category = groups.length === 0 ? 'Skills' : 'More skills';
    groups.push({ category, items: items.slice(i, i + N.skillItems) });
  }
  return groups;
}

type Files = Partial<Record<LinkedInFile, string>>;
type Rows = (file: LinkedInFile) => Record<string, string>[];

function linkedInBasics(
  profile: Record<string, string>,
  account: Account,
): Pick<Resume, 'basics' | 'summary'> {
  const fullName = [profile['First Name'], profile['Last Name']].filter(Boolean).join(' ');
  return {
    basics: {
      fullName: cut(fullName, 80) || account.name || 'Your name',
      headline: cut(profile.Headline, 120),
      email: account.email,
      phone: '',
      location: cut(profile['Geo Location'], 80),
      links: [],
    },
    summary: profile.Summary ?? '',
  };
}

function linkedInWork(read: Rows) {
  return {
    experience: read('Positions.csv').map((job) => ({
      role: cut(job.Title, 80),
      company: cut(job['Company Name'], 80),
      location: cut(job.Location, 80),
      start: toMonth(job['Started On']),
      end: toMonth(job['Finished On']) || 'Present',
      bullets: toBullets(job.Description),
    })),
    education: read('Education.csv').map((school) => ({
      degree: cut(school['Degree Name'], 120) || 'Degree',
      institution: cut(school['School Name'], 120),
      start: toMonth(school['Start Date']),
      end: toMonth(school['End Date']),
      score: '',
    })),
    projects: read('Projects.csv').map((project) => ({
      name: cut(project.Title, 80),
      link: toHttps(project.Url),
      bullets: toBullets(project.Description),
    })),
  };
}

function linkedInExtras(read: Rows) {
  return {
    skills: skillGroups(read('Skills.csv').map((skill) => skill.Name ?? '')),
    certifications: read('Certifications.csv').map((cert) => ({
      name: cut(cert.Name, 120),
      issuer: cut(cert.Authority, 80),
      year: Number(toMonth(cert['Started On']).slice(0, 4)),
    })),
    languages: read('Languages.csv').map((language) => ({
      name: cut(language.Name, 40),
      level: toLanguageLevel(language.Proficiency),
    })),
    awards: read('Honors.csv').map((honor) => ({
      title: cut(honor.Title, 120),
      issuer: '',
      date: toMonth(honor['Issued On']),
      summary: cut(honor.Description, 300),
    })),
    publications: read('Publications.csv').map((paper) => ({
      title: cut(paper.Name, 200),
      venue: cut(paper.Publisher, 120),
      date: toMonth(paper['Published On']),
      link: toHttps(paper.Url),
    })),
  };
}

/**
 * The resume from the export's CSV files, by file name. Notes say what the learner should check:
 * LinkedIn often gives only a year for education, which becomes January.
 */
export function resumeFromLinkedIn(
  files: Files,
  account: Account,
): { resume: Resume; dropped: number; notes: string[] } {
  const read: Rows = (file) => csvRecords(files[file] ?? '');
  const base = linkedInBasics(read('Profile.csv')[0] ?? {}, account);
  const { resume, dropped } = fitResume(base, { ...linkedInWork(read), ...linkedInExtras(read) });
  const yearOnly = read('Education.csv').some((school) =>
    /^\d{4}$/.test((school['End Date'] ?? '').trim()),
  );
  const notes = yearOnly
    ? ['LinkedIn gives only years for education; each became January. Check those dates.']
    : [];
  return { resume, dropped, notes };
}
