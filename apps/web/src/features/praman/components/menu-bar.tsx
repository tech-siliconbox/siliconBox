'use client';

import { type ReactNode, useState } from 'react';
import { PramanMark } from '@/components/shared/praman-mark';
import { useDismiss } from '@/hooks/use-dismiss';
import type { Menu, MenuItem } from '../menus';
import type { ToolAction } from '../tool-actions';
import { MenuList } from './menu-list';

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
      <h1 className="px-3">
        <PramanMark />
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
            {open === menu.label && (
              <MenuList label={menu.label} items={menu.items} onChoose={choose} />
            )}
          </div>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3 pr-3 text-muted-foreground">{children}</div>
    </div>
  );
}
