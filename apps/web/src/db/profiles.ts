import 'server-only';
import { type Profile, ProfileSchema, emptyProfile } from '@siliconbox/shared';
import { Binary, MongoServerError } from 'mongodb';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

const DUPLICATE_KEY = 11000;

const profiles = () => getDb().collection(COLLECTIONS.profiles);
const avatars = () => getDb().collection(COLLECTIONS.avatars);

/** The learner's profile, or an empty one until they save theirs. */
export async function findProfile(userId: string): Promise<Profile> {
  const found = await profiles().findOne(
    { userId },
    { projection: { _id: 0, handle: 1, bio: 1, links: 1 } },
  );
  return found === null ? emptyProfile() : ProfileSchema.parse(found);
}

/** Saves the profile; another learner already holding the handle refuses it. */
export async function saveProfile(
  userId: string,
  profile: Profile,
): Promise<'saved' | 'handle-taken'> {
  try {
    await profiles().updateOne(
      { userId },
      { $set: { ...profile, updatedAt: new Date() } },
      { upsert: true },
    );
    return 'saved';
  } catch (error) {
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return 'handle-taken';
    throw error;
  }
}

/** When the learner's photo was last changed, which is its version; null with no photo. */
export async function findPhotoVersion(userId: string): Promise<Date | null> {
  const found = await avatars().findOne({ userId }, { projection: { _id: 0, updatedAt: 1 } });
  return found?.updatedAt instanceof Date ? found.updatedAt : null;
}

/** The learner's photo as WebP bytes (a copy a response can own), or null. */
export async function findPhoto(userId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const found = await avatars().findOne({ userId }, { projection: { _id: 0, image: 1 } });
  return found?.image instanceof Binary ? new Uint8Array(found.image.buffer) : null;
}

export async function savePhoto(userId: string, webp: Uint8Array): Promise<void> {
  await avatars().updateOne(
    { userId },
    { $set: { image: new Binary(webp), updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function deletePhoto(userId: string): Promise<void> {
  await avatars().deleteOne({ userId });
}
