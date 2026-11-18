import { ERRORS } from '@siliconbox/shared';

/** The message from an API error body (`{ error: { message } }`), or the generic one. */
export async function errorMessage(response: Response | null): Promise<string> {
  const body = (await response?.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? ERRORS.INTERNAL.message;
}

/** A call to our API as a form result: no error when it succeeded, else the API's message. */
export async function apiResult(
  response: Response | null,
): Promise<{ error: { message: string } | null }> {
  return response?.ok === true
    ? { error: null }
    : { error: { message: await errorMessage(response) } };
}
