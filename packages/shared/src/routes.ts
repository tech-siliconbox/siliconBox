/** Every page and API path the apps link to or call. */
export const ROUTES = {
  home: '/',
  pricing: '/pricing',
  questions: '/questions',
  industryReady: '/industry-ready',
  courses: '/courses',
  course: (slug: string) => `/courses/${slug}`,
  lesson: (publicId: string) => `/learn/${publicId}`,
  lessonPreview: (cmsId: string) => `/preview/lessons/${cmsId}`,
  signIn: '/sign-in',
  signInTwoFactor: '/sign-in/two-factor',
  signUp: '/sign-up',
  account: '/account',
} as const;

export const API_ROUTES = {
  me: '/api/v1/me',
  progress: '/api/v1/progress',
  services: '/api/v1/services',
} as const;

/** Query value the sign-in page reads to explain a sign-out caused by another device. */
export const SIGNED_OUT_ELSEWHERE = 'replaced';
