'use client';

import { ROUTES } from '@siliconbox/shared';
import type { ReactNode, SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { type FormResult, useFormAction } from '@/hooks/use-form-action';
import { FormError } from '@/components/ui/form-error';

type ActionFormProps = {
  /** Where to go on success; null stays on the page. Defaults to the dashboard. */
  next?: string | null;
  submitLabel: string;
  pendingLabel: string;
  /** "secondary" beside a main action; "danger" for what cannot be undone. */
  submitVariant?: 'primary' | 'secondary' | 'danger';
  submit: (form: FormData) => Promise<FormResult>;
  children: ReactNode;
};

/** A form whose submit calls an action (auth or our API): fields, its error and the button. */
export function ActionForm({
  next = ROUTES.dashboard,
  submitLabel,
  pendingLabel,
  submitVariant = 'primary',
  submit,
  children,
}: ActionFormProps) {
  const { pending, error, run } = useFormAction(next);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() => submit(form));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {children}
      <FormError message={error} />
      <Button type="submit" variant={submitVariant} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
