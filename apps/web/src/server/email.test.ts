import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from './email';
import { AppError } from './errors';

vi.mock('./config', () => ({
  getConfig: () => ({
    RESEND_API_KEY: 'invented-key',
    EMAIL_FROM: 'SiliconBox <no-reply@invented.dev>',
    EMAIL_REPLY_TO: 'team@invented.dev',
  }),
}));

const EMAIL = { to: 'learner@invented.dev', subject: 'Subject', text: 'Text', html: '<p>Text</p>' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendEmail', () => {
  it('posts the email to Resend with the key, sender and reply-to address', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ id: 'invented' })));
    vi.stubGlobal('fetch', fetch);
    await sendEmail(EMAIL);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer invented-key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'SiliconBox <no-reply@invented.dev>',
      reply_to: 'team@invented.dev',
      ...EMAIL,
    });
  });

  it.each(['someone@example.test', 'someone@example.com', 'someone@mail.invalid'])(
    'sends nothing to the reserved address %s',
    async (to) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await sendEmail({ ...EMAIL, to });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('reports a refusal with the error name only, never Resend message text', async () => {
    const refusal = {
      name: 'validation_error',
      message: 'You can only send to owner@invented.dev',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(refusal, { status: 403 }))),
    );
    const error = await sendEmail(EMAIL).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('EMAIL_NOT_SENT');
    expect((error as AppError).detail).toContain('403 validation_error');
    expect((error as AppError).detail).not.toContain('owner@invented.dev');
  });
});
