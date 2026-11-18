import { PROFILE_LINKS, type Profile, ROUTES } from '@siliconbox/shared';
import { Avatar } from '@/components/shared/avatar';
import { Card } from '@/components/ui/card';
import { SiteLink } from '@/components/ui/site-link';

type ProfileCardProps = {
  name: string;
  email: string;
  profile: Profile & { photoUrl: string | null };
};

/** The learner's profile at a glance: photo, name, handle, bio and links, and a way to edit. */
export function ProfileCard({ name, email, profile }: ProfileCardProps) {
  const links = PROFILE_LINKS.flatMap(({ key, label }) => {
    const href = profile.links[key];
    return href === null ? [] : [{ label, href }];
  });
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={name} email={email} photoUrl={profile.photoUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          {profile.handle !== null && (
            <p className="truncate font-mono text-[12px] text-muted-foreground">
              @{profile.handle}
            </p>
          )}
        </div>
      </div>
      {profile.bio !== '' && (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{profile.bio}</p>
      )}
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {links.map(({ label, href }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-4"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      )}
      <SiteLink
        href={`${ROUTES.settings}#profile`}
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Edit profile
      </SiteLink>
    </Card>
  );
}
