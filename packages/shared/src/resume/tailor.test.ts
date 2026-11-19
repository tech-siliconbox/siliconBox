import { describe, expect, it } from 'vitest';
import { fullResume } from '../testing/resume';
import {
  type TailorAnswer,
  type TailorProposal,
  applyProposal,
  fitTailoring,
  tailorPassages,
} from './tailor';

// An invented posting and answers for tests only.
const posting = 'Requirements\n- JasperGold and SVA\n- k-induction proofs\n- UVM testbenches';

const answer = (overrides: Partial<TailorAnswer> = {}): TailorAnswer => ({
  summary: {
    rewrite: 'Formal engineer proving AXI4 bridges with SVA and JasperGold.',
    reason: 'Leads with the job.',
  },
  bullets: [
    {
      id: 'E1.1',
      rewrite: 'Proved an AXI4 bridge with 42 SVA properties.',
      reason: 'Outcome first.',
    },
  ],
  skills: [{ skill: 'AXI4', reason: 'Shown in your experience.' }],
  gaps: [{ need: 'UVM testbenches', advice: 'Add UVM work if you have it.' }],
  ...overrides,
});

const fit = (value: TailorAnswer) =>
  fitTailoring(value, { resume: fullResume(), jobDescription: posting });

describe('tailorPassages', () => {
  it('numbers experience and project bullets', () => {
    expect([...tailorPassages(fullResume()).keys()]).toEqual(['E1.1', 'E1.2', 'P1.1']);
  });
});

describe('fitTailoring', () => {
  it('turns a sound answer into proposals and gaps', () => {
    const result = fit(answer());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tailoring.proposals.map((p) => p.kind)).toEqual(['summary', 'bullet']);
    expect(result.tailoring.gaps).toHaveLength(1);
  });

  it.each([
    [
      'a bullet rewrite that adds a number',
      {
        bullets: [
          { id: 'E1.1', rewrite: 'Wrote 99 SVA properties.', reason: '' },
          { id: 'E1.2', rewrite: 'Found 5 deadlocks early with BMC.', reason: '' },
        ],
      },
    ],
    [
      'a bullet that does not exist',
      {
        bullets: [
          { id: 'E9.9', rewrite: 'Did SVA.', reason: '' },
          { id: 'E1.2', rewrite: 'Found 5 deadlocks early with BMC.', reason: '' },
        ],
      },
    ],
  ])('drops %s', (_label, overrides) => {
    const result = fit(answer(overrides));
    expect(result.ok && result.tailoring.proposals.filter((p) => p.kind === 'bullet')).toHaveLength(
      1,
    );
  });

  it('proposes a skill only when the resume already shows it and the job asks for it', () => {
    const skills = [
      { skill: 'UVM', reason: 'The job asks for it.' },
      { skill: 'AXI4', reason: 'In your experience, but the job does not ask.' },
      { skill: 'SVA', reason: 'Already listed.' },
    ];
    const posted = `${posting}\n- AXI4 protocols`;
    const result = fitTailoring(answer({ skills }), {
      resume: fullResume(),
      jobDescription: posted,
    });
    expect(result.ok && result.tailoring.proposals.filter((p) => p.kind === 'skill')).toEqual([
      { kind: 'skill', skill: 'AXI4', reason: 'In your experience, but the job does not ask.' },
    ]);
  });

  it('drops gaps the posting does not ask for and refuses when most rewrites fail', () => {
    const gaps = [{ need: 'Kubernetes', advice: 'Learn it.' }];
    expect(fit(answer({ gaps })).ok && fit(answer({ gaps }))).toMatchObject({
      tailoring: { gaps: [] },
    });
    const bad = [
      { id: 'E9.1', rewrite: 'x', reason: '' },
      { id: 'E9.2', rewrite: 'y', reason: '' },
    ];
    expect(fit(answer({ bullets: bad })).ok).toBe(false);
  });
});

describe('applyProposal', () => {
  it('applies a summary, a bullet and a skill', () => {
    const resume = fullResume();
    const bullet: TailorProposal = {
      kind: 'bullet',
      target: { section: 'experience', item: 0, bullet: 0 },
      before: 'Wrote 42 SVA properties for an AXI4 bridge.',
      after: 'Proved an AXI4 bridge with 42 SVA properties.',
      reason: '',
    };
    const done = [
      bullet,
      { kind: 'summary', before: '', after: 'New summary.', reason: '' } as const,
      { kind: 'skill', skill: 'AXI4', reason: '' } as const,
    ].reduce(applyProposal, resume);
    expect(done.experience[0]?.bullets[0]).toBe(bullet.after);
    expect(done.summary).toBe('New summary.');
    expect(done.skills[0]?.items).toContain('AXI4');
  });

  it('leaves a bullet the learner changed since the proposal', () => {
    const resume = fullResume();
    const stale: TailorProposal = {
      kind: 'bullet',
      target: { section: 'experience', item: 0, bullet: 0 },
      before: 'An older wording.',
      after: 'Rewritten.',
      reason: '',
    };
    expect(applyProposal(resume, stale)).toEqual(resume);
  });
});
