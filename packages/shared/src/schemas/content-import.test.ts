import { describe, expect, it } from 'vitest';
import { ContentImportSchema } from './content-import';

const lesson = {
  slug: 'basic-module-01-lesson-01',
  title: 'Invented lesson',
  order: 1,
  blocks: [{ blockType: 'paragraph', text: 'Invented text.' }],
};
const module = { slug: 'basic-module-01', title: 'Invented module', order: 1, lessons: [lesson] };
const course = {
  slug: 'basic',
  title: 'Invented course',
  level: 'basic',
  order: 1,
  modules: [module],
};

const drill = {
  slug: 'basic-drill-01',
  title: 'Invented Drill',
  order: 1,
  mode: 'bmc',
  solver: 'boolector',
  target: 'FAIL',
  depth: 20,
  timeoutSeconds: 60,
  topModule: 'counter',
  brief: [{ blockType: 'paragraph', text: 'Invented brief.' }],
  designCode: 'module counter; endmodule',
  starterCode: 'module counter_props; endmodule',
  private: {
    referenceSolution: 'module counter_props; endmodule',
    bugVariants: [{ name: 'invented bug', code: 'module counter; endmodule' }],
  },
};

describe('ContentImportSchema', () => {
  it('accepts a module of Drills only, as a draft', () => {
    const drillsOnly = {
      slug: 'basic-module-01',
      title: 'Invented module',
      order: 1,
      drills: [drill],
    };
    const parsed = ContentImportSchema.parse({ courses: [{ ...course, modules: [drillsOnly] }] });
    expect(parsed.courses[0]?.modules[0]?.lessons).toEqual([]);
    expect(parsed.courses[0]?.modules[0]?.drills[0]?.status).toBe('draft');
  });

  it('accepts a course tree and defaults to drafts', () => {
    const parsed = ContentImportSchema.parse({ courses: [course] });
    expect(parsed.courses[0]?.status).toBe('draft');
    expect(parsed.courses[0]?.modules[0]?.lessons[0]?.preview).toBe(false);
  });

  it.each([
    ['an unknown field', { courses: [{ ...course, price: 1 }] }],
    [
      'a module with nothing in it',
      { courses: [{ ...course, modules: [{ ...module, lessons: [] }] }] },
    ],
    [
      'a Drill without bug variants',
      {
        courses: [
          {
            ...course,
            modules: [
              { ...module, drills: [{ ...drill, private: { ...drill.private, bugVariants: [] } }] },
            ],
          },
        ],
      },
    ],
    [
      'a Drill with an unsafe top module',
      {
        courses: [
          { ...course, modules: [{ ...module, drills: [{ ...drill, topModule: 'x; rm' }] }] },
        ],
      },
    ],
    ['a slug with spaces', { courses: [{ ...course, slug: 'Basic Course' }] }],
    ['an unknown level', { courses: [{ ...course, level: 'expert' }] }],
    [
      'a lesson without blocks',
      { courses: [{ ...course, modules: [{ ...module, lessons: [{ ...lesson, blocks: [] }] }] }] },
    ],
    [
      'a video block',
      {
        courses: [
          {
            ...course,
            modules: [{ ...module, lessons: [{ ...lesson, blocks: [{ blockType: 'video' }] }] }],
          },
        ],
      },
    ],
    [
      'a repeated module slug',
      { courses: [{ ...course, modules: [module, { ...module, order: 2 }] }] },
    ],
  ])('rejects %s', (_label, input) => {
    expect(ContentImportSchema.safeParse(input).success).toBe(false);
  });
});
