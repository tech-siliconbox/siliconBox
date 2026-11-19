import { z } from 'zod';

/** A handle: 3 to 30 lowercase letters, digits or underscores. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;
export const BIO_MAX_LENGTH = 500;
const LINK_MAX_LENGTH = 200;
// Names that would read as the site speaking.
const RESERVED_HANDLES = new Set([
  'admin',
  'help',
  'root',
  'siliconbox',
  'staff',
  'support',
  'team',
]);

/** An https address, on one site when `hostname` is given; null when left empty. */
const httpsLink = (error: string, hostname?: RegExp) =>
  z
    .url({ protocol: /^https$/, ...(hostname && { hostname }), error })
    .max(LINK_MAX_LENGTH, error)
    .nullable();

/** The profile's links in order, with how each is labelled and an example address. */
export const PROFILE_LINKS = [
  { key: 'linkedin', label: 'LinkedIn', example: 'https://www.linkedin.com/in/you' },
  { key: 'github', label: 'GitHub', example: 'https://github.com/you' },
  { key: 'website', label: 'Website', example: 'https://your-site.com' },
] as const;

/** What a learner tells others about themselves (Settings > Profile). */
export const ProfileSchema = z.strictObject({
  handle: z
    .string()
    .regex(HANDLE_PATTERN, 'Use 3 to 30 lowercase letters, digits or underscores.')
    .refine((handle) => !RESERVED_HANDLES.has(handle), 'That handle is reserved.')
    .nullable(),
  bio: z.string().trim().max(BIO_MAX_LENGTH, `Keep the bio to ${BIO_MAX_LENGTH} characters.`),
  links: z.strictObject({
    linkedin: httpsLink(
      'Use your LinkedIn address, https://www.linkedin.com/…',
      /^(www\.)?linkedin\.com$/,
    ),
    github: httpsLink('Use your GitHub address, https://github.com/…', /^(www\.)?github\.com$/),
    website: httpsLink('Use a full https:// address for your website.'),
  }),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** A learner who has not filled in their profile yet. */
export const emptyProfile = (): Profile => ({
  handle: null,
  bio: '',
  links: { linkedin: null, github: null, website: null },
});

/** The photo's address carries its version (`?v=`), so a new photo is never served from cache. */
export const PhotoQuerySchema = z.strictObject({
  v: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
});
