# Friction

Logged while integrating SDK 1.0.1 against Rabdi (Nov 5–7, 2026).

1. **No `IN` / `NOT`.** `status IN (funded, live)` becomes `or(eq, eq)`; fine, but every tutorial example filters on a single value, so it took a read of the query grammar to be sure.
2. **One `orderBy` and `limit ≤ 100`.** Discovery sorted by pool size has to sort in JS after fetching by `startAt`.
3. **Shared writer wallet + two processes = nonce clashes.** The web app and the worker both write; concurrent writes from one key occasionally fail with `Transaction failed: Execution error without revert data`. We added a one-retry wrapper (`withArkivRetry`) and claim status transitions in Postgres first so only one process writes a given change. A nonce manager or a "wait for inclusion" helper in the SDK would remove that class of error.
4. **Bytes columns take `Uint8Array` on write but return hex on read**, and `ExpirationTime.fromBlocks` takes a `number` while block timings come back as `bigint`. Both are small, both cost a failed first attempt.
5. **Adding optional columns to an existing named schema** (the identity fields on `trenches.profile`) worked without migration, which was pleasant, but is not spelled out anywhere.
6. **Explorer entity URLs** were a guess (`/entity/<key>`) confirmed only by trying them.
7. The "update in place is unsupported" note from an earlier SDK is still floating around; 1.0's `patchEntity` works and we rely on it.
