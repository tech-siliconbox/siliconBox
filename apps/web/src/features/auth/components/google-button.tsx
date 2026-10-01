'use client';

import { ROUTES } from '@siliconbox/shared';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useAuthAction } from '../hooks/use-auth-action';
import { FormError } from './form-error';

export function GoogleButton() {
  const { pending, error, run } = useAuthAction(null);
  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          void run(() =>
            authClient.signIn.social({ provider: 'google', callbackURL: ROUTES.account }),
          )
        }
      >
        Continue with Google
      </Button>
      <FormError message={error} />
    </>
  );
}
