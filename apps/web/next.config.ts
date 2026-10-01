import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

// Static headers for every response. The nonce-based CSP is set per request in src/proxy.ts.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@siliconbox/shared'],
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders }]),
};

export default withPayload(nextConfig);
