import { describe, expect, it } from 'vitest';
import { CV_FEEDBACK_LIMITS, type CvFeedbackAnswer, fitCvFeedback } from './feedback';
import { REDACTED } from './redact';

// Invented passages, posting and answers for tests only.
const passages = new Map([
  ['P1', 'Wrote SVA properties for an AXI4 bridge.'],
  ['P2', 'Responsible for running formal regressions every night.'],
]);
const posting = 'Requirements\n- UVM testbenches\n- Formal sign-off with JasperGold';

type Suggestion = CvFeedbackAnswer['suggestions'][number];

const suggestion = (overrides: Partial<Suggestion> = {}): Suggestion => ({
  passageId: 'P1',
  issue: 'Says what you did, not what it achieved.',
  rewrite: 'Wrote SVA properties that proved an AXI4 bridge free of deadlock.',
  impact: 'high',
  ...overrides,
});

const jobFit = {
  verdict: 'Strong on formal, lighter on simulation.',
  gaps: [{ need: 'UVM testbenches', advice: 'Show any UVM work, if you have done it.' }],
  strengths: ['JasperGold experience.'],
};

const answer = (overrides: Partial<CvFeedbackAnswer> = {}): CvFeedbackAnswer => ({
  summary: 'A focused CV for formal verification roles; the bullets name tasks more than results.',
  suggestions: [suggestion()],
  strengths: ['Names real tools and protocols.'],
  jobFit,
  ...overrides,
});

const fit = (value: CvFeedbackAnswer, jobDescription?: string) =>
  fitCvFeedback(value, { passages, jobDescription });

describe('fitCvFeedback', () => {
  it('keeps a sound answer, with each rewrite beside the passage it rewrites', () => {
    const result = fit(answer(), posting);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feedback.suggestions[0]?.passage).toBe(passages.get('P1'));
    expect(result.feedback.jobFit?.gaps).toEqual([
      { need: 'UVM testbenches', advice: 'Show any UVM work, if you have done it.' },
    ]);
  });

  it('gives no job fit when no job description was sent, whatever the model wrote', () => {
    const result = fit(answer());
    expect(result.ok && result.feedback.jobFit).toBe(null);
  });

  it.each([
    ['points at a passage we did not send', suggestion({ passageId: 'P9' })],
    ['adds a number the passage lacks', suggestion({ rewrite: 'Wrote 40 SVA properties.' })],
    ['rewrites without naming a passage', suggestion({ passageId: null })],
    ['holds a link', suggestion({ issue: 'See https://example.test for ideas.' })],
    ['holds an email address', suggestion({ rewrite: 'Contact me at a@example.test.' })],
    ['repeats a placeholder', suggestion({ issue: `${REDACTED.name} should say more.` })],
  ])('drops a suggestion that %s', (_label, bad) => {
    const result = fit(answer({ suggestions: [suggestion(), suggestion(), bad] }));
    expect(result.ok && result.feedback.suggestions).toHaveLength(2);
  });

  it('keeps a general point that rewrites nothing', () => {
    const general = suggestion({ passageId: null, rewrite: null });
    const result = fit(answer({ suggestions: [general] }));
    expect(result.ok && result.feedback.suggestions[0]?.passage).toBe(null);
  });

  it('drops a gap the posting does not ask for', () => {
    const invented = { need: 'Kubernetes', advice: 'Learn Kubernetes.' };
    const result = fit(answer({ jobFit: { ...jobFit, gaps: [invented] } }), posting);
    expect(result.ok && result.feedback.jobFit?.gaps).toEqual([]);
  });

  it.each([
    ['its summary holds a link', answer({ summary: 'Read www.example.test first.' })],
    [
      'more suggestions fail than pass',
      answer({
        suggestions: [
          suggestion(),
          suggestion({ passageId: 'P8' }),
          suggestion({ passageId: 'P9' }),
        ],
      }),
    ],
  ])('refuses the whole answer when %s', (_label, bad) => {
    expect(fit(bad, posting).ok).toBe(false);
  });

  it('cuts long text at a word and trims long lists to the limits', () => {
    const long = 'Prove more properties. '.repeat(60);
    const many = Array.from({ length: 12 }, () => suggestion());
    const result = fit(answer({ summary: long, suggestions: many }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feedback.summary.length).toBeLessThanOrEqual(CV_FEEDBACK_LIMITS.summary);
    expect(result.feedback.summary.endsWith('…')).toBe(true);
    expect(result.feedback.suggestions).toHaveLength(CV_FEEDBACK_LIMITS.suggestions);
  });
});
