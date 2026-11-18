'use client';

import { useId, useState } from 'react';
import { CONTROL_CLASS, Field } from '@/components/ui/field';
import { cn } from '@/lib/cn';

type PasswordFieldProps = {
  /** "current-password" to sign in; "new-password" to choose one. */
  autoComplete: 'current-password' | 'new-password';
  label?: string;
  placeholder?: string;
  minLength?: number;
};

/** The eye: open to show the password, struck through to hide it again. */
function EyeIcon({ struck }: { struck: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {struck && <path d="M4 4l16 16" />}
    </svg>
  );
}

/** The `password` field, with a button that shows or hides what was typed. */
export function PasswordField({
  autoComplete,
  label = 'Password',
  placeholder,
  minLength,
}: PasswordFieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <Field id={id} label={label}>
      <div className="relative">
        <input
          id={id}
          name="password"
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          required
          className={cn('h-10 w-full pr-10', CONTROL_CLASS)}
        />
        <button
          type="button"
          onClick={() => setShown(!shown)}
          aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
        >
          <EyeIcon struck={shown} />
        </button>
      </div>
    </Field>
  );
}
