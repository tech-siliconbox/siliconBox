'use client';

import { ROUTES } from '@siliconbox/shared';
import type { ReactNode, SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { type AuthResult, useAuthAction } from '../hooks/use-auth-action';
import { FormError } from './form-error';

type AuthFormProps = {
  /** Where to go on success; null stays on the page. Defaults to the account page. */
  next?: string | null;
  submitLabel: string;
  pendingLabel: string;
  submit: (form: FormData) => Promise<AuthResult>;
  children: ReactNode;
};

/** Fields, error and submit button shared by every auth form. */
export function AuthForm({
  next = ROUTES.account,
  submitLabel,
  pendingLabel,
  submit,
  children,
}: AuthFormProps) {
  const { pending, error, run } = useAuthAction(next);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() => submit(form));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {children}
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
