import { describe, expect, it } from 'vitest';
import { ToolWhatIfSchema } from './praman';

const SESSION = '6f1c1d38-2f6b-4b0e-9c51-2d7d1c1f7a10';

describe('ToolWhatIfSchema', () => {
  it.each([
    ['the proof run', `${SESSION}_r3`],
    ['a what-if trace', `${SESSION}_w0a1b2c3d`],
    ['a cover trace', `${SESSION}_c0a1b2c3d`],
    ['nothing', ''],
  ])('may differ from %s', (_, differFrom) => {
    const body = ToolWhatIfSchema.parse({ property: 'counter.no_wrap', differFrom });
    expect(body.differFrom).toBe(differFrom);
  });

  it.each([
    ['a path', `${SESSION}_r3/../x`],
    ['a run without a number', `${SESSION}_r`],
    ['another kind of job', `${SESSION}_x0a1b2c3d`],
    ['a job id alone', 'r3'],
  ])('refuses %s to differ from', (_, differFrom) => {
    expect(ToolWhatIfSchema.safeParse({ property: 'p', differFrom }).success).toBe(false);
  });
});
