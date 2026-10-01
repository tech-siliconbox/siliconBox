import { type NextRequest, NextResponse } from 'next/server';

/**
 * Per-request CSP nonce. Next applies it to its own scripts during server rendering, which
 * makes every page dynamic (ADR 0017). frame-ancestors is limited to ourselves.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, {
    isDev: process.env.NODE_ENV === 'development',
    // Payload's admin UI sets inline styles; only the admin gets 'unsafe-inline' for styles.
    inlineStyles: request.nextUrl.pathname.startsWith('/admin'),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

function buildCsp(nonce: string, options: { isDev: boolean; inlineStyles: boolean }): string {
  // A nonce makes browsers ignore 'unsafe-inline', so the admin's style-src omits it.
  const styleSrc = options.inlineStyles ? `'unsafe-inline'` : `'nonce-${nonce}'`;
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.isDev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' ${styleSrc}`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'self'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|brand/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
