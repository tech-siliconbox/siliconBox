import type { ReactNode } from 'react';
import { DashboardNav } from './dashboard-nav';

/** The learner's own pages with their navigation beside them (Overview, Settings, and Help). */
export function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[13rem_1fr] lg:gap-10 lg:pt-12">
      <aside className="min-w-0 lg:sticky lg:top-[76px] lg:self-start">
        <DashboardNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
