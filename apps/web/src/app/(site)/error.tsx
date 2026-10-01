'use client';

import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';

/** Any unexpected server error on the site. Details stay in the server log. */
export default function SiteError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong"
      description="This page could not be shown. Please try again."
      action={
        <Button size="sm" variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
