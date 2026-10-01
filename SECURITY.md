# Security policy

## Reporting a vulnerability

Email the owner at the address listed on siliconbox.in/security (set this up before launch). Do not open a public issue. Include steps to reproduce and the affected URL. We aim to acknowledge within 3 working days.

## Scope

In scope: siliconbox.in, admin.siliconbox.in, the learning API, the payment webhook and the solver service. Out of scope: social engineering, denial-of-service testing and any test that reads another learner's data.

## Rules for contributors

- Never commit secrets, API keys, real learner data or premium content.
- Never weaken a gate to make a test pass: authenticate, authorise, validate, rate-limit.
- Report a suspected leak at once; follow `docs/runbooks/account-takeover-or-leak.md`.

Full design: `docs/security/`.
