import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type PanelTab = { id: string; label: string; closable?: boolean };

/** The grey title strip at the top of every panel. */
export const PANEL_STRIP =
  'flex h-8 shrink-0 items-stretch border-b border-border bg-muted text-[13px] [&>h2]:self-center';

type PanelTabsProps = {
  label: string;
  tabs: readonly PanelTab[];
  active: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  /** Tools at the right end of the strip. */
  children?: ReactNode;
};

/** A panel's title strip of tabs, as in a desktop tool; the active one shows the accent. */
export function PanelTabs({ label, tabs, active, onSelect, onClose, children }: PanelTabsProps) {
  return (
    <div className={PANEL_STRIP}>
      <div role="tablist" aria-label={label} className="flex min-w-0 items-stretch overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'flex shrink-0 items-center border-r border-border',
              tab.id === active && 'bg-background shadow-[inset_0_2px_0_var(--color-info)]',
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === active}
              onClick={() => onSelect(tab.id)}
              className={cn(
                'h-full max-w-56 truncate px-3 font-semibold',
                tab.id === active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
            {tab.closable === true && onClose !== undefined && (
              <button
                type="button"
                aria-label={`Close ${tab.label}`}
                onClick={() => onClose(tab.id)}
                className="-ml-1.5 mr-1.5 px-1 text-muted-foreground hover:text-danger"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {children !== undefined && (
        <div className="ml-auto flex items-center gap-1.5 px-2">{children}</div>
      )}
    </div>
  );
}
