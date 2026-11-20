import 'server-only';

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  tcl: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
} as const;

// An HTML file is only ever saved, never shown by the site: if a browser shows it anyway, it runs
// no script and loads nothing.
const SANDBOXED: Partial<Record<keyof typeof CONTENT_TYPES, string>> = {
  html: "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
};

/** A file sent as a download; its name keeps only letters, digits and dashes. */
export function fileDownload(
  bytes: Uint8Array | string,
  baseName: string,
  kind: keyof typeof CONTENT_TYPES,
): Response {
  const safe = baseName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  const body = typeof bytes === 'string' ? bytes : new Uint8Array(bytes);
  return new Response(body, {
    headers: {
      'Content-Type': CONTENT_TYPES[kind],
      'Content-Disposition': `attachment; filename="${safe}.${kind}"`,
      ...(SANDBOXED[kind] === undefined ? {} : { 'Content-Security-Policy': SANDBOXED[kind] }),
    },
  });
}
