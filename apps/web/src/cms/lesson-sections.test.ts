import { describe, expect, it } from 'vitest';
import { deriveSections } from './lesson-sections';

// Invented markup in the shape of an author's module page; no real course text.
const words = (n: number) => Array.from({ length: n }, () => 'invented').join(' ');
const PAGE = `<h1>Invented module</h1><p>${words(50)}</p>
<h2>1.1 Invented idea</h2><p>${words(200)}</p>
<pre><code>line
line
line</code></pre>
<h2 id="kept-id">1.2 Invented idea</h2><p>${words(100)}</p>
<details><summary>Show answer</summary><p>${words(5000)}</p></details>
<div class="lab"><h2>Lab 1: Invented lab</h2><ol><li>${words(100)}</li></ol></div>`;
const AFTER = `<h2>Quick quiz</h2><p>${words(50)}</p><h2>Summary</h2><p>${words(50)}</p>
<svg viewBox="0 0 10 10"><rect width="5" height="5"/><text>label</text></svg>`;

const derive = (total: number | null) =>
  deriveSections(
    [
      { blockType: 'html', html: PAGE },
      { blockType: 'drillEmbed', drill: 'invented-drill' },
      { blockType: 'html', html: AFTER },
    ],
    total,
  );

describe('deriveSections', () => {
  const { blocks, sections } = derive(180);

  it('names each part, keeps an author id and tells theory from lab and practice', () => {
    expect(sections.map(({ anchor, kind, hasDrill }) => [anchor, kind, hasDrill])).toEqual([
      ['section-1-1-invented-idea', 'theory', false],
      ['kept-id', 'theory', false],
      ['section-lab-1-invented-lab', 'lab', true],
      ['section-quick-quiz', 'practice', false],
      ['section-summary', 'theory', false],
    ]);
  });

  it('writes the anchors into the page and keeps drawings intact', () => {
    const html = blocks.map((block) => ('html' in block ? block.html : '')).join('');
    expect(html).toContain('<h2 id="section-1-1-invented-idea">1.1 Invented idea</h2>');
    expect(html).toContain(
      '<svg viewBox="0 0 10 10"><rect width="5" height="5"/><text>label</text>',
    );
  });

  it('shares the time by size, hands-on parts weighted up, hidden answers left out', () => {
    const minutes = sections.map((section) => section.minutes ?? 0);
    expect(minutes.reduce((a, b) => a + b)).toBe(180);
    expect(minutes.every((m) => m % 5 === 0)).toBe(true);
    const [idea, , lab] = minutes;
    // The lab holds fewer words than 1.1 but is worked through on the tool.
    expect(lab).toBeGreaterThan(idea ?? 0);
    // 1.2 is not inflated by the 5 000 words hidden behind "Show answer".
    expect(minutes[1]).toBeLessThan(idea ?? 0);
  });

  it('gives no times when the lesson has none, and no parts without headings', () => {
    expect(derive(null).sections.every((section) => section.minutes === null)).toBe(true);
    expect(deriveSections([{ blockType: 'paragraph', text: 'x' }], 30).sections).toEqual([]);
  });

  it('makes repeated titles unique', () => {
    const twice = '<h2>Summary</h2><p>a</p><h2>Summary</h2><p>b</p>';
    const anchors = deriveSections([{ blockType: 'html', html: twice }], 10).sections;
    expect(anchors.map((section) => section.anchor)).toEqual([
      'section-summary',
      'section-summary-2',
    ]);
  });
});
