'use client';

import { ROUTES } from '@siliconbox/shared';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useAuthAction } from '../hooks/use-auth-action';

export function SignOutButton() {
  const { pending, run } = useAuthAction(ROUTES.home);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() => void run(() => authClient.signOut())}
    >
      Sign out
    </Button>
  );
}
