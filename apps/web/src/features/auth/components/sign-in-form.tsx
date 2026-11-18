'use client';

import { ROUTES } from '@siliconbox/shared';
import { SiteLink } from '@/components/ui/site-link';
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
      submit={(form) =>
        authClient.signIn.email({
          email: formValue(form, 'email'),
          password: formValue(form, 'password'),
        })
      }
    >
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        action={
          <SiteLink
            href={ROUTES.forgotPassword}
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </SiteLink>
        }
      />
      <PasswordField autoComplete="current-password" />
    </AuthForm>
  );
}
