'use client';

import { ROUTES } from '@siliconbox/shared';
import { useState } from 'react';
import { TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { AuthForm } from './auth-form';

/** Asks for a reset link. The answer is the same whether or not the account exists. */
export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  if (sentTo !== null) {
    return (
      <p role="status" className="rounded-md border border-border bg-muted p-4 text-sm">
        If an account uses {sentTo}, a link to set a new password is on its way. It works for one
        hour; check spam if it does not arrive.
      </p>
    );
  }
  return (
    <AuthForm
      next={null}
      submitLabel="Send reset link"
      pendingLabel="Sending…"
      submit={async (form) => {
        const email = formValue(form, 'email');
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: ROUTES.resetPassword,
        });
        if (result.error === null) setSentTo(email);
        return result;
      }}
    >
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
      />
    </AuthForm>
  );
}
