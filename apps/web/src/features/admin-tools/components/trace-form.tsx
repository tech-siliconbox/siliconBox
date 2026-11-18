'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/text-area-field';
import type { TraceState, traceLeakAction } from '@/server/watermark-trace-action';
import { TraceResults } from './trace-results';

type TraceFormProps = { action: typeof traceLeakAction };

/** Paste leaked text, see whose account it came from. Text is sent by POST, never in the URL. */
export function TraceForm({ action }: TraceFormProps) {
  const [state, submit, pending] = useActionState<TraceState, FormData>(action, { status: 'idle' });
  return (
    <div className="flex flex-col gap-6">
      <form action={submit} className="flex flex-col gap-3">
        <TextAreaField
          label="Leaked text or visible mark"
          name="text"
          rows={8}
          required
          maxLength={100_000}
          placeholder="Paste a copied passage, or type the mark from a screenshot, for example: ab34cd · pri…@example.com · 2026-11-18"
        />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? 'Tracing…' : 'Trace'}
        </Button>
      </form>
      {state.status === 'error' && (
        <p role="alert" className="text-[13px] text-destructive">
          {state.message}
        </p>
      )}
      {state.status === 'done' && <TraceResults matches={state.matches} />}
    </div>
  );
}
