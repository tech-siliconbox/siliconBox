import { ERRORS } from '@siliconbox/shared';

/** The message from an API error body (`{ error: { message } }`), or the generic one. */
export async function errorMessage(response: Response | null): Promise<string> {
  const body = (await response?.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? ERRORS.INTERNAL.message;
}

/** Calls our API from a form: no error when it succeeded, else the API's own message. */
export async function sendToApi(
  url: string,
  init: RequestInit,
): Promise<{ error: { message: string } | null }> {
  const response = await fetch(url, init).catch(() => null);
  return response?.ok === true
    ? { error: null }
    : { error: { message: await errorMessage(response) } };
}
