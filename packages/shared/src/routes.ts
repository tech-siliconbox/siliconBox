/** Every page and API path the apps link to or call. */
export const ROUTES = {
  home: '/',
  pricing: '/pricing',
  questions: '/questions',
  question: (slug: string) => `/questions/${slug}`,
  industryReady: '/industry-ready',
  resumeBuilder: '/industry-ready/resume-builder',
  cvScreening: '/industry-ready/cv-screening',
  courses: '/courses',
  course: (slug: string) => `/courses/${slug}`,
  // Page addresses are readable slugs; database and public ids stay out of them.
  lesson: (course: string, lesson: string) => `/courses/${course}/${lesson}`,
  lessonPreview: (lesson: string) => `/preview/lessons/${lesson}`,
  drill: (course: string, drill: string) => `/courses/${course}/drills/${drill}`,
  watermarkTrace: '/admin-tools/trace',
  capstoneReviews: '/admin-tools/capstones',
  capstoneReview: (submission: string) => `/admin-tools/capstones/${submission}`,
  capstoneFile: (submission: string) => `/admin-tools/capstones/${submission}/file`,
  signIn: '/sign-in',
  signUp: '/sign-up',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/dashboard',
  performance: '/performance',
  activity: '/activity',
  settings: '/settings',
  help: '/help',
} as const;

export const API_ROUTES = {
  me: '/api/v1/me',
  dataExport: '/api/v1/me/export',
  profile: '/api/v1/profile',
  profilePhoto: '/api/v1/profile/photo',
  assessmentAttempts: (assessmentId: string) => `/api/v1/assessments/${assessmentId}/attempts`,
  capstoneSubmission: (capstoneId: string) => `/api/v1/capstones/${capstoneId}/submission`,
  progress: '/api/v1/progress',
  services: '/api/v1/services',
  resume: '/api/v1/resume',
  resumePdf: '/api/v1/resume/pdf',
  resumeCheck: '/api/v1/resume/check',
  cvScreenings: '/api/v1/cv-screenings',
  cvScreeningFile: (screeningId: string) => `/api/v1/cv-screenings/${screeningId}/file`,
  cvScreeningFeedback: (screeningId: string) => `/api/v1/cv-screenings/${screeningId}/feedback`,
  drillRuns: (drillId: string) => `/api/v1/drills/${drillId}/runs`,
  run: (runId: string) => `/api/v1/runs/${runId}`,
} as const;

/** Query value the sign-in page reads to explain a sign-out caused by another device. */
export const SIGNED_OUT_ELSEWHERE = 'replaced';

/** Query value the sign-in page reads after a password reset. */
export const PASSWORD_CHANGED = 'password-changed';

/** Query value the sign-in page reads after the learner deleted their account. */
export const ACCOUNT_DELETED = 'account-deleted';

/** Google sign-in error code for an email that already has a password account. */
const GOOGLE_ACCOUNT_NOT_LINKED = 'account_not_linked';

/** Why Google sign-in did not finish, from the error code it sends back to the sign-in page. */
export function googleSignInMessage(code: string): string {
  return code === GOOGLE_ACCOUNT_NOT_LINKED
    ? 'This email already has a SiliconBox account. Sign in with your email and password.'
    : 'Google sign-in did not finish. Please try again.';
}
