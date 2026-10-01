import { ROUTES } from '@siliconbox/shared';

/** The site's main sections, shown in the header and the footer. */
export const NAV_LINKS = [
  { href: ROUTES.courses, label: 'Courses' },
  { href: ROUTES.questions, label: 'Questions' },
  { href: ROUTES.industryReady, label: 'Industry Ready' },
  { href: ROUTES.pricing, label: 'Pricing' },
] as const;
