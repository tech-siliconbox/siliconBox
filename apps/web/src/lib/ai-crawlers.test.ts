import { describe, expect, it } from 'vitest';
import { isRefusedAgent } from './ai-crawlers';

describe('isRefusedAgent', () => {
  it.each([
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    'CCBot/2.0 (https://commoncrawl.org/faq/)',
    'python-requests/2.32.3',
    'curl/8.7.1',
    '',
    null,
  ])('refuses %s', (agent) => {
    expect(isRefusedAgent(agent)).toBe(true);
  });

  it('lets a browser through', () => {
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
    expect(isRefusedAgent(chrome)).toBe(false);
  });
});
