'use client';

import { API_ROUTES, type ToolSignalList, ToolSignalListSchema } from '@siliconbox/shared';
import { z } from 'zod';
import { errorMessage } from '@/lib/api-error';
import { useJson } from './use-json';

const readLists = (body: unknown) => z.array(ToolSignalListSchema).safeParse(body).data ?? null;

/**
 * Visualize's signal lists saved with the session, for the design's top module: save the rows
 * shown under a name, or delete a list. Each answer is null when it went through, else why not.
 */
export function useSignalLists(sessionId: string, top: string) {
  const url = API_ROUTES.toolSessionSignalLists(sessionId);
  const { data, reload } = useJson(url, readLists);
  const send = async (target: string, init: RequestInit): Promise<string | null> => {
    const response = await fetch(target, init).catch(() => null);
    reload();
    return response?.ok === true ? null : errorMessage(response);
  };
  return {
    lists: (data ?? []).filter((list) => list.top === top),
    save: (name: string, rows: ToolSignalList['rows']) =>
      send(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, top, rows }),
      }),
    remove: (name: string) =>
      send(`${url}?${new URLSearchParams({ name, top })}`, { method: 'DELETE' }),
  };
}
