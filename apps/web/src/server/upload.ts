import 'server-only';
import type { ErrorCode } from '@siliconbox/shared';
import { AppError } from './errors';

// Multipart framing adds a little to the file itself.
const FRAMING_BYTES = 64 * 1024;

/** The uploaded `file` field of a multipart body, size-checked before and after it is read. */
export async function readUpload(
  request: Request,
  maxFileBytes: number,
  refusal: ErrorCode,
): Promise<File> {
  const maxRequestBytes = maxFileBytes + FRAMING_BYTES;
  if (Number(request.headers.get('content-length') ?? maxRequestBytes + 1) > maxRequestBytes) {
    throw new AppError(refusal, 'request too large');
  }
  const file = (await request.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) throw new AppError(refusal, 'no file field');
  if (file.size === 0 || file.size > maxFileBytes) throw new AppError(refusal, 'file size');
  return file;
}
