import { ROUTES } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import {
  linkedLessonSlugs,
  markCourseHtml,
  resolveCourseLinks,
  sanitizeCourseHtml,
} from './course-html';
import { findMarks } from './invisible-mark';

// Invented markup in the shape of an author's course page; no real course text.

describe('sanitizeCourseHtml', () => {
  it('keeps the page structure, classes and drawings', () => {
    const page =
      '<div class="callout warn"><span class="title">Careful</span><p>Invented <code>x</code>.</p></div>' +
      '<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>' +
      '<details><summary>Show answer</summary><p>Invented.</p></details>' +
      '<figure><svg viewBox="0 0 10 10"><rect width="5" height="5" fill="#eef4ff"/></svg></figure>';
    const clean = sanitizeCourseHtml(page);
    expect(clean).toContain('<div class="callout warn"><span class="title">Careful</span>');
    expect(clean).toContain('<td colspan="2">cell</td>');
    expect(clean).toContain('<summary>Show answer</summary>');
    expect(clean).toContain('<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="#eef4ff"');
  });

  it.each([
    ['a script', '<p>a</p><script>alert(1)</script>', /script|alert/],
    ['an event handler', '<p onclick="alert(1)">a</p>', /onclick|alert/],
    ['an inline style', '<p style="display:none">a</p>', /style/],
    ['a javascript link', '<a href="javascript:alert(1)">a</a>', /javascript/],
    ['a plain http link', '<a href="http://example.test/">a</a>', /http:/],
    ['a frame', '<iframe src="https://example.test/"></iframe>', /iframe/],
    ['an image', '<img src="https://example.test/x.png" onerror="alert(1)">', /img|onerror/],
    ['a form', '<form action="https://example.test/"><input name="x"></form>', /form|input/],
    ['a style sheet', '<style>p { color: red }</style><p>a</p>', /style|color/],
  ])('removes %s', (_name, html, banned) => {
    expect(sanitizeCourseHtml(html)).not.toMatch(banned);
  });
});

describe('course links', () => {
  const html =
    '<a href="lesson:basic-module-02-lesson-01">next</a>' +
    '<a href="lesson:basic-module-09-lesson-01">later</a><a href="course:basic">home</a>';

  it('finds the lessons a page links to', () => {
    expect(linkedLessonSlugs(html)).toEqual([
      'basic-module-02-lesson-01',
      'basic-module-09-lesson-01',
    ]);
  });

  it('points links at lesson and course pages; an unpublished lesson links nowhere', () => {
    const resolved = resolveCourseLinks(html, new Map([['basic-module-02-lesson-01', 'abc-123']]));
    expect(resolved).toContain(`href="${ROUTES.lesson('abc-123')}"`);
    expect(resolved).toContain('href="#"');
    expect(resolved).toContain(`href="${ROUTES.course('basic')}"`);
    expect(resolved).not.toMatch(/lesson:|course:/);
  });
});

describe('markCourseHtml', () => {
  const CODE = 0x5eed_c0de;
  const html =
    '<p>Invented passage text.</p><ul><li><strong>Bold</strong> start</li></ul>' +
    '<pre><code>assert property (p);</code></pre><p>Uses <code>x</code> inline.</p>' +
    '<svg viewBox="0 0 1 1"><text>label</text></svg>';
  const marked = markCourseHtml(html, CODE);

  it('marks each passage with the learner code', () => {
    expect(findMarks(marked)).toEqual([CODE, CODE, CODE]);
  });

  it('leaves code and drawings untouched, and the visible text the same', () => {
    expect(marked).toContain('<pre><code>assert property (p);</code></pre>');
    expect(marked).toContain('<text>label</text>');
    expect(marked.replace(/[\u2063\u200B\u200C]/g, '')).toBe(html);
  });
});
