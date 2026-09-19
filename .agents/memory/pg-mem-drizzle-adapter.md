---
name: pg-mem Drizzle adapter
description: The array-row compatibility constraint between pg-mem and Drizzle's node-postgres driver.
---

When using pg-mem with Drizzle's node-postgres driver, keep `rowMode: "array"` semantics intact. pg-mem normally returns object rows, while Drizzle maps array-mode results by positional field order; stripping `rowMode` makes every selected property appear as `undefined`.

**Why:** The mismatch caused false failures in idempotency, invite status, sequence verification, and mediated-message tests even though the route logic was correct.

**How to apply:** In the isolated test pool only, preserve the query's row mode, call pg-mem's adapter without unsupported type parser options, and convert adapted object rows to arrays using the result field order before Drizzle maps them.