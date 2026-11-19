import { PhotoQuerySchema } from '@siliconbox/shared';
import { deletePhoto, findPhoto, savePhoto } from '@/db/profiles';
import { withApiGate } from '@/server/api/with-api-gate';
import { AppError } from '@/server/errors';
import { MAX_PHOTO_BYTES, toProfilePhoto } from '@/server/profile-photo';
import { RATE_LIMITS } from '@/server/rate-limit';
import { readUpload } from '@/server/upload';

/** The learner's own photo. Its address carries a version, so the browser may keep it. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { query: PhotoQuerySchema },
  },
  async ({ identity }) => {
    const photo = await findPhoto(identity.userId);
    if (photo === null) throw new AppError('NOT_FOUND', 'no photo');
    return new Response(photo, {
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'private, max-age=31536000, immutable',
      },
    });
  },
);

/** Replaces the photo with an uploaded JPEG, PNG or WebP, re-encoded as a small WebP. */
export const PUT = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.photoUpload, schemas: {} },
  async ({ identity, request }) => {
    const { file } = await readUpload(request, MAX_PHOTO_BYTES, 'PHOTO_NOT_SUPPORTED');
    await savePhoto(
      identity.userId,
      await toProfilePhoto(new Uint8Array(await file.arrayBuffer())),
    );
    return new Response(null, { status: 204 });
  },
);

export const DELETE = withApiGate(
  { access: { kind: 'signedIn' }, rateLimit: RATE_LIMITS.write, schemas: {} },
  async ({ identity }) => {
    await deletePhoto(identity.userId);
    return new Response(null, { status: 204 });
  },
);
