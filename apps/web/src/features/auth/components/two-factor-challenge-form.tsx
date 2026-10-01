'use client';

import { TextField } from '@/components/ui/text-field';
import { AuthForm } from './auth-form';
import { formValue } from '../form-value';
import { authClient } from '@/lib/auth-client';

const TOTP_CODE = /^\d{6}$/;

/** Second sign-in step: a code from the authenticator app, or one of the backup codes. */
export function TwoFactorChallengeForm() {
  return (
    <AuthForm
      submitLabel="Verify"
      pendingLabel="Verifying…"
      submit={(form) => {
        const code = formValue(form, 'code').replace(/\s/g, '');
        return TOTP_CODE.test(code)
          ? authClient.twoFactor.verifyTotp({ code })
          : authClient.twoFactor.verifyBackupCode({ code });
      }}
    >
      <TextField
        label="Code from your authenticator app, or a backup code"
        name="code"
        autoComplete="one-time-code"
        inputMode="text"
        required
        maxLength={32}
      />
    </AuthForm>
  );
}
