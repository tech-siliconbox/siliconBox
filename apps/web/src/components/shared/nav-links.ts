import { ROUTES } from '@siliconbox/shared';

/** The site's main sections, shown in the header and the footer. */
export const NAV_LINKS = [
  { href: ROUTES.courses, label: 'Courses' },
  { href: ROUTES.questions, label: 'Questions' },
  // The formal tool page carries Praman's own mark in the header.
  { href: ROUTES.tool, label: 'Praman', brand: 'praman' },
  { href: ROUTES.industryReady, label: 'Industry Ready' },
  { href: ROUTES.pricing, label: 'Pricing' },
] as const;
