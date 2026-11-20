'use client';

import { cn } from '@/lib/cn';
import type { MenuItem } from '../menus';

type MenuListProps = {
  label: string;
  items: (MenuItem | null)[];
  onChoose: (item: MenuItem) => void;
  /** Where it opens: under a menu of the bar, or at the right end of a table row. */
  align?: 'left' | 'right';
};

/** A dropdown of menu items, each with the Tcl command it runs beside it. */
export function MenuList({ label, items, onChoose, align = 'left' }: MenuListProps) {
  return (
    <div
      role="menu"
      aria-label={label}
      className={cn(
        'absolute top-full z-50 w-max min-w-60 border border-border bg-background py-1 shadow-lg',
        align === 'left' ? 'left-0' : 'right-0',
      )}
    >
      {items.map((item, index) =>
        item === null ? (
          <div key={`separator-${index}`} role="separator" className="my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            disabled={!item.enabled}
            onClick={() => onChoose(item)}
            className={cn(
              'group flex w-full items-center gap-2 whitespace-nowrap px-2 py-1 text-left text-[13px]',
              'enabled:hover:bg-info enabled:hover:text-background disabled:text-muted-foreground',
            )}
          >
            <span aria-hidden="true" className="w-3 text-center">
              {item.checked === true ? '✓' : ''}
            </span>
            <span className="flex-1 pr-6">{item.label}</span>
            {item.hint !== undefined && (
              <span className="font-mono text-[11px] text-muted-foreground group-enabled:group-hover:text-background">
                {item.hint}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
