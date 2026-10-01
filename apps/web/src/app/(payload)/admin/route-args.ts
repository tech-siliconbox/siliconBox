import config from '@payload-config';
import { generatePageMetadata } from '@payloadcms/next/views';
import type { Metadata } from 'next';

/** Route props every admin view receives. */
export type AdminRouteArgs = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export const generateAdminMetadata = ({
  params,
  searchParams,
}: AdminRouteArgs): Promise<Metadata> => generatePageMetadata({ config, params, searchParams });
