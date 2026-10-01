'use client';

import { ROUTES } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { AuthForm } from './auth-form';
import { PasswordField } from './password-field';

export function SignInForm() {
  return (
    <AuthForm
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      submit={async (form) => {
        const result = await authClient.signIn.email({
          email: formValue(form, 'email'),
          password: formValue(form, 'password'),
        });
        // With two-factor on, the password step creates no session yet; ask for the code.
        const needsCode = result.data !== null && 'twoFactorRedirect' in result.data;
        return needsCode ? { error: null, next: ROUTES.signInTwoFactor } : result;
      }}
    >
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <PasswordField />
    </AuthForm>
  );
}
