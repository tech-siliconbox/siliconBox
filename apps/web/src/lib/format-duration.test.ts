import { describe, expect, it } from 'vitest';
import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it.each([
    [45, '45 min'],
    [60, '1 h'],
    [150, '2.5 h'],
    [200, '3.3 h'],
  ])('%i minutes is %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
