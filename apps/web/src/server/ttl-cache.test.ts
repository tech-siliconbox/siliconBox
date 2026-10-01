import { describe, expect, it } from 'vitest';
import { createTtlCache } from './ttl-cache';

describe('createTtlCache', () => {
  it('returns a value until it expires, then forgets it', () => {
    let now = 1_000;
    const cache = createTtlCache<string>(30_000, () => now);
    cache.set('lesson', 'published text');
    now += 29_999;
    expect(cache.get('lesson')).toBe('published text');
    now += 1;
    expect(cache.get('lesson')).toBeUndefined();
  });

  it('can be cleared at once, for example when content is published', () => {
    const cache = createTtlCache<string>(30_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect([cache.get('a'), cache.get('b')]).toEqual([undefined, undefined]);
  });
});
