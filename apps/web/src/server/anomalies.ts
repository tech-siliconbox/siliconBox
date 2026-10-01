import 'server-only';
import type { AlertKind } from '@siliconbox/shared';

// Automation tools announce themselves in the user agent unless deliberately disguised.
const HEADLESS_AGENT =
  /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|python-requests|curl\/|wget\//i;

/** The client country set by the edge (Vercel or Cloudflare), or null when there is none. */
export function clientCountry(headers: Headers): string | null {
  return headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry');
}

/** Anomalies in one sign-in, compared with the learner's previous sign-in country. */
export function signInAnomalies(signIn: {
  userAgent: string | null;
  country: string | null;
  previousCountry: string | null;
}): AlertKind[] {
  const alerts: AlertKind[] = [];
  if (signIn.userAgent !== null && HEADLESS_AGENT.test(signIn.userAgent))
    alerts.push('headless_browser');
  const { country, previousCountry } = signIn;
  if (country !== null && previousCountry !== null && country !== previousCountry) {
    alerts.push('signin_new_country');
  }
  return alerts;
}
