import type { MetadataRoute } from 'next';
import { AI_CRAWLERS } from '@/lib/ai-crawlers';

// Advice to crawlers, not protection (the proxy refuses AI crawlers; paid pages need sign-in
// and an entitlement). Search engines may read public pages; nothing under a course, answer,
// admin or API path.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...AI_CRAWLERS], disallow: '/' },
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/courses/*/',
          '/questions/',
          '/dashboard',
          '/settings',
          '/preview',
          '/admin',
          '/api',
        ],
      },
    ],
  };
}
