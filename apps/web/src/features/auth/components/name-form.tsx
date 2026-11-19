'use client';

import { ROUTES } from '@siliconbox/shared';
import { authClient } from '@/lib/auth-client';
import { formValue } from '../form-value';
import { ActionForm } from '@/components/shared/action-form';
import { NameField } from './name-field';

/** Changes the name shown in the menu and on the dashboard. */
export function NameForm({ name }: { name: string }) {
  return (
    <ActionForm
      next={ROUTES.settings}
      submitLabel="Save name"
      pendingLabel="Saving…"
      submit={(form) => authClient.updateUser({ name: formValue(form, 'name').trim() })}
    >
      <NameField defaultValue={name} />
    </ActionForm>
  );
}
