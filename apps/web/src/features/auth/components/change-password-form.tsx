'use client';

import { PASSWORD_CHANGED, ROUTES } from '@siliconbox/shared';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { ActionForm } from '@/components/shared/action-form';
import { PasswordField } from './password-field';

/** Changes the password; every other device is signed out. */
export function ChangePasswordForm() {
  return (
    <ActionForm
      next={`${ROUTES.settings}?changed=${PASSWORD_CHANGED}`}
      submitLabel="Change password"
      pendingLabel="Changing…"
      submit={(form) =>
        authClient.changePassword({
          currentPassword: formValue(form, 'currentPassword'),
          newPassword: formValue(form, 'newPassword'),
          revokeOtherSessions: true,
        })
      }
    >
      <PasswordField
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
      />
      <PasswordField name="newPassword" label="New password" autoComplete="new-password" />
    </ActionForm>
  );
}
