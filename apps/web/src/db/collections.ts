import 'server-only';

/**
 * Collection names used by repositories. Migrations keep their own copies on purpose:
 * a migration is a frozen snapshot and must not change when this file does.
 */
export const COLLECTIONS = {
  users: 'users',
  entitlements: 'entitlements',
  progress: 'progress',
  auditLog: 'audit_log',
  securityAlerts: 'security-alerts',
  endedSessions: 'ended_sessions',
  verifications: 'verifications',
  watermarkCodes: 'watermark_codes',
  courses: 'courses',
  modules: 'modules',
  lessons: 'lessons',
  drills: 'drills',
  // Payload stores the `drill_private` collection under this plural name.
  drillPrivate: 'drill_privates',
  runs: 'runs',
  runCache: 'run_cache',
  questions: 'questions',
  companies: 'companies',
  services: 'services',
  faqs: 'faqs',
  resumes: 'resumes',
  cvScreenings: 'cv_screenings',
} as const;
