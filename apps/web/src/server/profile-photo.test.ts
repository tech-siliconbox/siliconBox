import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { toProfilePhoto } from './profile-photo';

/** A wide JPEG carrying camera details, as a phone would upload it. */
const phonePhoto = () =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: '#3a6ea5' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'Invented Camera', Model: 'Test 1' } })
    .toBuffer();

describe('toProfilePhoto', () => {
  it('makes a 256 px square WebP without the camera details', async () => {
    const photo = await toProfilePhoto(new Uint8Array(await phonePhoto()));
    const meta = await sharp(photo).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();
  });

  it('refuses files that are not JPEG, PNG or WebP by their bytes', async () => {
    const text = new TextEncoder().encode('not an image at all');
    await expect(toProfilePhoto(text)).rejects.toMatchObject({ code: 'PHOTO_NOT_SUPPORTED' });
    // A PNG signature followed by garbage is refused when decoding fails.
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    await expect(toProfilePhoto(fake)).rejects.toMatchObject({ code: 'PHOTO_NOT_SUPPORTED' });
  });
});
