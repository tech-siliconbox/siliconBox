import { IdParamsSchema, ToolSignalListKeySchema, ToolSignalListSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { deleteSignalList, readSignalLists, saveSignalList } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Visualize's saved signal lists of the session. */
export const GET = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.read,
    schemas: { params: IdParamsSchema },
  },
  async ({ identity, input }) => Response.json(await readSignalLists(identity, input.params.id)),
);

/** Saves Visualize's rows as a signal list (replacing one of the same name and top module). */
export const PUT = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema, body: ToolSignalListSchema },
  },
  async ({ identity, input }) => {
    await saveSignalList(identity, input.params.id, input.body);
    return new Response(null, { status: 204 });
  },
);

/** Deletes a saved signal list. */
export const DELETE = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema, query: ToolSignalListKeySchema },
  },
  async ({ identity, input }) => {
    await deleteSignalList(identity, input.params.id, input.query);
    return new Response(null, { status: 204 });
  },
);
