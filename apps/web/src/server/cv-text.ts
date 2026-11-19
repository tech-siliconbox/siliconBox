import 'server-only';
import type { CvFileKind } from '@siliconbox/shared';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from './errors';
import { ZIP_MAGIC, startsWith } from './file-bytes';

export const MAX_CV_BYTES = 5 * 1024 * 1024;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Decides the type from the file's own bytes, never from the name or browser-supplied type alone. */
function fileKind(name: string, bytes: Uint8Array): CvFileKind | null {
  if (startsWith(bytes, PDF_MAGIC)) return 'pdf';
  if (startsWith(bytes, ZIP_MAGIC) && name.toLowerCase().endsWith('.docx')) return 'docx';
  return null;
}

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  // pdf.js takes over (detaches) the buffer it is given; a copy leaves the caller's bytes intact.
  const pdf = await getDocumentProxy(bytes.slice());
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { text: text.join('\n'), pages: totalPages };
}

type CvText = { text: string; pages: number | null; kind: CvFileKind };

/** Text, page count and type of a CV file, read in memory. */
export async function extractCvText(name: string, bytes: Uint8Array): Promise<CvText> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CV_BYTES)
    throw new AppError('FILE_NOT_SUPPORTED', 'size');
  const kind = fileKind(name, bytes);
  if (kind === null) throw new AppError('FILE_NOT_SUPPORTED', 'not a PDF or .docx');
  try {
    if (kind === 'pdf') return { ...(await pdfText(bytes)), kind };
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: value, pages: null, kind };
  } catch {
    throw new AppError('FILE_NOT_SUPPORTED', `${kind} could not be read`);
  }
}
