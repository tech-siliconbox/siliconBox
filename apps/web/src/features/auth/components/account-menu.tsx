'use client';

import { ROUTES } from '@siliconbox/shared';
import { useState } from 'react';
import { Avatar } from '@/components/shared/avatar';
import { SiteLink } from '@/components/ui/site-link';
import { authClient } from '@/lib/auth-client';
import { MEMBER_PAGES } from '@/lib/member-pages';
import { useDismiss } from '@/hooks/use-dismiss';
import { useFormAction } from '@/hooks/use-form-action';

const ITEM = 'block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted';

type MenuPanelProps = { name: string; email: string; onNavigate: () => void };

function MenuPanel({ name, email, onNavigate }: MenuPanelProps) {
  const { pending, run } = useFormAction(ROUTES.home);
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-card border border-border bg-background">
      <div className="border-b border-border px-4 py-3">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-[12px] text-muted-foreground">{email}</p>
      </div>
      <ul className="border-b border-border py-1">
        {MEMBER_PAGES.map(({ href, label }) => (
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

type AccountMenuProps = { name: string; email: string; photoUrl: string | null };

/** The signed-in learner's menu in the header: who they are, their pages, and sign out. */
export function AccountMenu({ name, email, photoUrl }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full"
      >
        <Avatar name={name} email={email} photoUrl={photoUrl} size="sm" />
        <span aria-hidden="true" className="text-muted-foreground">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && <MenuPanel name={name} email={email} onNavigate={() => setOpen(false)} />}
    </div>
  );
}
