import 'server-only';
import type { z } from 'zod';
import { AppError } from '@/server/errors';

export type InputSchemas = { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };

type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined;
export type ParsedInput<S extends InputSchemas> = {
  params: Infer<S['params']>;
  query: Infer<S['query']>;
  body: Infer<S['body']>;
};

const MAX_BODY_BYTES = 64 * 1024;

/** Parses params, query and body with strict schemas; anything else is a 400. */
export async function parseInput<S extends InputSchemas>(
  schemas: S,
  request: Request,
  params: unknown,
): Promise<ParsedInput<S>> {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return {
    params: parseWith(schemas.params, params),
    query: parseWith(schemas.query, query),
    body: schemas.body === undefined ? undefined : parseWith(schemas.body, await readJson(request)),
  } as ParsedInput<S>; // Each field was parsed by the schema it is typed from.
}

function parseWith(schema: z.ZodType | undefined, value: unknown): unknown {
  if (schema === undefined) return undefined;
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION_FAILED', result.error.message);
  return result.data;
}

async function readJson(request: Request): Promise<unknown> {
  // Refuse on the declared length before reading, then check the real size.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    throw new AppError('VALIDATION_FAILED', 'declared body too large');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new AppError('VALIDATION_FAILED', 'body too large');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError('VALIDATION_FAILED', 'body is not JSON');
  }
}
