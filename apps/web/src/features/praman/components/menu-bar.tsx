'use client';

import { type ReactNode, useState } from 'react';
import { useDismiss } from '@/hooks/use-dismiss';
import { cn } from '@/lib/cn';
import type { Menu, MenuItem } from '../menus';
import type { ToolAction } from '../tool-actions';

type MenuBarProps = {
  menus: Menu[];
  onAction: (action: ToolAction) => void;
  /** What stands at the right end: where the session is. */
  children: ReactNode;
};

/** Praman's menu bar: its name, the menus, and the session's state at the right. */
export function MenuBar({ menus, onAction, children }: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const bar = useDismiss<HTMLDivElement>(open !== null, () => setOpen(null));
  const choose = (item: MenuItem) => {
    setOpen(null);
    onAction(item.action);
  };
  return (
    <div ref={bar} className="flex h-8 items-center border-b border-border bg-muted text-[13px]">
      <h1 className="flex items-center gap-1.5 px-3 font-bold text-info">
        <span
          aria-hidden="true"
          className="grid size-[17px] place-items-center rounded-[3px] bg-info text-[11px] text-background"
        >
          P
        </span>
        Praman
      </h1>
      <div role="menubar" aria-label="Praman" className="flex h-full items-stretch">
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === menu.label}
              onClick={() => setOpen(open === menu.label ? null : menu.label)}
              onMouseEnter={() => open !== null && setOpen(menu.label)}
              className="h-full px-3 hover:bg-info-light aria-expanded:bg-info-light"
            >
              {menu.label}
            </button>
            {open === menu.label && <MenuList menu={menu} onChoose={choose} />}
          </div>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3 pr-3 text-muted-foreground">{children}</div>
    </div>
  );
}

function MenuList({ menu, onChoose }: { menu: Menu; onChoose: (item: MenuItem) => void }) {
  return (
    <div
      role="menu"
      aria-label={menu.label}
      className="absolute left-0 top-full z-50 w-max min-w-60 border border-border bg-background py-1 shadow-lg"
    >
      {menu.items.map((item, index) =>
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
