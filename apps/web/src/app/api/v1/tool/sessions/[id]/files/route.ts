import { IdParamsSchema, ToolFileQuerySchema, ToolFileSchema } from '@siliconbox/shared';
import { withApiGate } from '@/server/api/with-api-gate';
import { deleteFile, putFile } from '@/server/praman/sessions';
import { RATE_LIMITS } from '@/server/rate-limit';

/** Adds or replaces one file of the session (1 MB of files at most). */
export const PUT = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema, body: ToolFileSchema },
  },
  async ({ identity, input }) =>
    Response.json({ name: await putFile(identity, input.params.id, input.body) }),
);

/** Removes one file from the session. */
export const DELETE = withApiGate(
  {
    access: { kind: 'signedIn' },
    rateLimit: RATE_LIMITS.toolCommand,
    schemas: { params: IdParamsSchema, query: ToolFileQuerySchema },
  },
  async ({ identity, input }) => {
    await deleteFile(identity, input.params.id, input.query.name);
    return new Response(null, { status: 204 });
  },
);
