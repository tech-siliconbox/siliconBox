import 'server-only';
import { ERRORS, type ErrorCode } from '@siliconbox/shared';
import { log } from './log';

/** An expected failure with a stable code. `detail` goes to the server log, never the client. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly headers?: Record<string, string>,
  ) {
    super(detail ?? code);
    this.name = 'AppError';
  }
}

/** The single mapper from any thrown value to an HTTP response. */
export function toResponse(error: unknown): Response {
  const appError = error instanceof AppError ? error : undefined;
  const code = appError?.code ?? 'INTERNAL';
  if (code === 'INTERNAL') {
    log('error', 'unhandled_error', {
      error: error instanceof Error ? error.stack : String(error),
    });
  } else if (appError?.detail !== undefined) {
    log('warn', 'request_rejected', { code, detail: appError.detail });
  }
  const { status, message } = ERRORS[code];
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'private, no-store', ...appError?.headers } },
  );
}
