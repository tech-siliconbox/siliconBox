import 'server-only';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from './errors';

export const MAX_CV_BYTES = 5 * 1024 * 1024;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK..", the container of a .docx

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  magic.every((byte, index) => bytes[index] === byte);

/** Decides the type from the file's own bytes, never from the name or browser-supplied type alone. */
function fileKind(name: string, bytes: Uint8Array): 'pdf' | 'docx' | null {
  if (startsWith(bytes, PDF_MAGIC)) return 'pdf';
  if (startsWith(bytes, ZIP_MAGIC) && name.toLowerCase().endsWith('.docx')) return 'docx';
  return null;
}

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { text: text.join('\n'), pages: totalPages };
}

/** Text and page count from an uploaded CV, read in memory; the file itself is never stored. */
export async function extractCvText(
  name: string,
  bytes: Uint8Array,
): Promise<{ text: string; pages: number | null }> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CV_BYTES)
    throw new AppError('FILE_NOT_SUPPORTED', 'size');
  const kind = fileKind(name, bytes);
  if (kind === null) throw new AppError('FILE_NOT_SUPPORTED', 'not a PDF or .docx');
  try {
    if (kind === 'pdf') return await pdfText(bytes);
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: value, pages: null };
  } catch {
    throw new AppError('FILE_NOT_SUPPORTED', `${kind} could not be read`);
  }
}
