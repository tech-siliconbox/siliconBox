import 'server-only';
import { z } from 'zod';

/** An optional variable left empty (as in .env.example) counts as unset. */
const optional = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    MONGODB_URI_APP: z.string().startsWith('mongodb'),
    // Read-only access to paid answers, used only after the entitlement check.
    MONGODB_URI_ANSWERS: z.string().startsWith('mongodb'),
    REDIS_URL: z.string().startsWith('redis'),
    // The private solver service and the key that signs every call to it (solver ADR 0020).
    SOLVER_URL: z.url(),
    SOLVER_SIGNING_KEY: z.string().min(32),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
  })
  .refine(
    (env) => (env.GOOGLE_CLIENT_ID === undefined) === (env.GOOGLE_CLIENT_SECRET === undefined),
    {
      message: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
    },
  );
type Config = z.infer<typeof ConfigSchema>;

let cached: Config | undefined;

/** Validated on first use so a missing variable fails loudly at start, not deep in a request. */
export function getConfig(): Config {
  cached ??= ConfigSchema.parse(process.env);
  return cached;
}
