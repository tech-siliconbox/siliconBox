import { execFileSync } from 'node:child_process';
import { BASE_URL } from '../base-url';
import type { AdminRole } from '@siliconbox/shared';
import { type APIRequestContext, request } from '@playwright/test';

/** Creates a CMS admin with `role` and returns an API client signed in as them. */
export async function signInAsAdmin(role: AdminRole): Promise<APIRequestContext> {
  const email = `${role}-${crypto.randomUUID()}@example.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  execFileSync('npx', ['payload', 'run', 'e2e/cms/seed-admin.ts'], {
    env: {
      ...process.env,
      E2E_ADMIN_EMAIL: email,
      E2E_ADMIN_PASSWORD: password,
      E2E_ADMIN_ROLE: role,
    },
    stdio: 'ignore',
  });
  const client = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  });
  const login = await client.post('/cms-api/admins/login', { data: { email, password } });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);
  return client;
}

/** Creates a CMS document; empty ids mean the CMS refused it (see `status`). */
export async function createDoc(
  client: APIRequestContext,
  collection:
    | 'courses'
    | 'modules'
    | 'lessons'
    | 'drills'
    | 'drill_private'
    | 'companies'
    | 'questions'
    | 'answers',
  data: Record<string, unknown>,
): Promise<{ id: string; publicId: string; slug: string; status: number }> {
  const response = await client.post(`/cms-api/${collection}`, { data });
  const body = (await response.json()) as {
    doc?: { id: string; publicId?: string; slug?: string };
  };
  const doc = body.doc;
  return {
    id: doc?.id ?? '',
    publicId: doc?.publicId ?? '',
    slug: doc?.slug ?? '',
    status: response.status(),
  };
}

export const paragraph = (text: string) => ({ blockType: 'paragraph', text });

/** One of each remaining block type, stored the way the CMS stores them. */
export const EVERY_OTHER_BLOCK = [
  { blockType: 'heading', level: '2', text: 'Invented heading' },
  { blockType: 'code', language: 'systemverilog', code: 'module invented; endmodule' },
  { blockType: 'assertion', code: 'assert property (@(posedge clk) req |-> ##1 ack);' },
  { blockType: 'callout', tone: 'tip', text: 'Invented tip.' },
  {
    blockType: 'diagram',
    alt: 'Invented diagram',
    svg: '<svg viewBox="0 0 10 10" onload="alert(1)"><rect width="10" height="10"/></svg>',
    caption: '**Figure 1.** Invented caption.',
  },
  {
    blockType: 'list',
    ordered: true,
    items: [{ text: 'Invented question?', answer: 'Invented answer.' }],
  },
  {
    blockType: 'table',
    columns: [{ text: 'Invented column' }, { text: 'Other' }],
    rows: [{ cells: [{ text: '`a`' }, { text: 'Invented cell' }] }],
  },
  {
    blockType: 'reveal',
    label: 'Show invented hints',
    content: [{ blockType: 'paragraph', text: 'Invented hint.' }],
  },
  {
    blockType: 'stateGraph',
    simulationTitle: 'Invented simulation',
    simulationText: 'Random tests from reset.',
    formalTitle: 'Invented formal',
    formalText: 'Every state, depth by depth.',
    testLength: 3,
    states: [
      { label: 'S0', x: 40, y: 40, note: 'reset' },
      { label: 'S1', x: 120, y: 40 },
      { label: 'S2', x: 200, y: 40, hidesBug: true },
    ],
    transitions: [
      { from: 'S0', to: 'S1', chance: 0.5 },
      { from: 'S1', to: 'S2', chance: 0.5 },
    ],
  },
];

/** A Support admin grants a learner Basic content (or tool) access for a day, via the CMS API. */
export async function grantAccess(
  support: APIRequestContext,
  learnerEmail: string,
  kind: 'content' | 'tool' = 'content',
) {
  const now = Date.now();
  return support.post('/cms-api/access-grants', {
    data: {
      learnerEmail,
      kind,
      ...(kind === 'content' ? { level: 'basic' } : {}),
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      reason: 'End-to-end test grant',
    },
  });
}
