/** Every page and API path the apps link to or call. */
export const ROUTES = {
  home: '/',
  pricing: '/pricing',
  questions: '/questions',
  question: (slug: string) => `/questions/${slug}`,
  industryReady: '/industry-ready',
  resumeBuilder: '/industry-ready/resume-builder',
  cvScreening: '/industry-ready/cv-screening',
  // Praman, the formal tool page (ADR 0031).
  tool: '/tool',
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
  resumes: '/api/v1/resumes',
  resume: (resumeId: string) => `/api/v1/resumes/${resumeId}`,
  resumePdf: (resumeId: string) => `/api/v1/resumes/${resumeId}/pdf`,
  resumeDocx: (resumeId: string) => `/api/v1/resumes/${resumeId}/docx`,
  resumeCheck: (resumeId: string) => `/api/v1/resumes/${resumeId}/check`,
  resumeTailor: (resumeId: string) => `/api/v1/resumes/${resumeId}/tailor`,
  resumeImportLinkedIn: '/api/v1/resumes/import/linkedin',
  resumeImportAi: '/api/v1/resumes/import/ai',
  cvScreenings: '/api/v1/cv-screenings',
  cvScreeningFile: (screeningId: string) => `/api/v1/cv-screenings/${screeningId}/file`,
  cvScreeningFeedback: (screeningId: string) => `/api/v1/cv-screenings/${screeningId}/feedback`,
  drillRuns: (drillId: string) => `/api/v1/drills/${drillId}/runs`,
  run: (runId: string) => `/api/v1/runs/${runId}`,
  // Praman, the formal tool page (ADR 0031).
  toolSessions: '/api/v1/tool/sessions',
  toolSession: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}`,
  toolSessionOpen: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/open`,
  toolSessionPoll: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/poll`,
  toolSessionCommands: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/commands`,
  toolSessionStop: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/stop`,
  toolSessionFiles: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/files`,
  toolSessionTrace: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/trace`,
  toolSessionScript: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/script`,
  toolSessionExample: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/example`,
  toolSessionWhatIf: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/what-if`,
  toolSessionWhatIfResult: (sessionId: string, requestId: string) =>
    `/api/v1/tool/sessions/${sessionId}/what-if/${requestId}`,
  toolSessionDrivers: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/drivers`,
  toolSessionCoverageTrace: (sessionId: string) =>
    `/api/v1/tool/sessions/${sessionId}/coverage-trace`,
  toolSessionEquivalenceTrace: (sessionId: string) =>
    `/api/v1/tool/sessions/${sessionId}/equivalence-trace`,
  toolSessionReport: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/report`,
  toolSessionSignalLists: (sessionId: string) => `/api/v1/tool/sessions/${sessionId}/signal-lists`,
  toolRuns: '/api/v1/tool/runs',
  toolRun: (runId: string) => `/api/v1/tool/runs/${runId}`,
  toolRunTrace: (runId: string) => `/api/v1/tool/runs/${runId}/trace`,
  toolRunDiff: (runId: string) => `/api/v1/tool/runs/${runId}/diff`,
  toolRunRestore: (runId: string) => `/api/v1/tool/runs/${runId}/restore`,
  toolRunLog: (runId: string) => `/api/v1/tool/runs/${runId}/log`,
  toolRunFiles: (runId: string) => `/api/v1/tool/runs/${runId}/files`,
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
