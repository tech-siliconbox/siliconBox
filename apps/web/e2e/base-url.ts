/** The site the tests run against; another port lets them run beside a dev server. */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
