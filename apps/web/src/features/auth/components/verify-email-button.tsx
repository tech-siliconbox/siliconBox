'use client';

import { ROUTES } from '@siliconbox/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useAuthAction } from '../hooks/use-auth-action';
import { FormError } from './form-error';

/** Sends (again) the link that confirms the learner's email address. */
export function VerifyEmailButton({ email }: { email: string }) {
  const { pending, error, run } = useAuthAction(null);
  const [sent, setSent] = useState(false);
  const send = async () => {
    setSent(
      await run(() => authClient.sendVerificationEmail({ email, callbackURL: ROUTES.settings })),
    );
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => void send()}>
        {pending ? 'Sending…' : 'Send verification email'}
      </Button>
      {sent && (
        <p role="status" className="text-sm text-muted-foreground">
          We sent a link to {email}. It works for one hour; check spam if it does not arrive.
        </p>
      )}
      <FormError message={error} />
    </div>
  );
}
