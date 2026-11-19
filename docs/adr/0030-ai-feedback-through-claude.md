# 0030. AI feedback on CVs and resumes through Claude

- Status: Proposed
- Date: 2026-11-19

## Context

CV screening and the Resume Builder (ADR 0016) give rule-based feedback only. Rules cannot say
how well a CV fits a particular job, which gaps matter for it, or how to rewrite a weak bullet.
A language model can. But a CV is personal data under India's DPDP Act, and its text is
untrusted input that can carry instructions aimed at the model. This would be the first time
learners' own content leaves our stack (Vercel, Atlas, Upstash, Cloudflare, Resend) for an AI
provider.

## Decision

### Provider and model

- Claude, through Anthropic's own API (Messages API), called only from the server with the
  official TypeScript SDK (`@anthropic-ai/sdk`, exact pin, a `server-only` module). No browser
  code, no third-party script, no agent and no tools: one request, one structured answer.
- Model `claude-opus-5-5`. Effort `medium`, set explicitly; thinking is adaptive (Opus 5.5
  always thinks). `max_tokens` 8,000. The model id is one server constant, so a change is a
  one-line, reviewed edit.
- No beta API features, like our dependencies (stable only): Anthropic's server-side refusal
  fallback is not used. A refusal simply means no AI feedback this time.

### What the AI does, and what it never does

- The rule-based report stays the base and the only score. The AI adds judgement on top: how
  the CV fits a pasted job description, the gaps between them, and rewrites of specific bullets.
  In CV screening the learner asks for it on a saved report (`POST
  /api/v1/cv-screenings/:id/feedback`); the server reads that report's kept CV file.
  In the Resume Builder it proposes edits that the learner accepts or rejects one by one;
  nothing changes without a click.
- It never gives a score or percentage, never invents employers, dates, tools or numbers, and
  never receives course content.

### Personal data (DPDP)

- **Consent per use.** An unticked box beside the upload names Anthropic and says what is sent,
  where it is processed, how long Anthropic keeps it and that it is not used for training.
  Nothing is sent without the tick. Each use is written to the audit log: learner, time, notice
  version and outcome, never the text.
- **Send the least.** Only the extracted text goes, never the file. Email addresses, phone
  numbers, links, the learner's name and personal-detail lines (date of birth and the like) are
  replaced with placeholders first. The Resume Builder sends its sections without the contact
  block.
- **CVs stored per learner** (founder, 2026-11-19, as ADR 0016 asks). The uploaded file is kept
  with its screening report under the learner's account, for their newest 5 CVs (older reports
  keep the report only), and only they can download it. It goes with Delete (one report, all
  reports, or the account). The data download lists it without its bytes. AI feedback is kept
  with its report the same way. Job descriptions are not stored, only the match results.
- **Processor terms.** Anthropic acts as our processor under its Commercial Terms and data
  processing addendum. Under those terms API inputs and outputs are not used to train models,
  and are deleted within 30 days (kept up to 2 years only if flagged for a usage-policy breach).
  We never send Anthropic feedback on answers and never opt in to data sharing. Zero data
  retention needs a separate agreement with Anthropic; not now.
- **Outside India.** Requests set `inference_geo: "us"` so the notice can name one country
  (10% price premium). DPDP section 16 and rule 15 allow transfers unless the government
  restricts the destination; no restriction had been notified on this date.
- **Notice first.** The privacy notice lists Anthropic as a processor and has a section on AI
  feedback. The AI option stays off for learners until that notice is published.

### Untrusted input

- The CV and job description go in as marked data blocks, and the system prompt says text
  inside them is data, never instructions. The model has no tools, so injected text cannot make
  it act; at most it shapes its own answer, which only the same learner sees.
- The answer is constrained to a JSON schema (structured outputs), then parsed again with a
  strict Zod schema from `packages/shared`: fixed fields, length caps, no score fields.
- Grounding checks run on the server before anything is saved or shown. A rewrite must target a
  passage we sent and may not add a number that passage lacks. Suggestions may not contain
  links, email addresses or phone numbers. A gap must name something the job description asks
  for. An import may only contain values found in the source text. Failing items are dropped;
  if most fail, the whole answer is discarded.
- The page shows the feedback as plain text: no HTML, no Markdown, no links.

### Cost, quotas and failures

- One AI allowance per learner across both tools: 5 a day and 30 per 30 days, defined once in
  `packages/shared` and counted in Redis like the Drill run quota. A use is reserved before the
  call and given back if the call fails.
- At list price on this date ($4 per million input tokens, $20 per million output), a typical CV
  review (about 5,000 tokens in, 3,000 out with thinking) costs about $0.08; the worst case,
  capped by `max_tokens`, about $0.19. A learner using the whole allowance costs at most about
  $6 per 30 days. Each Anthropic workspace (development and production apart) has a monthly
  spend limit and alerts.
- Each attempt times out after 60 s. The SDK retries once on rate limits, overload, server
  errors and dropped connections, honouring `retry-after`. The route allows 150 s, inside
  Vercel's limit.
- On any failure (timeout, provider error, refusal, a cut-off answer, schema or grounding
  failure) the learner still gets and keeps the rule-based report, with a note that AI feedback
  is not available now and the attempt did not use their allowance.
- Without `ANTHROPIC_API_KEY` the AI options are hidden and both tools work as before (the
  pattern of ADR 0028). Revoking the key in Anthropic's Console stops AI at once, without a
  deploy.

### Secrets and logs

- `ANTHROPIC_API_KEY` lives in the host secret store and is validated by `getConfig`. It is
  never in the repo, the client bundle, logs, URLs or error messages.
- Logs hold the outcome, model, token counts, time taken and Anthropic's request id. Never CV
  text, job descriptions, prompts or answers.

### Before it opens

An evaluation on synthetic formal verification CVs and job descriptions, including prompt
injection attempts, run by hand with the founder's approval (each run costs money): schema pass
rate, items dropped by the grounding checks, time and cost per call.

## Consequences

- Learners get feedback rules cannot give, and the score stays something they can check.
- Anthropic becomes the first outside processor of learner content: the privacy notice, the
  processor list and `docs/legal/privacy-dpdp.md` change before learners can use it. DPDP needs
  verifiable parental consent for anyone under 18, so the terms should require learners to be
  18 or over.
- Running cost grows with use; the allowance and the spend limits bound it. Cost per call and
  the grounding drop rate are watched in the logs.
- If the government restricts transfers to the United States, AI feedback turns off until a
  provider can process the data somewhere allowed.
- A new model, another provider or zero data retention is a new decision: update this ADR or
  write a new one.
