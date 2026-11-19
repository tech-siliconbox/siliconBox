import 'server-only';
import type { ErrorCode } from '@siliconbox/shared';
import { AppError } from './errors';

// Multipart framing adds a little to the file itself.
const FRAMING_BYTES = 64 * 1024;

/** An upload's file and the form's text fields, which the route parses with its own schema. */
export type Upload = { file: File; fields: Record<string, string> };

/** The `file` field of a multipart body, size-checked before and after it is read, with the text fields. */
export async function readUpload(
  request: Request,
  maxFileBytes: number,
  refusal: ErrorCode,
): Promise<Upload> {
  const maxRequestBytes = maxFileBytes + FRAMING_BYTES;
  if (Number(request.headers.get('content-length') ?? maxRequestBytes + 1) > maxRequestBytes) {
    throw new AppError(refusal, 'request too large');
  }
  const form = await request.formData().catch(() => null);
  if (form === null) throw new AppError(refusal, 'not a multipart form');
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError(refusal, 'no file field');
  if (file.size === 0 || file.size > maxFileBytes) throw new AppError(refusal, 'file size');
  return { file, fields: textFields(form) };
}

function textFields(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form) if (typeof value === 'string') fields[name] = value;
  return fields;
}
