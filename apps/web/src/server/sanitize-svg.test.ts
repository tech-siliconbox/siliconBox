import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './sanitize-svg';

describe('sanitizeSvg', () => {
  it('keeps a drawing with its camelCase attributes', () => {
    const svg =
      '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="none"/></svg>';
    const clean = sanitizeSvg(svg);
    expect(clean).toContain('viewBox="0 0 10 10"');
    expect(clean).toContain('<rect');
  });

  it.each([
    ['a script element', '<svg><script>alert(1)</script></svg>', /script|alert/],
    ['an event handler', '<svg onload="alert(1)"><rect/></svg>', /onload/],
    [
      'a javascript link',
      '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
      /javascript|<a/,
    ],
    [
      'foreign HTML',
      '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
      /foreignObject|onerror|<img/,
    ],
    ['an external reference', '<svg><use href="https://evil.example/x.svg#a"/></svg>', /evil|<use/],
    [
      'an inline style',
      '<svg style="background:url(https://evil.example)"><rect/></svg>',
      /style|evil/,
    ],
  ])('removes %s', (_label, svg, forbidden) => {
    expect(sanitizeSvg(svg)).not.toMatch(forbidden);
  });
});
