'use client';

import { ROUTES } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { AuthForm } from './auth-form';
import { NameField } from './name-field';
import { PasswordField } from './password-field';

export function SignUpForm() {
  return (
    <AuthForm
      submitLabel="Create account"
      pendingLabel="Creating account…"
      submit={(form) =>
        authClient.signUp.email({
          name: formValue(form, 'name'),
          email: formValue(form, 'email'),
          password: formValue(form, 'password'),
          // Where the verification link brings the learner back to.
          callbackURL: ROUTES.settings,
        })
      }
    >
      <NameField />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
      />
      <PasswordField autoComplete="new-password" />
    </AuthForm>
  );
}
