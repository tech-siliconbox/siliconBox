'use client';

import { API_ROUTES } from '@siliconbox/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

type MarkDoneButtonProps = { lessonId: string; initiallyDone: boolean };

export function MarkDoneButton({ lessonId, initiallyDone }: MarkDoneButtonProps) {
  const [done, setDone] = useState(initiallyDone);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    setPending(true);
    setFailed(false);
    const response = await fetch(API_ROUTES.progress, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId, done: !done }),
    }).catch(() => null);
    setPending(false);
    if (response?.ok === true) setDone(!done);
    else setFailed(true);
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={done ? 'secondary' : 'primary'}
        aria-pressed={done}
        disabled={pending}
        onClick={() => void toggle()}
      >
        {done ? '✓ Done' : 'Mark as done'}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Could not save. Please try again.
        </p>
      )}
    </div>
  );
}
