import { z } from 'zod';
import { addsNumbers, clip, hasPersonalData, inPosting } from '../ai/checks';
import { AiConsentSchema } from '../ai/notice';
import { JobDescriptionSchema } from '../cv-screening/report';
import { RESUME_LIST_LIMITS as N, RESUME_TEXT_LIMITS as T, type Resume } from '../schemas/resume';

// Tailoring a resume to a job with AI (ADR 0030): the model proposes rewrites of the summary and
// of bullets, skills the resume already shows that the job asks for, and gaps. The learner
// accepts or dismisses each proposal; nothing changes without a click.

export const TAILOR_LIMITS = { proposals: 20, gaps: 8, reason: 300, need: 120 } as const;
const L = TAILOR_LIMITS;

/** Asking for tailoring: the agreed notice and the job to tailor for. */
export const TailorRequestSchema = AiConsentSchema.extend({ jobDescription: JobDescriptionSchema });

/** What the model must return; limits are applied after. */
export const TailorAnswerSchema = z.strictObject({
  summary: z.strictObject({ rewrite: z.string(), reason: z.string() }).nullable(),
  bullets: z.array(z.strictObject({ id: z.string(), rewrite: z.string(), reason: z.string() })),
  skills: z.array(z.strictObject({ skill: z.string(), reason: z.string() })),
  gaps: z.array(z.strictObject({ need: z.string(), advice: z.string() })),
});
export type TailorAnswer = z.infer<typeof TailorAnswerSchema>;

const BulletTargetSchema = z.object({
  section: z.enum(['experience', 'projects']),
  item: z.number().int().min(0),
  bullet: z.number().int().min(0),
});
type BulletTarget = z.infer<typeof BulletTargetSchema>;

const reason = z.string().max(L.reason);

export const TailorProposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('summary'),
    before: z.string(),
    after: z.string().min(1).max(T.summary),
    reason,
  }),
  z.object({
    kind: z.literal('bullet'),
    target: BulletTargetSchema,
    before: z.string(),
    after: z.string().min(1).max(T.bullet),
    reason,
  }),
  z.object({ kind: z.literal('skill'), skill: z.string().min(1).max(40), reason }),
]);
export type TailorProposal = z.infer<typeof TailorProposalSchema>;

export const TailoringSchema = z.object({
  proposals: z.array(TailorProposalSchema).max(L.proposals),
  gaps: z
    .array(
      z.object({ need: z.string().min(1).max(L.need), advice: z.string().min(1).max(L.reason) }),
    )
    .max(L.gaps),
});
export type Tailoring = z.infer<typeof TailoringSchema>;

/** The bullets the model may rewrite, by id: "E1.2" is experience entry 1, bullet 2; "P" projects. */
export function tailorPassages(
  resume: Resume,
): Map<string, { target: BulletTarget; text: string }> {
  const passages = new Map<string, { target: BulletTarget; text: string }>();
  const add = (
    section: BulletTarget['section'],
    prefix: string,
    entries: { bullets: string[] }[],
  ) =>
    entries.forEach((entry, item) =>
      entry.bullets.forEach((text, bullet) =>
        passages.set(`${prefix}${item + 1}.${bullet + 1}`, {
          target: { section, item, bullet },
          text,
        }),
      ),
    );
  add('experience', 'E', resume.experience);
  add('projects', 'P', resume.projects);
  return passages;
}

/** Everything the resume says outside its skills list, to check a skill or number is the learner's. */
function evidenceOf(resume: Resume): string {
  return [
    resume.basics.headline,
    resume.summary,
    ...resume.experience.flatMap((job) => [job.role, ...job.bullets]),
    ...resume.projects.flatMap((project) => [project.name, ...project.bullets]),
    ...resume.education.map((school) => school.degree),
    ...resume.certifications.map((cert) => cert.name),
    ...resume.awards.flatMap((award) => [award.title, award.summary]),
    ...resume.publications.map((paper) => paper.title),
    ...resume.custom.flatMap((section) =>
      section.items.flatMap((item) => [item.title, ...item.bullets]),
    ),
  ].join('\n');
}

const sound = (value: string) => value.trim() !== '' && !hasPersonalData(value);

export type FittedTailoring = { ok: true; tailoring: Tailoring } | { ok: false; reason: string };

const why = (text: string) => clip(text, L.reason);

