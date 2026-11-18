import { ROUTES } from '@siliconbox/shared';

/** The learner's own pages, in order: the avatar menu and the sidebar both list them. */
export const MEMBER_PAGES = [
  { href: ROUTES.dashboard, label: 'Overview' },
  { href: ROUTES.performance, label: 'Performance' },
  { href: ROUTES.activity, label: 'Activity' },
  { href: ROUTES.settings, label: 'Settings' },
  { href: ROUTES.help, label: 'Help' },
] as const;
