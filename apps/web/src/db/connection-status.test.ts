import { describe, expect, it } from 'vitest';
import { connectionProblem, describeDatabase } from './connection-status';

// Invented hosts and credentials only.
const URI = 'mongodb+srv://invented_app:invented-secret-pass@invented.example.test/siliconbox?w=1';

/** An error with a chain of causes, the way the MongoDB driver nests them. */
function nested(...layers: { name?: string; message: string; code?: string | number }[]) {
  return layers.reduceRight<Error | undefined>(
    (cause, { name, message, code }) =>
      Object.assign(new Error(message, { cause }), name ? { name } : {}, code ? { code } : {}),
    undefined,
  );
}

describe('describeDatabase', () => {
  it('names the host, database and user, never the password', () => {
    const where = describeDatabase(URI);
    expect(where).toEqual({
      host: 'invented.example.test',
      database: 'siliconbox',
      user: 'invented_app',
    });
    expect(JSON.stringify(where)).not.toContain('invented-secret-pass');
  });

  it('copes with no database name and with a string it cannot read', () => {
    expect(describeDatabase('mongodb://invented.example.test:27017').database).toBe('(default)');
    expect(describeDatabase('not a connection string').host).toBe('(unreadable connection string)');
  });
});

describe('connectionProblem', () => {
  it('reads a network Atlas refuses from the TLS alert under the driver error', () => {
    const atlasRefusal = nested(
      { name: 'MongoServerSelectionError', message: 'Server selection failed' },
      { name: 'MongoNetworkError', message: 'network error' },
      {
        message: 'ssl3_read_bytes:tlsv1 alert internal error',
        code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR',
      },
    );
    expect(connectionProblem(atlasRefusal)).toBe('network refused');
  });

  it.each([
    [
      'address lookup',
      nested({ message: 'querySrv ENOTFOUND _mongodb._tcp.invented.example.test' }),
    ],
    [
      'sign-in',
      nested({ name: 'MongoServerError', message: 'bad auth : authentication failed', code: 18 }),
    ],
    [
      'no answer',
      nested({
        name: 'MongoServerSelectionError',
        message: 'Server selection timed out after 10000 ms',
      }),
    ],
    ['other', nested({ message: 'something else' })],
    ['other', 'not an error at all'],
  ])('reads %s', (problem, error) => {
    expect(connectionProblem(error)).toBe(problem);
  });
});
