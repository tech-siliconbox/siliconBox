import type { ReactNode } from 'react';
import { ModuleIndex, type ModuleIndexProps } from './module-index';

/**
 * A lesson beside its course's module index: a sticky sidebar on wide screens, a fold-out list
 * above the lesson on narrow ones. Lined up with the site header's width.
 */
export function CourseIndexLayout({
  children,
  ...index
}: ModuleIndexProps & { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl gap-10 px-4 pb-20 pt-8 sm:px-6 lg:pt-12">
      <aside className="hidden w-64 shrink-0 lg:block xl:w-72">
        <div className="sticky top-[76px] max-h-[calc(100dvh-100px)] overflow-y-auto pb-4">
          <ModuleIndex {...index} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <details className="mb-8 rounded-card border border-border lg:hidden">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
            All modules
          </summary>
          <div className="border-t border-border py-3">
            <ModuleIndex {...index} />
          </div>
        </details>
        {children}
      </div>
    </div>
  );
}
