// Golden rule (ADR 0027): AI crawlers and scraping tools get no page. They are named in
// robots.txt and refused by the proxy. A user agent can be faked, so this stops only the ones
// that say who they are; sign-in, entitlement checks, read pacing, one device at a time and
// watermarks stop the rest.

/** AI crawlers by their published names, as robots.txt lists them. */
export const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'Claude-Web',
  'anthropic-ai',
  'CCBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'Amazonbot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'meta-externalagent',
  'meta-externalfetcher',
  'FacebookBot',
  'ImagesiftBot',
  'Omgilibot',
  'YouBot',
  'Timpibot',
  'AI2Bot',
  'DuckAssistBot',
  'MistralAI-User',
  'PanguBot',
] as const;

/** Scripted clients a browser never presents itself as. */
const SCRAPING_TOOLS = [
  'scrapy',
  'python-requests',
  'python-urllib',
  'aiohttp',
  'httpx',
  'go-http-client',
  'node-fetch',
  'axios/',
  'curl/',
  'wget/',
  'libwww-perl',
  'okhttp',
];

const REFUSED = [...AI_CRAWLERS.map((name) => name.toLowerCase()), ...SCRAPING_TOOLS];

/** True for a request from a declared AI crawler, a scraping tool, or one with no user agent. */
export function isRefusedAgent(userAgent: string | null): boolean {
  const agent = (userAgent ?? '').trim().toLowerCase();
  return agent === '' || REFUSED.some((token) => agent.includes(token));
}
