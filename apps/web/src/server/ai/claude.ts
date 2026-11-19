import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { getConfig } from '../config';
import { AppError } from '../errors';
import { log } from '../log';

// The one way to Claude (ADR 0030): server only, one request and one structured answer, no tools.
// Text sent and received is never logged; only the outcome, token counts and time are.

/** One model for every AI feature; a change is a one-line, reviewed edit. */
export const AI_MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 8000;
const TIMEOUT_MS = 60_000;

let client: Anthropic | undefined;

/** AI options show only when a key is set; without one the tools work as before. */
export const isAiConfigured = (): boolean => getConfig().ANTHROPIC_API_KEY !== undefined;

export function assertAiConfigured(): void {
  if (!isAiConfigured()) throw new AppError('AI_UNAVAILABLE', 'ANTHROPIC_API_KEY is not set');
}

function claude(): Anthropic {
  assertAiConfigured();
  // One retry: the SDK retries rate limits, overload, server errors and dropped connections,
  // honouring retry-after, so the wait stays inside the route's time limit.
  client ??= new Anthropic({
    apiKey: getConfig().ANTHROPIC_API_KEY,
    timeout: TIMEOUT_MS,
    maxRetries: 1,
    logLevel: 'off',
  });
  return client;
}

export type AiRequest<T extends z.ZodType> = { system: string; content: string; schema: T };
export type AskClaude = <T extends z.ZodType>(request: AiRequest<T>) => Promise<z.infer<T>>;

/** The kind of failure, for the log: never the error's text, which could echo what was sent. */
function failureOf(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return [error.constructor.name, error.status, error.requestID].filter(Boolean).join(' ');
  }
  return error instanceof Error ? error.constructor.name : 'unknown';
}

/** One answer in the schema's shape; any failure is AI_UNAVAILABLE, with the reason logged. */
export const askClaude: AskClaude = async ({ system, content, schema }) => {
  const started = Date.now();
  try {
    const message = await claude().messages.parse({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      inference_geo: 'us',
      output_config: { effort: 'medium', format: zodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content }],
    });
    log('info', 'ai_call', {
      model: AI_MODEL,
      stopReason: message.stop_reason,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      ms: Date.now() - started,
      requestId: message._request_id ?? null,
    });
    if (message.stop_reason !== 'end_turn' || message.parsed_output === null) {
      throw new AppError('AI_UNAVAILABLE', `stopped: ${message.stop_reason ?? 'unknown'}`);
    }
    return message.parsed_output;
  } catch (error) {
    throw error instanceof AppError ? error : new AppError('AI_UNAVAILABLE', failureOf(error));
  }
};
