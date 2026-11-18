import { describe, expect, it } from 'vitest';
import { type CoursePage, convertCourse } from './course';

// Invented pages in the course's HTML shape; no real course text.
const page = (title: string, body: string) =>
  `<!DOCTYPE html><html><head><title>${title} | Invented Course</title></head><body><header class="site-header">Site</header><main><article class="card">${body}</article></main><script src="x.js"></script></body></html>`;

const INDEX = page(
  'Invented Course',
  `<span class="module-tag">Level 1</span><h1>Invented Course</h1><p class="lead">An invented summary.</p>
  <ol class="module-list"><li><a href="01-a.html"><strong>Invented module</strong></a></li></ol>`,
);
const MODULE = page(
  'Module 1: Invented Module',
  `<span class="module-tag">Basic · Module 1 of 1</span><h1>Invented Module</h1>
  <p class="lead">Invented lead.</p><p class="meta">Estimated time: 2.5 hours</p>
  <div class="callout warn"><span class="title">Careful</span>Invented warning.</div>
  <pre><code>assert property (p);  <span class="c">// comment</span></code></pre>
  <figure><svg viewBox="0 0 10 10" style="width:100%;max-width:640px"><rect class="fl-box" width="5" height="5"/></svg></figure>
  <div class="lab"><h2>Lab 1: Invented lab</h2><ol><li>Do it.</li></ol></div>
  <script src="../assets/figure.js"></script>
  <div class="nav-bar"><a href="index.html">Course home</a></div>`,
);
const CSS = `:root { --brand: #0b5fff; }
body { color: #111; }
main { max-width: 900px; }
.callout.warn { background: #fff4e0; }
.fv-flow .fl-box { fill: #eef4ff; stroke: var(--brand); }`;

const { content, notes } = convertCourse(
  {
    pages: [
      { file: 'index.html', html: INDEX },
      { file: '01-a.html', html: MODULE },
    ] as CoursePage[],
    stylesheet: CSS,
    stateGraphScript: null,
  },
  {
    slug: 'basic',
    level: 'basic',
    order: 1,
    drillsByModule: new Map([['basic-module-01', ['basic-module-01-drill-01']]]),
  },
);
const [course] = content.courses;
const [module] = course?.modules ?? [];
const [lesson] = module?.lessons ?? [];

describe('convertCourse: one page per module, all content kept', () => {
  it('keeps the course home as the introduction, links rewritten', () => {
    expect(course).toMatchObject({
      slug: 'basic',
      title: 'Invented Course',
      summary: 'An invented summary.',
    });
    expect(course?.introduction).toContain('<span class="module-tag">Level 1</span>');
    expect(course?.introduction).toContain('href="lesson:invented-module"');
    expect(course?.introduction).not.toContain('site-header');
  });

  it('makes each module page one lesson, free for the first module', () => {
    expect(module).toMatchObject({
      slug: 'basic-module-01',
      title: 'Invented Module',
      summary: 'Invented lead.',
    });
    expect(lesson).toMatchObject({
      slug: 'invented-module',
      title: 'Module 1: Invented Module',
      preview: true,
      durationMinutes: 150,
    });
  });

  it('keeps the markup as written and puts the Drill right after the lab', () => {
    const [markup, drill, rest] = lesson?.blocks ?? [];
    expect(markup?.blockType).toBe('html');
    const html = markup?.blockType === 'html' ? markup.html : '';
    expect(html).toContain(
      '<div class="callout warn"><span class="title">Careful</span>Invented warning.</div>',
    );
    expect(html).toContain('<span class="c">// comment</span>');
    expect(html).toContain('<h2>Lab 1: Invented lab</h2>');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('<script');
    expect(drill).toEqual({ blockType: 'drillEmbed', drill: 'basic-module-01-drill-01' });
    expect(rest?.blockType === 'html' && rest.html).toContain('href="course:basic"');
  });

  it('draws diagrams in the course colours without the course stylesheet', () => {
    const html = lesson?.blocks[0]?.blockType === 'html' ? lesson.blocks[0].html : '';
    expect(course).not.toHaveProperty('stylesheet');
    expect(html).toContain(
      '<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="#eef4ff" stroke="#0b5fff"/>',
    );
    expect(html).not.toContain('class="fl-box"');
    expect(notes).toContain('01-a.html: diagram inline style dropped (the site sizes diagrams)');
    expect(notes).toContain(
      '01-a.html: a script was removed (the interactive figure is rebuilt as a block)',
    );
  });
});

