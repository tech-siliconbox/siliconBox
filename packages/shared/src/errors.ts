/**
 * Stable error codes with their HTTP status and the only message a client ever sees.
 * Detail stays in the server log.
 */
export const ERRORS = {
  UNAUTHENTICATED: { status: 401, message: 'Please sign in to continue.' },
  SESSION_REPLACED: {
    status: 401,
    message: 'You were signed out because your account signed in on another device.',
  },
  FORBIDDEN: { status: 403, message: 'You do not have access to this.' },
  NOT_ENTITLED: { status: 403, message: 'Your current access does not include this.' },
  NOT_FOUND: { status: 404, message: 'Not found.' },
  VALIDATION_FAILED: { status: 400, message: 'The request was not valid.' },
  PURCHASE_NOT_ALLOWED: {
    status: 409,
    message: 'This purchase would not add anything to your current access.',
  },
  SERVICE_LOCKED: { status: 403, message: 'This service is not open yet.' },
  FILE_NOT_SUPPORTED: {
    status: 415,
    message: 'Upload a PDF or Word (.docx) file of up to 5 MB.',
  },
  PHOTO_NOT_SUPPORTED: {
    status: 415,
    message: 'Upload a JPEG, PNG or WebP image of up to 5 MB.',
  },
  ASSESSMENT_CLOSED: {
    status: 409,
    message: 'This assessment is finished for you: you passed it or used every attempt.',
  },
  CAPSTONE_NOT_SUPPORTED: {
    status: 415,
    message: 'Upload your project as one .zip file of up to 10 MB.',
  },
  CAPSTONE_CLOSED: { status: 409, message: 'Your capstone has already passed.' },
  HANDLE_TAKEN: { status: 409, message: 'That handle is taken. Try another.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please wait a moment and try again.' },
  RUN_QUOTA_REACHED: {
    status: 429,
    message: "You have used all of today's Drill runs. They reset tomorrow.",
  },
  SOLVER_BUSY: {
    status: 503,
    message: 'The formal tool is busy or unavailable. Please try again in a minute.',
  },
  INVALID_LINK: { status: 400, message: 'This link has expired or was already used.' },
  EMAIL_NOT_SENT: {
    status: 503,
    message: 'We could not send the email. Please try again in a few minutes.',
  },
  INTERNAL: { status: 500, message: 'Something went wrong. Please try again.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;
