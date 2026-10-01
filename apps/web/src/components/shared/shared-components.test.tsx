import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompanyTag } from './company-tag';
import { LockedCard } from './locked-card';
import { Watermarked } from './watermarked';

describe('Watermarked', () => {
  it('renders the content and a hidden, non-interactive mark over it', () => {
    const html = renderToStaticMarkup(
      <Watermarked mark="ab34cd · pri…@example.test · 2026-11-15">
        <p>Invented lesson text</p>
      </Watermarked>,
    );
    expect(html).toContain('Invented lesson text');
    expect(html).toMatch(/<svg aria-hidden="true" data-watermark=""[^>]*pointer-events-none/);
    expect(html).toContain('ab34cd · pri…@example.test · 2026-11-15');
  });

  it('escapes a mark that looks like markup', () => {
    const html = renderToStaticMarkup(<Watermarked mark={'<script>x</script>'}>ok</Watermarked>);
    expect(html).not.toContain('<script>');
  });
});

describe('LockedCard', () => {
  it('states that it is locked and why', () => {
    const html = renderToStaticMarkup(
      <LockedCard title="Mock interview" reason="This service is not available yet." />,
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Locked');
    expect(html).toContain('This service is not available yet.');
  });
});

describe('CompanyTag', () => {
  it('always shows the name, and the logo only when one is approved', () => {
    expect(renderToStaticMarkup(<CompanyTag name="Example Semiconductors" />)).not.toContain(
      '<img',
    );
    const withLogo = renderToStaticMarkup(
      <CompanyTag name="Example Semiconductors" logoUrl="/logos/example.png" />,
    );
    expect(withLogo).toContain('<img');
    expect(withLogo).toContain('Example Semiconductors');
  });
});
