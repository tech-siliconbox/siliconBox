import { describe, expect, it } from 'vitest';
import { type CoursePage, convertCourse } from './course';
import { readSvgRules } from './svg-styles';

// Invented pages in the course's HTML shape; no real course text.
const page = (body: string) =>
  `<!DOCTYPE html><html><head><title>x</title></head><body><header class="site-header">Site</header><main><article class="card">${body}<div class="nav-bar"><a href="index.html">Home</a></div></article></main></body></html>`;

const INDEX = page(`
  <span class="module-tag">Invented tag</span>
  <h1>Invented Course</h1>
  <p class="lead">An invented summary.</p>
  <h2>Who is this for?</h2>
  <ol class="module-list"><li><span class="num">1</span><a href="01-a.html"><strong>Invented module</strong></a><span class="pill">2 h</span>
    <span class="desc">What it covers.</span></li></ol>`);

const MODULE = page(`
  <h1>Invented Module</h1>
  <p class="lead">Invented lead.</p>
  <h2>1.1 First section</h2>
  <p>Uses <code>a [*3]</code>, <strong>bold </strong>and 2<sup>n</sup> states.</p>
  <div class="callout warn"><span class="title">Invented title</span>Body text.<ul><li>one</li><li>two</li></ul></div>
  <div class="filename">invented.sby</div>
  <pre><code>[options]
mode bmc  <span class="c"># comment</span></code></pre>
  <h2>1.2 Second section</h2>
  <ol>
    <li>Question one?<details><summary>Show answer</summary>Answer one.</details></li>
    <li>Pick one:<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><code>x</code></td><td>y</td></tr></tbody></table></li>
    <li>Last item.</li>
  </ol>
  <details><summary>Show hints</summary><p>Hint text.</p></details>
  <figure class="fv-flow"><svg viewBox="0 0 10 10" aria-label="Invented diagram"><rect class="fl-box" width="5" height="5"/></svg><figcaption><strong>Figure 1.</strong> Caption.</figcaption></figure>
  <h2>Summary</h2><p>Invented summary.</p>
  <h2>Quick quiz</h2><ol><li>Invented question?</li></ol>`);

const CSS = `:root { --line: #123456; }
.fv-flow .fl-box { fill: #fff; stroke: var(--line); stroke-width: 1.5; }`;

const convert = (pages: CoursePage[]) =>
  convertCourse(
    { pages, svgRules: readSvgRules(CSS, 'fv-flow'), stateGraphScript: null },
    { slug: 'basic', level: 'basic', order: 1 },
  );

describe('convertCourse', () => {
  const { content, notes } = convert([
    { file: 'index.html', html: INDEX },
    { file: '01-a.html', html: MODULE },
  ]);
  const [course] = content.courses;
  const [module] = course?.modules ?? [];
  const [overview, first, second, review] = module?.lessons ?? [];

  it('takes the course and module from the pages, and leaves out site chrome', () => {
    expect(course).toMatchObject({
      slug: 'basic',
      title: 'Invented Course',
      summary: 'An invented summary.',
    });
    expect(module).toMatchObject({
      slug: 'basic-module-01',
      title: 'Invented Module',
      summary: 'Invented lead.',
    });
    expect(JSON.stringify(content)).not.toMatch(/Invented tag|Site|Home/);
  });

  it('opens with the course overview, then one lesson per section; the first two are free', () => {
    expect(module?.lessons.map((lesson) => [lesson.slug, lesson.title, lesson.preview])).toEqual([
      ['basic-module-01-lesson-01', 'Course overview', true],
      ['basic-module-01-lesson-02', '1.1 First section', true],
      ['basic-module-01-lesson-03', '1.2 Second section', false],
      ['basic-module-01-lesson-04', 'Summary · Quick quiz', false],
    ]);
    expect(overview?.blocks).toContainEqual({
      blockType: 'list',
      ordered: true,
      items: [{ text: '**Invented module** · 2 h\n\nWhat it covers.' }],
    });
  });

  it('keeps the text and its formatting', () => {
    expect(first?.blocks).toEqual([
      { blockType: 'paragraph', text: 'Invented lead.' },
      { blockType: 'paragraph', text: 'Uses `a [*3]`, **bold** and 2ⁿ states.' },
      {
        blockType: 'callout',
        tone: 'warning',
        title: 'Invented title',
        text: 'Body text.\n\n- one\n- two',
      },
      {
        blockType: 'code',
        language: 'sby',
        code: '[options]\nmode bmc  # comment',
        filename: 'invented.sby',
      },
    ]);
  });

  it('places a table after its list item and continues the numbering', () => {
    expect(second?.blocks.slice(0, 3)).toEqual([
      {
        blockType: 'list',
        ordered: true,
        items: [{ text: 'Question one?', answer: 'Answer one.' }, { text: 'Pick one:' }],
      },
      {
        blockType: 'table',
        columns: [{ text: 'A' }, { text: 'B' }],
        rows: [{ cells: [{ text: '`x`' }, { text: 'y' }] }],
      },
      { blockType: 'list', ordered: true, start: 3, items: [{ text: 'Last item.' }] },
    ]);
    expect(notes).toContain(
      '01-a.html: a table inside a list item now follows that item, and the list continues',
    );
  });

  it('turns hints into a reveal and writes diagram styles onto the SVG', () => {
    expect(second?.blocks[3]).toEqual({
      blockType: 'reveal',
      label: 'Show hints',
      content: [{ blockType: 'paragraph', text: 'Hint text.' }],
    });
    expect(second?.blocks[4]).toEqual({
      blockType: 'diagram',
      svg: '<svg viewBox="0 0 10 10" aria-label="Invented diagram"><rect width="5" height="5" fill="#fff" stroke="#123456" stroke-width="1.5"/></svg>',
      alt: 'Invented diagram',
      caption: '**Figure 1.** Caption.',
    });
  });

  it('merges the closing review sections into one lesson, keeping each heading', () => {
    expect(review?.blocks).toEqual([
      { blockType: 'heading', level: '2', text: 'Summary' },
      { blockType: 'paragraph', text: 'Invented summary.' },
      { blockType: 'heading', level: '2', text: 'Quick quiz' },
      { blockType: 'list', ordered: true, items: [{ text: 'Invented question?' }] },
    ]);
  });
});
