import 'server-only';
import sharp from 'sharp';
import { AppError } from './errors';
import { startsWith } from './file-bytes';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SIZE = 256;
// A larger image is refused before decoding, so a small file cannot expand into a huge one.
const MAX_INPUT_PIXELS = 50_000_000;
const R = null; // any byte (the RIFF size)
const SIGNATURES = [
  [0xff, 0xd8, 0xff], // JPEG
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  [0x52, 0x49, 0x46, 0x46, R, R, R, R, 0x57, 0x45, 0x42, 0x50], // "RIFF....WEBP"
];

/**
 * A photo as a 256 px square WebP. The type is decided from the file's bytes; re-encoding keeps
 * the pixels only, so location and camera details (EXIF) are dropped after turning it upright.
 */
export async function toProfilePhoto(bytes: Uint8Array): Promise<Uint8Array> {
  if (!SIGNATURES.some((signature) => startsWith(bytes, signature))) {
    throw new AppError('PHOTO_NOT_SUPPORTED', 'not a JPEG, PNG or WebP');
  }
  try {
    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize(SIZE, SIZE, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AppError('PHOTO_NOT_SUPPORTED', 'image could not be decoded');
  }
}
