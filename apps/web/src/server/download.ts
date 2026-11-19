import 'server-only';

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

/** A file sent as a download; its name keeps only letters, digits and dashes. */
export function fileDownload(
  bytes: Uint8Array,
  baseName: string,
  kind: keyof typeof CONTENT_TYPES,
): Response {
  const safe = baseName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': CONTENT_TYPES[kind],
      'Content-Disposition': `attachment; filename="${safe}.${kind}"`,
    },
  });
}
