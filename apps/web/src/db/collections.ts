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
  watermarkCodes: 'watermark_codes',
  courses: 'courses',
  modules: 'modules',
  lessons: 'lessons',
  drills: 'drills',
  runs: 'runs',
  runCache: 'run_cache',
  questions: 'questions',
  companies: 'companies',
  services: 'services',
  resumes: 'resumes',
  cvScreenings: 'cv_screenings',
} as const;
