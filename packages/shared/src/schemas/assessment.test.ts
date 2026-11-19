import { describe, expect, it } from 'vitest';
import { ASSESSMENT_ATTEMPTS, assessmentStanding, scoreAttempt } from './assessment';
import { gradeProblems, rubricTotal } from './capstone';

const key = [{ correct: 'B' }, { correct: 'D' }, { correct: 'A' }] as const;

describe('assessments', () => {
  it('scores an attempt question by question', () => {
    expect(scoreAttempt([1, 3, 0], key)).toBe(3);
    expect(scoreAttempt([1, 2, 2], key)).toBe(1);
  });

  it('is open until the learner passes or uses every attempt', () => {
    expect(assessmentStanding([], 24)).toEqual({
      best: null,
      passed: false,
      attemptsLeft: ASSESSMENT_ATTEMPTS,
      finished: false,
    });
    expect(assessmentStanding([{ score: 20 }], 24)).toMatchObject({
      attemptsLeft: 2,
      finished: false,
    });
    expect(assessmentStanding([{ score: 20 }, { score: 25 }], 24)).toMatchObject({
      best: 25,
      passed: true,
      finished: true,
    });
    expect(assessmentStanding([{ score: 1 }, { score: 2 }, { score: 3 }], 24)).toMatchObject({
      best: 3,
      passed: false,
      attemptsLeft: 0,
      finished: true,
    });
  });
});

describe('capstone grades', () => {
  const rubric = [
    { criterion: 'Plan', points: 40 },
    { criterion: 'Report', points: 60 },
  ];

  it('needs one score per criterion, none above its points', () => {
    expect(rubricTotal(rubric)).toBe(100);
    expect(gradeProblems([40, 30], rubric)).toEqual([]);
    expect(gradeProblems([40], rubric)).toEqual(['Give a score for every criterion.']);
    expect(gradeProblems([41, 30], rubric)).toEqual(['Plan: at most 40 points.']);
  });
});
