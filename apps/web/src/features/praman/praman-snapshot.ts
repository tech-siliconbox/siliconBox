import { z } from 'zod';
import { CoverageSchema, EquivalenceSchema, StrengthSchema } from './praman-reports';

/**
 * What the tool page reads of Praman's session state (apps/solver/app/praman/session.py,
 * Session.snapshot): the design, its properties, the settings and the proof, and the deeper
 * checks' results (praman-reports.ts). A result that does not read as expected shows as none.
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
  /** Related covers and the cases of a split: the id of their assertion. */
  parent: z.string().default(''),
  supported: z.boolean().default(true),
  disabled: z.boolean().default(false),
  /** The task it is in; '' for the design's own properties. */
  task: z.string().default(''),
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
    finished_at: z.number().nullable().default(null),
    total: z.number().int(),
    time_limit: z.number(),
  }),
  strength: StrengthSchema.nullable().catch(null),
  coverage: CoverageSchema.nullable().catch(null),
  equivalence: EquivalenceSchema.nullable().catch(null),
  abstracts: z.array(z.object({ signal: z.string(), kind: z.string() })).catch([]),
});
export type PramanSnapshot = z.infer<typeof PramanSnapshotSchema>;
