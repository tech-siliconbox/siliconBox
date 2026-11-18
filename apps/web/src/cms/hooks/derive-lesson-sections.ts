import type { CollectionBeforeChangeHook } from 'payload';
import type { Lesson } from '../payload-types';
import { deriveSections } from '../lesson-sections';

/** On every save: the page's parts for the course index, and an anchor on each (ADR 0024). */
export const deriveLessonSections: CollectionBeforeChangeHook<Lesson> = ({ data, originalDoc }) => {
  // A field the save leaves out keeps its stored value; one sent as null was cleared.
  const blocks = 'blocks' in data ? data.blocks : originalDoc?.blocks;
  const minutes = 'durationMinutes' in data ? data.durationMinutes : originalDoc?.durationMinutes;
  if (blocks === undefined) return data;
  return { ...data, ...deriveSections(blocks, minutes) };
};
