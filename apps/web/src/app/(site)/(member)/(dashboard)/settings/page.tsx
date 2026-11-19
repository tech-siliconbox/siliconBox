import {
  API_ROUTES,
  ERRORS,
  type Entitlement,
  LEVELS,
  LEVEL_LABELS,
  PASSWORD_CHANGED,
  ROUTES,
  contentStatus,
  slugify,
  toolStatus,
} from '@siliconbox/shared';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { PageIntro } from '@/components/shared/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SiteLink } from '@/components/ui/site-link';
import { findEntitlements } from '@/db/entitlements';
import { ChangePasswordForm } from '@/features/auth/components/change-password-form';
import { DeleteAccountForm } from '@/features/auth/components/delete-account-form';
import { NameForm } from '@/features/auth/components/name-form';
import { PhotoForm } from '@/features/auth/components/photo-form';
import { ProfileForm } from '@/features/auth/components/profile-form';
import { VerifyEmailButton } from '@/features/auth/components/verify-email-button';
import { windowText } from '@/features/dashboard/window-text';
import { hasPassword } from '@/server/auth/auth';
import type { Identity } from '@/server/auth/authenticate';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { readProfile } from '@/server/profile';

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } };

const NOTICE = 'rounded-md border border-border bg-muted p-3 text-sm';

/** One part of the page, with an anchor from its title (`/settings#profile`). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card id={slugify(title)} className="flex scroll-mt-20 flex-col gap-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** Email and whether it is verified, with the link to verify it; a failed link says so. */
function EmailStatus({ identity, linkFailed }: { identity: Identity; linkFailed: boolean }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-medium">Email</p>
      <p>{identity.email}</p>
      {identity.emailVerified ? (
        <p className="text-muted-foreground">Verified.</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Not verified yet. Verification is needed before a purchase.
          </p>
          {linkFailed && <p role="alert">{ERRORS.INVALID_LINK.message} Send a new one.</p>}
          <VerifyEmailButton email={identity.email} />
        </>
      )}
    </div>
  );
}

/** Each level's lessons and Drills, and the formal tool: open until when, ended, or not bought. */
function YourAccess({ entitlements, now }: { entitlements: Entitlement[]; now: Date }) {
  const rows = [
    ...LEVELS.map((level) => ({
      label: LEVEL_LABELS[level],
      text: windowText(contentStatus(entitlements, level, now), 'Not bought'),
    })),
    { label: 'Formal tool', text: windowText(toolStatus(entitlements, now), 'Not bought') },
  ];
  return (
    <>
      <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
        {rows.map(({ label, text }) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right">{text}</dd>
          </div>
        ))}
      </dl>
      <SiteLink href={ROUTES.pricing} className="text-sm underline underline-offset-4">
        See prices and levels
      </SiteLink>
    </>
  );
}

/** DPDP: download everything we hold, or delete the account (keeping only required records). */
function YourData({ identity, withPassword }: { identity: Identity; withPassword: boolean }) {
  return (
    <>
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium">Download your data</p>
        <p className="text-muted-foreground">
          Your account, sign-ins, access, finished lessons, Drill runs, resume and CV reports, as a
          JSON file.
        </p>
        <a
          href={API_ROUTES.dataExport}
          download
          className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'self-start' })}
        >
          Download your data
        </a>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-5 text-sm">
        <p className="font-medium">Delete your account</p>
        <p className="text-muted-foreground">
          This deletes your account, progress, Drill runs, resume and CV reports, and ends any
          access you bought. It cannot be undone, so download your data first if you want a copy. We
          keep only the records security and the law need: the audit log of sign-ins and access
          changes, security alerts, access our team granted you, and receipts once payments start.
        </p>
        <DeleteAccountForm email={identity.email} withPassword={withPassword} />
      </div>
    </>
  );
}

type SettingsPageProps = { searchParams: Promise<{ error?: string; changed?: string }> };

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const identity = await requirePageIdentity();
  const [params, entitlements, withPassword, profile] = await Promise.all([
    searchParams,
    findEntitlements(identity.userId),
    hasPassword(await headers()),
    readProfile(identity.userId),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageIntro eyebrow="Settings" title="Your account">
        Your profile, how you sign in, what you have access to, and your data.
      </PageIntro>
      <Section title="Profile">
        <PhotoForm name={identity.name} email={identity.email} photoUrl={profile.photoUrl} />
        <ProfileForm profile={profile} />
      </Section>
      <Section title="Account">
        <NameForm name={identity.name} />
        <EmailStatus identity={identity} linkFailed={params.error !== undefined} />
      </Section>
      <Section title="Password">
        {params.changed === PASSWORD_CHANGED && (
          <p role="status" className={NOTICE}>
            Your password was changed. Other devices were signed out.
          </p>
        )}
        {withPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-sm text-muted-foreground">
            You sign in with Google. To add a password as well, use “Forgot password?” on the
            sign-in page.
          </p>
        )}
      </Section>
      <Section title="Your access">
        <YourAccess entitlements={entitlements} now={new Date()} />
      </Section>
      <Section title="Your data">
        <YourData identity={identity} withPassword={withPassword} />
      </Section>
    </div>
  );
}
