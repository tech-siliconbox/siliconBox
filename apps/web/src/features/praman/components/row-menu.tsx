'use client';

import { useState } from 'react';
import { useDismiss } from '@/hooks/use-dismiss';
import type { MenuItem } from '../menus';
import { MenuList } from './menu-list';

type RowMenuProps = {
  /** What the row is, for the button's name. */
  name: string;
  items: (MenuItem | null)[];
  onChoose: (item: MenuItem) => void;
  /** Open or not, when the row decides (a right click opens it); else the menu does. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** A table row's own menu, behind a ⋯ button (or a right click on the row). */
export function RowMenu({ name, items, onChoose, ...control }: RowMenuProps) {
  const [own, setOwn] = useState(false);
  const open = control.open ?? own;
  const setOpen = control.onOpenChange ?? setOwn;
  const box = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded-[3px] px-1.5 font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        ⋯
      </button>
      {open && (
        <MenuList
          label={`Actions for ${name}`}
          items={items}
          align="right"
          onChoose={(item) => {
            setOpen(false);
            onChoose(item);
          }}
        />
      )}
    </div>
  );
}
