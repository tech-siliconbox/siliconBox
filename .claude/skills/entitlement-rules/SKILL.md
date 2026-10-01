---
name: entitlement-rules
description: Use when writing or changing purchase, upgrade, validity, tool-window or access-check code. Holds the confirmed SiliconBox access rules and the algorithm.
---

# Entitlement rules

Source of truth: `docs/product/access-model.md`. Tests: `docs/testing/entitlement-test-matrix.md`.

## Facts

- Levels: Basic ₹5,000, Intermediate ₹10,000, Advance ₹15,000. INR, no GST (tax rate setting, default 0).
- Content validity: Basic 3 months; Intermediate = Basic + Intermediate for 6 months (3 + 3); Advance = all three levels for 9 months (3 + 3 + 3).
- Tool access is a separate 3-month window. Every purchase and upgrade starts a new one from the purchase date.
- Upgrade price is the difference only while the lower tier is active; once it has ended, full price.
- Intermediate bought while Basic is active: adds Intermediate for 3 months from purchase; Basic keeps its own end date.
- Advance bought while Basic or Intermediate is active: all three levels for 9 months from purchase.
- When a window ends, lessons, drills and answers for that level lock; public outline stays.
- Answers, Resume Builder and CV screening need an active content entitlement.
- Admin can shorten or extend any content or tool window; every change needs a reason and is audit-logged.

## Algorithm sketch

```
price(tier, held):
  if held is active and held < tier: return PRICE[tier] - PRICE[held]
  return PRICE[tier]

grant(tier, held, purchaseDate):
  if nothing held or held ended:
      Basic        -> content Basic          [d, d+3m]
      Intermediate -> content Basic+Inter.   [d, d+6m]
      Advance      -> content all three      [d, d+9m]
  elif tier == Intermediate and held == Basic (active):
      content Intermediate [d, d+3m]; Basic unchanged
  elif tier == Advance and held in {Basic, Intermediate} (active):
      content all three [d, d+9m]
  tool window [d, d+3m]   # always new
```

Write all records in one transaction, from a verified webhook only. Unique index: payment id; entitlement per user, kind and level.

## Watch for

- Never take price, tier or validity from the request body.
- "Active" means now is between start and end of the held entitlement, evaluated on the server clock.
- Test every row in the matrix, including boundaries (last second of a window).
