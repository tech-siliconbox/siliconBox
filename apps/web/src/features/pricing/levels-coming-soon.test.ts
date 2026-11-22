import { describe, expect, it } from 'vitest';
import { levelsComingSoon } from './levels-coming-soon';

describe('levelsComingSoon', () => {
  it('shows a level as coming soon while every course of it is', () => {
    const courses = [
      { level: 'basic', comingSoon: false },
      { level: 'intermediate', comingSoon: true },
      { level: 'advance', comingSoon: true },
    ] as const;
    expect([...levelsComingSoon(courses)]).toEqual(['intermediate', 'advance']);
  });

  it('sells a level with an open course, and says nothing of a level without one', () => {
    const courses = [
      { level: 'intermediate', comingSoon: true },
      { level: 'intermediate', comingSoon: false },
    ] as const;
    expect([...levelsComingSoon(courses)]).toEqual([]);
    expect([...levelsComingSoon([])]).toEqual([]);
  });
});
