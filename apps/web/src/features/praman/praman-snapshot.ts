import { z } from 'zod';

/**
 * What the tool page reads of Praman's session state (apps/solver/app/praman/session.py,
 * Session.snapshot). The session sends more (strength, coverage, equivalence...) for the deeper
 * checks; the core page reads these fields.
 */

export type TreeNode = {
  path: string;
  name: string;
  module: string;
  file: string;
  line: number;
  children: TreeNode[];
};

const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    module: z.string(),
    file: z.string().default(''),
    line: z.number().int().default(0),
    children: z.array(TreeNodeSchema).default([]),
  }),
);

const PROPERTY_STATUSES = [
  'not_run',
  'running',
  'proven',
  'cex',
  'covered',
  'unreachable',
  'undetermined',
  'vacuous',
  'error',
  'stopped',
  'assumed',
] as const;

export const PramanPropertySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  instance: z.string(),
  file: z.string().default(''),
  line: z.number().int().default(0),
  related: z.string().default(''),
  status: z.enum(PROPERTY_STATUSES).catch('undetermined'),
  detail: z.string().default(''),
  bound: z.number().int().nullable().default(null),
  engine: z.string().default(''),
  seconds: z.number().nullable().default(null),
  has_trace: z.boolean().default(false),
});
export type PramanProperty = z.infer<typeof PramanPropertySchema>;

export const PramanSnapshotSchema = z.object({
  label: z.string(),
  phase: z.enum(['empty', 'analyzed', 'elaborated']),
  busy: z.boolean(),
  top: z.string(),
  clock: z.string().nullable(),
  reset: z.object({ signal: z.string(), active_low: z.boolean() }).nullable(),
  tree: TreeNodeSchema.nullable(),
  files: z.array(
    z.object({
      name: z.string(),
      lines: z.number().int(),
      bytes: z.number().int(),
      analyzed: z.boolean(),
    }),
  ),
  properties: z.array(PramanPropertySchema),
  settings: z.object({
    time_limit: z.number(),
    per_property_time_limit: z.number(),
    max_trace_length: z.number().int(),
  }),
  proof: z.object({
    running: z.boolean(),
    started_at: z.number().nullable(),
    total: z.number().int(),
    time_limit: z.number(),
  }),
});
export type PramanSnapshot = z.infer<typeof PramanSnapshotSchema>;
