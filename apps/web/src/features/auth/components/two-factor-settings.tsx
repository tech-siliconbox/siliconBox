'use client';

import { ROUTES } from '@siliconbox/shared';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { AuthForm } from './auth-form';
import { EnableTwoFactor } from './enable-two-factor';
import { PasswordField } from './password-field';

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  return (
    <section aria-labelledby="two-factor-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="two-factor-heading" className="text-base font-bold tracking-tight">
          Two-factor sign-in
        </h2>
        <p data-testid="two-factor-status" className="text-sm text-muted-foreground">
          {enabled
            ? 'On. Signing in asks for a code from your authenticator app.'
            : 'Off. Add a code from an authenticator app to every sign-in.'}
        </p>
      </div>
      {enabled ? (
        <AuthForm
          next={ROUTES.account}
          submitLabel="Turn off two-factor"
          pendingLabel="Turning off…"
          submit={(form) => authClient.twoFactor.disable({ password: formValue(form, 'password') })}
        >
          <PasswordField label="Confirm your password" />
        </AuthForm>
      ) : (
        <EnableTwoFactor />
      )}
    </section>
  );
}
