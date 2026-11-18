'use client';

import { ROUTES } from '@siliconbox/shared';
import { useEffect, useRef, useState } from 'react';
import { SiteLink } from '@/components/ui/site-link';
import { authClient } from '@/lib/auth-client';
import { useAuthAction } from '../hooks/use-auth-action';

const LINKS = [
  { href: ROUTES.dashboard, label: 'Overview' },
  { href: ROUTES.settings, label: 'Settings' },
  { href: ROUTES.help, label: 'Help' },
];
const ITEM = 'block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted';

/** Up to two initials from the name, or the email's first letter. */
const initialsOf = (name: string, email: string) =>
  (name.trim() || email)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();

/** Closes the menu on a click outside it or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

type MenuPanelProps = { name: string; email: string; onNavigate: () => void };

function MenuPanel({ name, email, onNavigate }: MenuPanelProps) {
  const { pending, run } = useAuthAction(ROUTES.home);
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-card border border-border bg-background">
      <div className="border-b border-border px-4 py-3">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-[12px] text-muted-foreground">{email}</p>
      </div>
      <ul className="border-b border-border py-1">
        {LINKS.map(({ href, label }) => (
          <li key={href}>
            <SiteLink href={href} onClick={onNavigate} className={ITEM}>
              {label}
            </SiteLink>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={pending}
        onClick={() => void run(() => authClient.signOut())}
        className={`${ITEM} py-2.5`}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

/** The signed-in learner's menu in the header: who they are, their pages, and sign out. */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-foreground font-mono text-[11px] font-semibold text-background"
        >
          {initialsOf(name, email)}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && <MenuPanel name={name} email={email} onNavigate={() => setOpen(false)} />}
    </div>
  );
}
