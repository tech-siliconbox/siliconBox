import { describe, expect, it } from 'vitest';
import { ConfigSchema } from './config';

const base = {
  NODE_ENV: 'test',
  MONGODB_URI_APP: 'mongodb://127.0.0.1:27017/siliconbox_test',
  MONGODB_URI_ANSWERS: 'mongodb://127.0.0.1:27017/siliconbox_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
};

describe('ConfigSchema', () => {
  it('treats Google variables left empty as unset', () => {
    const config = ConfigSchema.parse({ ...base, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
    expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it.each([
    ['a short auth secret', { ...base, BETTER_AUTH_SECRET: 'short' }],
    ['a missing database URI', { ...base, MONGODB_URI_APP: undefined }],
    ['only half of the Google pair', { ...base, GOOGLE_CLIENT_ID: 'id' }],
  ])('rejects %s', (_label, env) => {
    expect(ConfigSchema.safeParse(env).success).toBe(false);
  });
});
