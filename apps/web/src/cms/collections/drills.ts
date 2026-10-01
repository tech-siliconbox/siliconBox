import {
  DRILL_MODES,
  DRILL_SOLVERS,
  DRILL_TARGETS,
  TOP_MODULE_PATTERN,
  drillLimitProblem,
} from '@siliconbox/shared';
import { APIError, type CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { orderField, titleField } from '../fields/common';
import { publicIdField } from '../fields/public-id';
import { slugField } from '../fields/slug';
import { levelOfModule, relationId } from '../level-of-module';
import { LESSON_BLOCKS } from './lesson-blocks';

const options = (values: readonly string[]) => values.map((value) => ({ label: value, value }));

type DrillSettings = { module?: unknown; depth?: number; timeoutSeconds?: number };

/**
 * The learner-visible part of a Drill: brief, files and the solver settings the server attaches
 * to every run. Private material (solution, hidden properties, bug variants) is in drill_private.
 */
export const Drills: CollectionConfig = {
  slug: 'drills',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'module', 'mode', 'target', '_status'] },
  access: contentAccess,
  versions: { drafts: true, maxPerDoc: 50 },
  defaultSort: 'order',
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const settings = {
          ...(originalDoc as DrillSettings | undefined),
          ...(data as DrillSettings),
        };
        if (settings.module === undefined || settings.depth === undefined) return data;
        const level = await levelOfModule(req, relationId(settings.module));
        const problem = drillLimitProblem(level, {
          depth: settings.depth,
          timeoutSeconds: settings.timeoutSeconds ?? 0,
        });
        if (problem !== null) throw new APIError(problem, 400, null, true);
        return data as Record<string, unknown>;
      },
    ],
  },
  fields: [
    titleField,
    slugField,
    { name: 'module', type: 'relationship', relationTo: 'modules', required: true, index: true },
    orderField,
    { name: 'topic', type: 'text', maxLength: 100 },
    {
      type: 'row',
      fields: [
        {
          name: 'mode',
          type: 'select',
          required: true,
          defaultValue: 'prove',
          options: options(DRILL_MODES),
        },
        {
          name: 'solver',
          type: 'select',
          required: true,
          defaultValue: 'boolector',
          options: options(DRILL_SOLVERS),
        },
        {
          name: 'target',
          type: 'select',
          required: true,
          defaultValue: 'PASS',
          options: options(DRILL_TARGETS),
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'depth', type: 'number', required: true, defaultValue: 20, min: 1 },
        { name: 'timeoutSeconds', type: 'number', required: true, defaultValue: 60, min: 1 },
        {
          name: 'topModule',
          type: 'text',
          required: true,
          defaultValue: 'top',
          validate: (value: unknown) =>
            typeof value === 'string' && TOP_MODULE_PATTERN.test(value)
              ? true
              : 'Use a plain SystemVerilog module name.',
        },
      ],
    },
    { name: 'brief', type: 'blocks', required: true, minRows: 1, blocks: LESSON_BLOCKS },
    {
      name: 'designCode',
      type: 'code',
      admin: {
        language: 'systemverilog',
        description: 'Shown to the learner read-only (optional).',
      },
    },
    {
      name: 'starterCode',
      type: 'code',
      required: true,
      admin: { language: 'systemverilog', description: 'What the learner starts editing.' },
    },
    publicIdField,
  ],
};
