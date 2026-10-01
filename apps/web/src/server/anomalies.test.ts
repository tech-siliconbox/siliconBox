import { describe, expect, it } from 'vitest';
import { clientCountry, signInAnomalies } from './anomalies';

const browser =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

describe('signInAnomalies', () => {
  it('raises nothing for an ordinary sign-in from the usual country', () => {
    expect(signInAnomalies({ userAgent: browser, country: 'IN', previousCountry: 'IN' })).toEqual(
      [],
    );
  });

  it.each([
    [
      'a headless browser',
      { userAgent: 'Mozilla/5.0 HeadlessChrome/131.0', country: 'IN', previousCountry: 'IN' },
      ['headless_browser'],
    ],
    [
      'a scripted client',
      { userAgent: 'python-requests/2.32', country: null, previousCountry: null },
      ['headless_browser'],
    ],
    [
      'a new country',
      { userAgent: browser, country: 'SG', previousCountry: 'IN' },
      ['signin_new_country'],
    ],
  ] as const)('flags %s', (_label, signIn, expected) => {
    expect(signInAnomalies(signIn)).toEqual(expected);
  });

  it('does not flag a first sign-in or a missing country header', () => {
    expect(signInAnomalies({ userAgent: browser, country: 'IN', previousCountry: null })).toEqual(
      [],
    );
    expect(signInAnomalies({ userAgent: browser, country: null, previousCountry: 'IN' })).toEqual(
      [],
    );
  });
});

describe('clientCountry', () => {
  it('reads the edge country header', () => {
    expect(clientCountry(new Headers({ 'x-vercel-ip-country': 'IN' }))).toBe('IN');
    expect(clientCountry(new Headers({ 'cf-ipcountry': 'SG' }))).toBe('SG');
    expect(clientCountry(new Headers())).toBeNull();
  });
});
