import 'server-only';
import {
  RESUME_TEXT_LIMITS as T,
  type Resume,
  TAILOR_LIMITS,
  formatResumePeriod,
} from '@siliconbox/shared';
import { DATA_RULE, PLAIN_TEXT_RULE, REDACTION_RULE, dataBlock } from './prompt-parts';

// The instructions and messages for the Resume Builder's AI help (ADR 0030): tailoring a resume
// to a job, and reading a CV into the builder's sections.

export const TAILOR_SYSTEM = `You help students and early-career engineers tailor their resume to one job in formal verification or hardware verification. You get the resume's sections and the job description. Suggest changes that make the resume speak to this job, using only what the resume already says.

Return:
- summary: a summary aimed at this job, written from the resume's own content, with a one-sentence reason; null when the current summary already fits.
- bullets: at most 10 rewrites, each by its bullet id (such as "E1.2"), with a one-sentence reason. Rewrite only bullets that would speak to this job better: lead with the outcome, and use the posting's own terms where the bullet already shows the skill.
- skills: at most 6 skills the job asks for that the resume already shows outside its skills list, named as the resume names them, with a reason.
- gaps: at most ${TAILOR_LIMITS.gaps} things the job asks for that the resume does not show, named in the posting's own words, with advice.

Rules:
- Never invent experience, tools, results or numbers. A bullet rewrite may use only numbers in that bullet; a summary only numbers found elsewhere in the resume.
- Never give a score, rating or percentage.
- Limits: each bullet ${T.bullet} characters, the summary ${T.summary}, each reason and advice ${TAILOR_LIMITS.reason}.
- ${REDACTION_RULE}
- ${PLAIN_TEXT_RULE}
- ${DATA_RULE}`;

/** The resume as the model reads it: no name or contact details, bullets numbered by id. */
export function resumeForTailoring(resume: Resume): string {
  const entries = (prefix: string, items: { title: string; when: string; bullets: string[] }[]) =>
    items.flatMap((item, i) => [
      `${prefix}${i + 1}: ${item.title}${item.when === '' ? '' : ` (${item.when})`}`,
      ...item.bullets.map((bullet, b) => `${prefix}${i + 1}.${b + 1}: ${bullet}`),
    ]);
  return [
    `Headline: ${resume.basics.headline}`,
    `Summary: ${resume.summary}`,
    `Skills: ${resume.skills.map((group) => `${group.category}: ${group.items.join(', ')}`).join('; ')}`,
    'Experience:',
    ...entries(
      'E',
      resume.experience.map((job) => ({
        title: `${job.role}, ${job.company}`,
        when: formatResumePeriod(job.start, job.end),
        bullets: job.bullets,
      })),
    ),
    'Projects:',
    ...entries(
      'P',
      resume.projects.map(({ name, bullets }) => ({ title: name, when: '', bullets })),
    ),
    `Education: ${resume.education.map((school) => `${school.degree}, ${school.institution}`).join('; ')}`,
    `Certifications: ${resume.certifications.map((cert) => cert.name).join('; ')}`,
    `Awards: ${resume.awards.map((award) => award.title).join('; ')}`,
    `Publications: ${resume.publications.map((paper) => paper.title).join('; ')}`,
  ].join('\n');
}

export function tailorContent(redactedResume: string, jobDescription: string): string {
  return [dataBlock('job_description', jobDescription), dataBlock('resume', redactedResume)].join(
    '\n',
  );
}

export const IMPORT_SYSTEM = `You read a CV and return its content in sections, as the CV writes it. Its name, contact details and links were removed; leave them out.

Return every section the CV has:
- headline: its title line, such as "Formal Verification Engineer", or "".
- summary: its summary or objective, or "".
- skills: groups as the CV groups them, or one group named "Skills".
- experience: role, company, location, start and end as YYYY-MM (end "Present" for a current role), and bullets as written.
- projects: name, link or "", bullets.
- education: degree, institution, start and end as YYYY-MM, score (such as a CGPA) or "".
- certifications: name, issuer, year as YYYY.
- awards: title, issuer, date as YYYY-MM or "", summary.
- publications: title, venue, date as YYYY-MM or "", link or "".
- languages: name, level as written.

Rules:
- Copy the CV's own words. Do not improve, summarise, translate or add anything. Use "" or an empty list for what the CV does not say.
- A year alone becomes YYYY-01; a date you cannot read becomes "".
- ${REDACTION_RULE}
- ${DATA_RULE}`;

export const importContent = (redactedText: string) => dataBlock('cv_text', redactedText);