// An invented last module: a capstone rubric and a two-question assessment with its key.
const FINAL = page(
  'Module 2: Invented Finale',
  `<h1>Invented Finale</h1>
  <h2>2.1 Capstone project</h2><p>Build an invented thing.</p>
  <h2>2.2 Grading rubric (100 points)</h2>
  <table><thead><tr><th>Criterion</th><th>Points</th><th>What earns full marks</th></tr></thead>
  <tbody><tr><td>Plan</td><td>40</td><td>Every <code>req</code> covered</td></tr>
  <tr><td>Report</td><td>60</td><td>Clear</td></tr></tbody></table>
  <p>A score of <strong>70 or more</strong> is required to pass the capstone.</p>
  <h2>2.3 Assessment: 2 questions</h2>
  <p>Choose the best answer. The answer key is at the end. Passing score: <strong>1 of 2</strong>.</p>
  <h3>Invented topic</h3>
  <ol><li>Which is <em>invented</em>?<ul><li>A) This</li><li>B) That</li></ul></li>
  <li>Second?<ul><li>A) Yes</li><li>B) No</li></ul></li></ol>
  <h3>Answer key</h3>
  <details><summary>Show</summary><table><thead><tr><th>Q</th><th>Answer</th><th>Why</th></tr></thead>
  <tbody><tr><td>1</td><td>B</td><td>Because <code>that</code>.</td></tr><tr><td>2</td><td>A</td><td>Yes.</td></tr></tbody></table></details>
  <h2>2.4 What next</h2><p>Invented ending.</p>`,
);

describe('convertCourse: graded course work (ADR 0029)', () => {
  const converted = convertCourse(
    {
      pages: [
        { file: 'index.html', html: INDEX },
        { file: '01-a.html', html: MODULE },
        { file: '02-b.html', html: FINAL },
      ],
      stylesheet: CSS,
      stateGraphScript: null,
    },
    { slug: 'basic', level: 'basic', order: 1, drillsByModule: new Map() },
  );
  const finale = converted.content.courses[0]?.modules[1];
  const blocks = finale?.lessons[0]?.blocks ?? [];
  const html = blocks.map((block) => (block.blockType === 'html' ? block.html : '')).join('');

  it('takes the questions and the key out of the page into a graded assessment', () => {
    expect(finale?.assessment).toMatchObject({
      slug: 'basic-module-02-assessment',
      title: 'Assessment: 2 questions',
      passMark: 1,
      status: 'published',
      key: [
        { correct: 'B', why: 'Because <code>that</code>.' },
        { correct: 'A', why: 'Yes.' },
      ],
    });
    expect(finale?.assessment?.questions[0]).toEqual({
      topic: 'Invented topic',
      html: 'Which is <em>invented</em>?',
      options: [{ html: 'This' }, { html: 'That' }],
    });
    expect(html).not.toContain('Answer key');
    expect(html).not.toContain('Which is');
    expect(html).toContain('2.3 Assessment: 2 questions');
    expect(html).toContain('Invented ending.');
  });

  it('makes the rubric the capstone and puts both blocks where they stood', () => {
    expect(finale?.capstone).toMatchObject({
      slug: 'basic-module-02-capstone',
      title: 'Capstone project',
      passMark: 70,
      rubric: [
        { criterion: 'Plan', points: 40, fullMarks: 'Every <code>req</code> covered' },
        { criterion: 'Report', points: 60, fullMarks: 'Clear' },
      ],
    });
    expect(blocks.map((block) => block.blockType)).toEqual([
      'html',
      'capstoneEmbed',
      'html',
      'assessmentEmbed',
      'html',
    ]);
    expect(html).toContain('A score of <strong>70 or more</strong>');
    expect(converted.notes.some((note) => note.includes('graded assessment'))).toBe(true);
  });
});
