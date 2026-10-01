import config from '@payload-config';
import { NotFoundPage } from '@payloadcms/next/views';
import { importMap } from '../importMap.js';
import { type AdminRouteArgs, generateAdminMetadata } from '../route-args';

export const generateMetadata = generateAdminMetadata;

export default function AdminNotFound({ params, searchParams }: AdminRouteArgs) {
  return NotFoundPage({ config, params, searchParams, importMap });
}
