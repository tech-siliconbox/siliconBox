import type { CourseOutline } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import { isModuleDone, moduleMinutes, readableModules } from './course-progress';

// Invented course: an empty module, a one-lesson module and a two-lesson module.
const lesson = (publicId: string, durationMinutes: number) => ({
  publicId,
  slug: `invented-${publicId}`,
  title: `Invented ${publicId}`,
  preview: false,
  durationMinutes,
});
const COURSE: CourseOutline = {
  slug: 'invented',
  title: 'Invented course',
  level: 'basic',
  modules: [
    { title: 'Empty', lessons: [], drills: [] },
    { title: 'One', lessons: [lesson('a', 150)], drills: [] },
    { title: 'Two', lessons: [lesson('b', 30), lesson('c', 45)], drills: [] },
  ],
};
const [EMPTY, ONE, TWO] = COURSE.modules as [
  CourseOutline['modules'][number],
  CourseOutline['modules'][number],
  CourseOutline['modules'][number],
];

describe('course progress', () => {
  it('counts a module done only when all its lessons are', () => {
    expect(isModuleDone(EMPTY, new Set())).toBe(false);
    expect(isModuleDone(TWO, new Set(['b']))).toBe(false);
    expect(isModuleDone(TWO, new Set(['b', 'c']))).toBe(true);
  });

  it('adds up a module reading time', () => {
    expect(moduleMinutes(ONE)).toBe(150);
    expect(moduleMinutes(TWO)).toBe(75);
  });

  it('numbers modules by their place and skips those without lessons', () => {
    expect(readableModules(COURSE).map(({ number, first }) => [number, first.publicId])).toEqual([
      [2, 'a'],
      [3, 'b'],
    ]);
  });
});
