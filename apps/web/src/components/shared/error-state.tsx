import type { ReactNode } from 'react';

type ErrorStateProps = { title: string; description: string; action?: ReactNode };

export function ErrorState({ title, description, action }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-2 px-6 py-24 text-center"
    >
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
