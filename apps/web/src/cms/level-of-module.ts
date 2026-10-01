import { type Level, LevelSchema } from '@siliconbox/shared';
import type { PayloadRequest } from 'payload';

/** A relationship value is an id, or the related document when Payload populated it. */
export function relationId(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'id' in value) return String(value.id);
  return String(value);
}

/** The level of the course a module belongs to. */
export async function levelOfModule(req: PayloadRequest, moduleId: string): Promise<Level> {
  const courseModule = await req.payload.findByID({
    collection: 'modules',
    id: moduleId,
    depth: 0,
    req,
  });
  const course = await req.payload.findByID({
    collection: 'courses',
    id: relationId(courseModule.course),
    depth: 0,
    draft: true,
    req,
  });
  return LevelSchema.parse(course.level);
}
