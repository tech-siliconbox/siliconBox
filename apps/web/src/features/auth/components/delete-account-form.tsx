'use client';

import { ACCOUNT_DELETED, ROUTES } from '@siliconbox/shared';
import { TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { AuthForm } from './auth-form';
import { PasswordField } from './password-field';

const SIGN_IN_AGAIN = 'For your safety, sign in again, then delete your account within a day.';
const TYPE_EMAIL = 'Type your email exactly as shown.';

type DeleteAccountFormProps = { email: string; withPassword: boolean };

/**
 * Deletes the account and its data. A password account confirms with its password; a Google
 * account types its email, and the server also asks for a sign-in within the last day.
 */
export function DeleteAccountForm({ email, withPassword }: DeleteAccountFormProps) {
  async function submit(form: FormData) {
    if (!withPassword && formValue(form, 'confirm').trim().toLowerCase() !== email.toLowerCase()) {
      return { error: { message: TYPE_EMAIL } };
    }
    const result = await authClient.deleteUser(
      withPassword ? { password: formValue(form, 'password') } : {},
    );
    return result.error?.code === 'SESSION_EXPIRED'
      ? { error: { message: SIGN_IN_AGAIN } }
      : result;
  }
  return (
    <AuthForm
      next={`${ROUTES.signIn}?reason=${ACCOUNT_DELETED}`}
      submitLabel="Delete my account"
      pendingLabel="Deleting…"
      submitVariant="danger"
      submit={submit}
    >
      {withPassword ? (
        <PasswordField autoComplete="current-password" label="Your password" />
      ) : (
        <TextField label={`Type ${email} to confirm`} name="confirm" autoComplete="off" required />
      )}
    </AuthForm>
  );
}
