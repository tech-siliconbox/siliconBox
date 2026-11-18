import { SLUG_PATTERN, slugify } from '@siliconbox/shared';
import type { Field, FieldHook, TextField, TypeWithID } from 'payload';

export const slugField: TextField = {
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  validate: (value: unknown) =>
    typeof value === 'string' && SLUG_PATTERN.test(value)
      ? true
      : 'Use lowercase words joined by hyphens.',
};

const DERIVED_SLUG_MAX = 60;

/** Keeps a given slug; otherwise makes one from `source`, numbered until it is unused. */
const slugFromSource =
  (source: string): FieldHook<TypeWithID & Record<string, unknown>> =>
  async ({ value, data, originalDoc, req, collection }) => {
    if (typeof value === 'string' && value !== '') return value;
    const text = data?.[source] ?? originalDoc?.[source];
    const base = slugify(typeof text === 'string' ? text : '', DERIVED_SLUG_MAX) || 'item';
    const taken = async (slug: string) =>
      collection !== null &&
      (
        await req.payload.count({
          collection: collection.slug,
          where: { slug: { equals: slug } },
          overrideAccess: true,
        })
      ).totalDocs > 0;
    let slug = base;
    for (let n = 2; await taken(slug); n += 1) slug = `${base}-${n}`;
    return slug;
  };

/**
 * A slug made from another field when none is given (a question's text), unique in its
 * collection: it names the page in the address bar instead of an id.
 */
export function slugFrom(source: string): Field {
  return {
    ...slugField,
    admin: { position: 'sidebar', description: 'Made from the text when left empty.' },
    hooks: { beforeValidate: [slugFromSource(source)] },
  };
}
