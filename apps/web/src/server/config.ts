import 'server-only';
import { z } from 'zod';

/** An optional variable left empty (as in .env.example) counts as unset. */
const optional = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

/** Settings that only work together. */
const PAIRED = [
  ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  ['RESEND_API_KEY', 'EMAIL_FROM'],
] as const;

export const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    MONGODB_URI_APP: z.string().startsWith('mongodb'),
    // Read-only access to paid answers, used only after the entitlement check.
    MONGODB_URI_ANSWERS: z.string().startsWith('mongodb'),
    // Read-only access to Drills' private parts, used only to grade runs (ADR 0021).
    MONGODB_URI_GRADER: z.string().startsWith('mongodb'),
    REDIS_URL: z.string().startsWith('redis'),
    // The private solver service and the key that signs every call to it (solver ADR 0020).
    SOLVER_URL: z.url(),
    SOLVER_SIGNING_KEY: z.string().min(32),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    // Email through Resend: a send-only key and the sender, as "Name <address>".
    RESEND_API_KEY: optional,
    EMAIL_FROM: optional,
    // Where learners' replies go (the sender must be on a verified domain; this need not be).
    EMAIL_REPLY_TO: optional,
    // AI feedback through Claude (ADR 0030). Without it the AI options are hidden.
    ANTHROPIC_API_KEY: optional,
  })
  .superRefine((env, context) => {
    for (const [first, second] of PAIRED) {
      if ((env[first] === undefined) !== (env[second] === undefined)) {
        context.addIssue({
          code: 'custom',
          message: `Set both ${first} and ${second}, or neither`,
        });
      }
    }
  });
type Config = z.infer<typeof ConfigSchema>;

let cached: Config | undefined;

/** Validated on first use so a missing variable fails loudly at start, not deep in a request. */
export function getConfig(): Config {
  cached ??= ConfigSchema.parse(process.env);
  return cached;
}
