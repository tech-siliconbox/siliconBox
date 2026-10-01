'use client';

import { TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { AuthForm } from './auth-form';

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
        })
      }
    >
      <TextField label="Name" name="name" autoComplete="name" required maxLength={100} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Password (at least 10 characters)"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
      />
    </AuthForm>
  );
}
