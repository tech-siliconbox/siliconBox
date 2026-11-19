import 'server-only';
import type { Level } from '@siliconbox/shared';

/** Assessments and capstones are part of their level's paid content, never a free preview. */
export const courseWorkAccess = (level: Level) =>
  ({ kind: 'lesson', level, isPreview: false }) as const;
