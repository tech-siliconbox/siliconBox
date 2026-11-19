'use client';

import { ERRORS, PASSWORD_CHANGED, ROUTES } from '@siliconbox/shared';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { ActionForm } from '@/components/shared/action-form';
import { PasswordField } from './password-field';

/** Sets a new password from a reset link's token, then sends the learner to sign in. */
export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <ActionForm
      next={`${ROUTES.signIn}?reason=${PASSWORD_CHANGED}`}
      submitLabel="Set new password"
      pendingLabel="Saving…"
      submit={async (form) => {
        const result = await authClient.resetPassword({
          newPassword: formValue(form, 'password'),
          token,
        });
        return result.error?.code === 'INVALID_TOKEN'
          ? { error: { message: `${ERRORS.INVALID_LINK.message} Ask for a new one.` } }
          : result;
      }}
    >
      <PasswordField autoComplete="new-password" label="New password" />
    </ActionForm>
  );
}
