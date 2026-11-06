# World ID integration debrief

Written during the build (Fri 6 → Sat 7 Nov 2026) for the "Best Use of IDKit" bounty. Updated as the flow changes.

## The trust moment

A Trench is a trading competition with a prize pool. The one thing an attacker gains from a fake identity is a second slot on the leaderboard: two wallets, two shots at the prize. The product event that needs trust is therefore **joining a Trench**, and the guarantee we need is "one leaderboard slot per human".

**Credential: Proof of Human** (`proofOfHuman()` preset, identifier `proof_of_human`, legacy `orb` accepted). It is the only World ID credential documented with "Sybil resistance: Yes". We do not need who the person is, their country or their age, so passport, Identity Check or Selfie Check would add friction for no gain. Selfie Check in particular carries a sybil score, not a uniqueness guarantee, so it would not close the second-slot hole.

## What we built

- Client: `IDKitRequestWidget` (IDKit 4.6), action `join-trench`, signal `trenchId:wallet`, backend-signed `rp_context` from `GET /api/world/rp-context`. Code: `apps/web/components/trench/join-panel.tsx`.
- Server: `POST /api/trenches/[id]/join` forwards the IDKit result unchanged to `POST /api/v4/verify/{rp_id}`, then enforces environment, action, signal hash, credential identifier and a single-use nonce we issued (`packages/worldid/src/verify.ts`). The nullifier is stored as `sha256(nullifier + TRENCH_SALT)` with a unique index per Trench (`world_verifications`), which is what makes "once per Trench" true regardless of Portal behaviour.
- Four paths, each a Playwright test (`e2e/f2-join.spec.ts`): success, cancel (nothing sent), invalid proof (401, "Verification failed. Try again."), duplicate human (409, "You've already entered this Trench."). Join is disabled with the reason on draft and ended Trenches.

## Mocked proofs

No phone and no Orb at the venue, and the hackathon note about mocked proofs sits under the Agent Pass prize rather than IDKit. We therefore run with `WORLD_MOCK=true`: the client builds a well-formed 4.0 result and the server skips only the Portal call. Everything else is enforced exactly as in production: the result must carry a nonce this server signed within the last 300 s, the right action, environment and signal hash. An unsolicited payload is rejected (covered by the invalid-proof test). Set `WORLD_MOCK=false` and the same code path calls the Developer Portal.

## Time to first success

- Reading the docs and writing the verifier against the 4.0 shapes: about 2 h on day 1 (step 2), most of it spent discovering that every public sample still shows the 2.x `IDKitWidget` render-prop API, which no longer exists.
- Wiring the widget, the rp_context route and the join route, plus the four-path tests: about 3 h on day 2, with roughly an hour lost to an unrelated bundling problem.
- First end-to-end mocked success: see `PROGRESS.md` (step 4 entry) for the exact run and links.

## Friction

1. **Two generations of docs in the wild.** Blog posts, the archived `idkit-js` repo and most LLM training data show `IDKitWidget` with `signal`/`verification_level` props. Only `world.id/SKILL.md` says plainly that those will not work with 4.x.
2. **Uniqueness semantics changed and the docs say so only in passing.** In 4.0 the signal does not change the nullifier, and the Portal accepts nullifier reuse. The practical pattern (one action per operation, or your own unique index) is spread across the migration page and the Portal MCP skill rather than the integration guide.
3. **Staging vs production vs sandbox vs simulator.** Four environments, and a mismatch "silently produces zero proofs". We never found a documented IDKit mock mode, which is why we built our own gated one.
4. **`rp_context` expires in 300 s**, so it must be fetched right before opening the widget. Obvious once known, easy to get wrong with a fetch-on-page-load pattern.
5. Minor: the 4.0 `nullifier` is documented as decimal in the types and shown as hex in the examples. `BigInt()` handles both; we canonicalise to decimal.

## Missing capabilities or docs

- A first-party mock or test mode for IDKit, documented next to the integration guide, with a stated `environment` value and a `rp_id` whose verify endpoint returns success.
- A one-page "how uniqueness works in 4.0" with the three options (per-operation actions, per-app index, session proofs) and when to use each.
- A statement on whether the browser simulator returns 3.0 `orb` or 4.0 `proof_of_human` items today.

## Single highest-impact improvement

Ship an official **mock environment** (`environment: "mock"` or a documented test `rp_id`) that IDKit and the verify endpoint both understand. Hackathon and CI integrations would then exercise the real widget and the real endpoint shape without a phone, and nobody would need to write their own gated mock, which is the part most likely to be done insecurely.
