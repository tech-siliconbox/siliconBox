import { CspImage } from '@/components/ui/csp-image';
import { cn } from '@/lib/cn';

const SIZES = {
  sm: { pixels: 32, className: 'size-8 text-[11px]' },
  lg: { pixels: 64, className: 'size-16 text-lg' },
} as const;

type AvatarProps = {
  name: string;
  email: string;
  photoUrl: string | null;
  size: keyof typeof SIZES;
};

/** Up to two initials from the name, or the email's first letter. */
const initialsOf = (name: string, email: string) =>
  (name.trim() || email)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();

/** The learner's photo, or their initials on a dark circle. Decorative: the name is beside it. */
export function Avatar({ name, email, photoUrl, size }: AvatarProps) {
  const { pixels, className } = SIZES[size];
  if (photoUrl !== null) {
    // Not optimised: the image service would fetch it without the learner's session.
    return (
      <CspImage
        src={photoUrl}
        alt=""
        width={pixels}
        height={pixels}
        unoptimized
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-foreground font-mono font-semibold text-background',
        className,
      )}
    >
      {initialsOf(name, email)}
    </span>
  );
}
