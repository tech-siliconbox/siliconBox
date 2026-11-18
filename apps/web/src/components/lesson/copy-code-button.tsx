'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const RESET_MS = 2_000;

/** Copies a code example. Code is the one part of paid content learners may copy (ADR 0023). */
export function CopyCodeButton({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    const copied = await navigator.clipboard.writeText(code).then(
      () => true,
      () => false,
    );
    setState(copied ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), RESET_MS);
  };
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => void copy()}
      className="absolute right-2 top-2 z-10 h-7 select-none px-3 text-[12px]"
      aria-label="Copy code"
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </Button>
  );
}
