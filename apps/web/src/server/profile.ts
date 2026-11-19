import 'server-only';
import { API_ROUTES } from '@siliconbox/shared';
import { cache } from 'react';
import { findPhotoVersion, findProfile } from '@/db/profiles';

/** The learner's photo address, versioned so a new photo is fetched at once; null with none. */
export const readPhotoUrl = cache(async (userId: string): Promise<string | null> => {
  const version = await findPhotoVersion(userId);
  return version === null ? null : `${API_ROUTES.profilePhoto}?v=${version.getTime()}`;
});

/** The learner's profile with their photo's address, for Settings and the Overview. */
export async function readProfile(userId: string) {
  const [profile, photoUrl] = await Promise.all([findProfile(userId), readPhotoUrl(userId)]);
  return { ...profile, photoUrl };
}
