import 'server-only';
import { LINKEDIN_FILES, type LinkedInFile } from '@siliconbox/shared';
import { unzipSync } from 'fflate';
import { AppError } from './errors';
import { ZIP_MAGIC, startsWith } from './file-bytes';

// The CSV files we read from a LinkedIn data export. Nothing else in the archive is unpacked, and
// each file's declared size is capped first, so a crafted archive cannot exhaust memory.

export const MAX_LINKEDIN_EXPORT_BYTES = 10 * 1024 * 1024;
const MAX_CSV_BYTES = 1024 * 1024;
const WANTED = new Map<string, LinkedInFile>(
  LINKEDIN_FILES.map((name) => [name.toLowerCase(), name]),
);

const fileNameOf = (path: string) => (path.split('/').pop() ?? '').toLowerCase();

/** The known CSV files, decoded, by name; refused when the file is not an export we can read. */
export function readLinkedInExport(bytes: Uint8Array): Partial<Record<LinkedInFile, string>> {
  if (!startsWith(bytes, ZIP_MAGIC))
    throw new AppError('LINKEDIN_EXPORT_NOT_SUPPORTED', 'not a zip');
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(bytes, {
      filter: (file) => WANTED.has(fileNameOf(file.name)) && file.originalSize <= MAX_CSV_BYTES,
    });
  } catch {
    throw new AppError('LINKEDIN_EXPORT_NOT_SUPPORTED', 'unreadable zip');
  }
  const decoder = new TextDecoder();
  const files: Partial<Record<LinkedInFile, string>> = {};
  for (const [path, data] of Object.entries(unpacked)) {
    const name = WANTED.get(fileNameOf(path));
    if (name !== undefined) files[name] = decoder.decode(data);
  }
  if (Object.keys(files).length === 0) {
    throw new AppError('LINKEDIN_EXPORT_NOT_SUPPORTED', 'no LinkedIn files in the zip');
  }
  return files;
}
