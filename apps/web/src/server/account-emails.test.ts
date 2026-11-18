import { describe, expect, it } from 'vitest';
import { passwordResetEmail, verificationEmail } from './account-emails';

const URL = 'https://siliconbox.invented/api/auth/verify-email?token=abc&callbackURL=%2Faccount';
const ASHA = { name: 'Asha', email: 'asha@invented.dev' };

describe('account emails', () => {
  it.each([
    ['verification', verificationEmail, 'Confirm your email for SiliconBox', 'Confirm my email'],
    ['password reset', passwordResetEmail, 'Reset your SiliconBox password', 'Set a new password'],
  ])('the %s email carries its link in both forms', (_kind, build, subject, button) => {
    const email = build(ASHA, URL);
    expect(email).toMatchObject({ to: 'asha@invented.dev', subject });
    expect(email.text).toContain(URL);
    expect(email.html).toContain(
      'href="https://siliconbox.invented/api/auth/verify-email?token=abc&#38;callbackURL=%2Faccount"',
    );
    expect(email.html).toContain(`>${button}</a>`);
  });

  it('escapes a name that holds markup', () => {
    const email = verificationEmail(
      { name: '<img src=x onerror=alert(1)>', email: 'a@invented.dev' },
      URL,
    );
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&#60;img');
  });
});
