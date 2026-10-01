import config from '@payload-config';
import { RootPage } from '@payloadcms/next/views';
import { importMap } from '../importMap.js';
import { type AdminRouteArgs, generateAdminMetadata } from '../route-args';

export const generateMetadata = generateAdminMetadata;

export default function AdminPage({ params, searchParams }: AdminRouteArgs) {
  return RootPage({ config, params, searchParams, importMap });
}
