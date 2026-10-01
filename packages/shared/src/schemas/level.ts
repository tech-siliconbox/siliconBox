import { z } from 'zod';

/** Ordered lowest to highest; order drives upgrade pricing. */
export const LevelSchema = z.enum(['basic', 'intermediate', 'advance']);
export type Level = z.infer<typeof LevelSchema>;

export const LEVELS = LevelSchema.options;

export function levelRank(level: Level): number {
  return LEVELS.indexOf(level);
}

/** Levels a fresh purchase of `level` opens: it and every level below it. */
export function levelsUpTo(level: Level): Level[] {
  return LEVELS.slice(0, levelRank(level) + 1);
}
