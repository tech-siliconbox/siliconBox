# Rotate secrets

Secrets: database users, Razorpay key and webhook secret, Better Auth secret, service token for the solver, Cloudflare tokens, email API key.

1. Create the new secret in the host secret store.
2. Deploy code that accepts old and new where it matters (webhook secret, service token).
3. Switch to the new one; remove the old one after one full deploy cycle.
4. For a suspected exposure: rotate immediately, revoke sessions if auth secrets were involved, review the audit log, and follow `account-takeover-or-leak.md`.
5. Never paste secrets into chat, tickets, logs or commits.