/** Bullet rewrites of bullets that exist, adding no number, and changing something. */
function bulletProposals(answer: TailorAnswer, resume: Resume): TailorProposal[] {
  const passages = tailorPassages(resume);
  return answer.bullets.flatMap(({ id, rewrite, reason: text }) => {
    const passage = passages.get(id);
    const fine =
      passage !== undefined &&
      sound(rewrite) &&
      rewrite.trim() !== passage.text &&
      !addsNumbers(rewrite, passage.text);
    if (!fine) return [];
    const { target, text: before } = passage;
    return [{ kind: 'bullet', target, before, after: clip(rewrite, T.bullet), reason: why(text) }];
  });
}

/** A summary rewrite whose numbers all appear in the resume. */
function summaryProposals(
  { summary }: TailorAnswer,
  resume: Resume,
  evidence: string,
): TailorProposal[] {
  if (summary === null || !sound(summary.rewrite) || addsNumbers(summary.rewrite, evidence))
    return [];
  const after = clip(summary.rewrite, T.summary);
  return [{ kind: 'summary', before: resume.summary, after, reason: why(summary.reason) }];
}

/** Skills not listed yet that the resume shows elsewhere and the posting asks for. */
function skillProposals(
  answer: TailorAnswer,
  resume: Resume,
  evidence: string,
  posting: string,
): TailorProposal[] {
  const listed = new Set(
    resume.skills.flatMap((group) => group.items.map((item) => item.toLowerCase())),
  );
  const shown = evidence.toLowerCase();
  return answer.skills
    .map((proposal) => ({ ...proposal, skill: proposal.skill.trim() }))
    .filter(({ skill }) => {
      const key = skill.toLowerCase();
      return (
        sound(skill) &&
        skill.length <= 40 &&
        !listed.has(key) &&
        shown.includes(key) &&
        inPosting(skill, posting)
      );
    })
    .map(({ skill, reason: text }) => ({ kind: 'skill', skill, reason: why(text) }));
}

/**
 * Checks the model's proposals against the resume and the posting. A rewrite may not add a number
 * its bullet lacks; a skill must already appear in the resume and be asked for by the posting; a
 * gap must come from the posting. Refused when more bullet rewrites fail than pass.
 */
export function fitTailoring(
  answer: TailorAnswer,
  { resume, jobDescription }: { resume: Resume; jobDescription: string },
): FittedTailoring {
  const bullets = bulletProposals(answer, resume);
  if (answer.bullets.length - bullets.length > bullets.length) {
    return { ok: false, reason: 'most bullet rewrites failed checks' };
  }
  const evidence = evidenceOf(resume);
  const gaps = answer.gaps
    .filter(({ need, advice }) => sound(need) && sound(advice) && inPosting(need, jobDescription))
    .slice(0, L.gaps)
    .map(({ need, advice }) => ({ need: clip(need, L.need), advice: why(advice) }));
  const parsed = TailoringSchema.safeParse({
    proposals: [
      ...summaryProposals(answer, resume, evidence),
      ...bullets,
      ...skillProposals(answer, resume, evidence, jobDescription),
    ].slice(0, L.proposals),
    gaps,
  });
  return parsed.success
    ? { ok: true, tailoring: parsed.data }
    : { ok: false, reason: 'answer outside the stored shape' };
}

/** The resume with one accepted proposal applied; a proposal that no longer fits changes nothing. */
export function applyProposal(resume: Resume, proposal: TailorProposal): Resume {
  if (proposal.kind === 'summary') return { ...resume, summary: proposal.after };
  if (proposal.kind === 'bullet') {
    const { section, item, bullet } = proposal.target;
    const entries = resume[section].map((entry, index) =>
      index === item && entry.bullets[bullet] === proposal.before
        ? {
            ...entry,
            bullets: entry.bullets.map((text, b) => (b === bullet ? proposal.after : text)),
          }
        : entry,
    );
    return { ...resume, [section]: entries };
  }
  const open = resume.skills.findIndex((group) => group.items.length < N.skillItems);
  if (open >= 0) {
    const skills = resume.skills.map((group, index) =>
      index === open ? { ...group, items: [...group.items, proposal.skill] } : group,
    );
    return { ...resume, skills };
  }
  if (resume.skills.length >= N.skills) return resume;
  const category = resume.skills.length === 0 ? 'Skills' : 'More skills';
  return { ...resume, skills: [...resume.skills, { category, items: [proposal.skill] }] };
}
