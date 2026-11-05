# World ID / IDKit integration reference (researched 2026-11-05)

Scope: everything needed to build the Trenches client widget and server verifier for the
ETHGlobal Mumbai "Best Use of IDKit" bounty. Every item carries the URL it was taken from.
Quotes are verbatim from the source; nothing below is invented. Where the docs are silent,
it is listed in section 9 ("Unknown / must confirm at the booth").

Evidence files (raw downloads, type definitions from the installed packages) were kept in
the research scratchpad, not in the repo.

---

## 0. TL;DR — the API changed; build against IDKit 4.x, not the `IDKitWidget` you will find in old blog posts

- The current SDK is **IDKit 4.x / World ID 4.0**. The React component is
  `IDKitRequestWidget` (controlled: `open` / `onOpenChange`), NOT the legacy render-prop
  `IDKitWidget`. Every request now needs a backend-signed `rp_context` (`rp_id`, `nonce`,
  `created_at`, `expires_at`, `signature`). Source: https://docs.world.org/world-id/4-0-migration
  ("Adopting World ID 4.0 requires upgrading to IDKit 4.x, which introduces major breaking
  changes ... RP context is required ... IDKit response changed: No longer reshape the payload or
  compute `signal_hash` for the verify endpoint ... Use `POST /api/v4/verify/{rp_id}` ...
  `@worldcoin/idkit-standalone` is discontinued").
- The sponsor's own LLM guide (https://world.id/SKILL.md) says: "**DO NOT pin SDKs to `^2.x` or
  `^3.x`** — those examples litter the public internet and **will not work** with v4. The API was
  redesigned. Pin **`^4.x`**".
- Server verification = forward the IDKit result JSON **unchanged** to
  `POST https://developer.world.org/api/v4/verify/{rp_id}` and check `success === true` and
  `environment` matches. No API key, no special headers documented.
- The ETHGlobal Mumbai prize page lists, for the **Agent Pass** prize: "We are mocking proofs now,
  so you don't need sandbox app anymore" / "NOTE: Proofs are using fake identities, DO NOT rely in
  them for production". That note sits in the Agent Pass ($5,000) section, not the IDKit section.
  The IDKit section lists the World ID Simulator and the iOS Sandbox TestFlight app as resources.
  Source: https://ethglobal.com/events/mumbai/prizes/world (see section 7).

Recommended Trenches config (derived from the docs, see sections 4–6 for why):

```
preset:               proofOfHuman({ signal: <caller wallet address> })
allow_legacy_proofs:  true            // accept 3.0 Orb proofs from the browser simulator + real users not yet on 4.0
environment:          process.env.NEXT_PUBLIC_WLD_ENVIRONMENT  // "staging" with simulator, "production" with real phones
action:               `join-trench-${trenchId}`  // one action per trench => one nullifier per (human, trench)
server:               POST https://developer.world.org/api/v4/verify/{rp_id}, body = IDKit result as-is
store:                UNIQUE (nullifier, action) as NUMERIC(78,0) + TEXT
```

---

## 1. Package, install, peer deps, Next.js App Router notes

### 1.1 Versions (from `npm view`, run 2026-11-05)

```
@worldcoin/idkit        version = 4.6.0   (dist-tag latest; modified 2026-10-21T18:21:56Z)
peerDependencies        react: '>=18', react-dom: '>=18', expo-crypto: '^57.0.3'
dependencies            qrcode: '^1.5.4', '@worldcoin/idkit-core': '4.6.0'
dist-tags               latest 4.6.0, dev 4.1.8-dev.6dc4182, alpha 1.0.0-alpha.0
@worldcoin/idkit-core   version = 4.6.0
last 2.x release        2.4.2  (npm prints: "deprecated @worldcoin/idkit@2.4.2: Old-versions moved to new ones")
```

Package README (via `npm view @worldcoin/idkit readme`): "React is a peer dependency. Install React
DOM when using the web widgets; it is optional for applications that only import
`@worldcoin/idkit/hooks`." and "Expo Crypto is an optional peer dependency; ordinary core/hooks
imports do not load it."

Subpath exports (from `npm view @worldcoin/idkit-core exports` and the README):
`@worldcoin/idkit` (widgets + hooks), `@worldcoin/idkit/hooks` (DOM-free), `@worldcoin/idkit/signing`,
`@worldcoin/idkit/hashing`, `@worldcoin/idkit/session`, `@worldcoin/idkit/nullifier`, `@worldcoin/idkit/expo`;
same for `@worldcoin/idkit-core/{signing,hashing,session,nullifier,expo}`.

Repo: https://github.com/worldcoin/idkit (monorepo: `js/packages/core`, `js/packages/react`,
`js/packages/server`, `js/examples/nextjs`). The old https://github.com/worldcoin/idkit-js is
**archived (read-only since 2026-04-14)** and its README still shows the legacy `IDKitWidget` —
do not copy from it.

### 1.2 Install (https://docs.world.org/world-id/idkit/integrate — "Step 1: Install IDKit")

> Use the latest `4.x` version.

```bash
npm i @worldcoin/idkit          # React
npm i @worldcoin/idkit-core     # vanilla JS / server helpers
```

### 1.3 Next.js App Router notes

Source: official example https://github.com/worldcoin/idkit/tree/main/js/examples/nextjs (live at
https://idkit-js-example.vercel.app/, which the ETHGlobal page links as "IDKit JS Example").

- `app/page.tsx` is a **server component** that renders `<DemoClient />`; `app/ui.tsx` starts with
  `"use client";` and is where `IDKitRequestWidget` is imported and rendered. **No `next/dynamic`
  and no `ssr: false`** are used anywhere in the example.
- Example README: "The SDK builds are JavaScript-only. Next.js does not need WASM asset tracing,
  custom loaders or an IDKit-specific `serverExternalPackages` setting."
- Widgets render inside a shadow root: "The widgets apply that CSS inside their shadow roots, so
  applications do not need a separate CSS import." (package README)
- `.env.example` of the example:
  ```
  RP_SIGNING_KEY=0x...                      # server only
  DEV_PORTAL_BASE_URL=https://developer.world.org
  NEXT_PUBLIC_APP_ID=app_...
  NEXT_PUBLIC_RP_ID=rp_...
  ```
- API routes in the example: `app/api/rp-signature/route.ts` (imports `signRequest` from
  `@worldcoin/idkit/signing`) and `app/api/verify-proof/route.ts` (forwards body to
  `${baseUrl}/api/v4/verify/${rp_id}`). Both have `// export const runtime = "nodejs";` commented
  out, i.e. they run on the default Node runtime.
- SKILL.md: "Default to **Next.js (App Router) + TypeScript** as the golden path — every official
  sample uses it". Also: "never expose `RP_SIGNING_KEY` as a `NEXT_PUBLIC_*` var."
- Example also wraps the app in a MiniKit provider for World App testing (`app/layout.tsx`), which
  is optional for a plain web app.

---

## 2. Client API — current (IDKit 4.x) and legacy (IDKit 2.x)

The sponsor's docs currently recommend ONLY the 4.x API (`IDKitRequestWidget` / `IDKit.request`).
The legacy `IDKitWidget` is documented here because Trenches may encounter it in old samples and
because the legacy **verify** endpoint still exists; the legacy widget itself is not in current docs.

### 2.1 Current: `<IDKitRequestWidget>` (exact props from `@worldcoin/idkit@4.6.0` `dist/index.d.ts`)

```ts
type WidgetSharedProps<TResult> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handleVerify?: (result: TResult) => MaybePromise<void>;
  onSuccess: (result: TResult) => MaybePromise<void>;
  onError?: (errorCode: IDKitErrorCodes, debugReport?: IDKitDebugReport) => MaybePromise<void>;
  autoClose?: boolean;
  language?: SupportedLanguage;            // "en" | "es" | "th"
};
type IDKitRequestWidgetProps = IDKitRequestHookConfig & WidgetSharedProps<IDKitResult>;

// hooks.d.ts
type IDKitRequestHookConfig = IDKitRequestConfig & PollingConfig &
  ({ preset: Preset; constraints?: never } | { constraints: ConstraintNode; preset?: never });
type PollingConfig = { polling?: { interval?: number; timeout?: number } };
```

`IDKitRequestConfig` (from `@worldcoin/idkit-core@4.6.0` `dist/index.d.ts`, comments verbatim):

| Field | Type | Doc comment |
| - | - | - |
| `app_id` | `` `app_${string}` `` | "Unique identifier for the app verifying the action. This should be the app ID obtained from the Developer Portal." |
| `action` | `AbiEncodedValue \| string` | "Identifier for the action the user is performing." |
| `session_id?` | `"create"` | "Create a session bound to this uniqueness proof. Requires allow_legacy_proofs: false." |
| `rp_context` | `RpContext` | "RP context for protocol-level proof requests (required)" |
| `action_description?` | `string` | "The description of the specific action (shown to users in World App). Only recommended for actions created on-the-fly." |
| `bridge_url?` | `string` | "URL to a third-party bridge to use when connecting to the World App. Optional." |
| `return_to?` | `string` | "Optional deep-link callback URL appended as `return_to` on the connector URL." |
| `allow_legacy_proofs` | `boolean` (**required**) | "`true`: Accept both v3 and v4 proofs. Use during migration. You must track both v3 and v4 nullifiers to prevent double-claims. `false`: Only accept v4 proofs. Use after migration cutoff or for new apps." |
| `require_user_presence?` | `boolean` | "Require World App to perform a user-presence check before verification. Defaults to false." |
| `override_connect_base_url?` | `string` | "Optional connect base URL override; takes precedence over the environment mapping." |
| `environment?` | `"production" \| "staging" \| "sandbox"` | "Optional environment override. Defaults to \"production\"." |

```ts
type RpContext = {
  rp_id: string;        // "The registered RP ID (e.g., "rp_123456789abcdef0")"
  nonce: string;        // "Unique nonce for this proof request"
  created_at: number;   // "Unix timestamp (seconds since epoch) when created"
  expires_at: number;   // "Unix timestamp (seconds since epoch) when expires"
  signature: string;    // "The RP's ECDSA signature of the nonce and created_at timestamp"
};
```

Note: there is **no top-level `signal` or `verification_level` prop** in 4.x. The signal goes into
the preset (`proofOfHuman({ signal })`) and the "level" is the preset you choose (section 4).

Presets (`@worldcoin/idkit-core@4.6.0` d.ts; all take `opts?: { signal?: string }`):

| Preset | `type` | d.ts comment |
| - | - | - |
| `proofOfHuman()` | `"ProofOfHuman"` | "Requests a World ID 4.0 proof-of-human credential with legacy Orb fallback." |
| `passport()` | `"Passport"` | "Requests a World ID 4.0 passport credential with legacy document fallback." |
| `mnc()` | `"Mnc"` | "Requests a World ID 4.0 MNC credential with legacy document fallback." |
| `selfieCheck()` | `"SelfieCheck"` | "The preset requests the Selfie Check credential and always disables fallback to legacy proofs." |
| `identityCheck({ attributes })` | `"IdentityCheck"` | "This preset requires World ID 4.0-compatible clients." (preview) |
| `orbLegacy()` | `"OrbLegacy"` | "This preset only returns World ID 3.0 proofs." |
| `secureDocumentLegacy()` | `"SecureDocumentLegacy"` | same |
| `documentLegacy()` | `"DocumentLegacy"` | same |
| `deviceLegacy()` | `"DeviceLegacy"` | same; docs: "**Deprecated.** Keep `deviceLegacy` only for existing Device integrations." (https://docs.world.org/world-id/idkit/credentials) |
| `selfieCheckLegacy()` | `"SelfieCheckLegacy"` | "Preview ... only returns World ID 3.0 proofs." |

Alternative to `preset`: `constraints` built from `CredentialRequest("proof_of_human" | "selfie" | "passport" | "mnc", { signal?, genesis_issued_at_min?, expires_at_min? })`
combined with `any(...)`, `all(...)`, `enumerate(...)` (d.ts `ConstraintNode`).

Widget callback semantics (https://docs.world.org/world-id/idkit/react — "Widget callbacks"):

> - `onSuccess` is required for `IDKitRequestWidget` and `IDKitSessionWidget`.
> - `handleVerify` is optional and only available on widgets. Use it to verify the proof in your backend before success is emitted.
> - If `handleVerify` throws/rejects, the widget enters an error state, emits `onError("failed_by_host_app")`, and does not call `onSuccess`. This means World App already returned a proof, but your callback or backend did not accept it.
> - `onError` is optional.

Also from that page: "Widgets support `language="en" | "es" | "th"`" and "Widgets default to
`autoClose={true}` after success". Widget source (`js/packages/react/src/widget/IDKitWidgetBase.tsx`
on `main`) shows: `autoClose = true`; on success outside World App `setTimeout(() => onOpenChange(false), 2500)`;
inside World App "auto-close immediately on success or error" and the widget renders `null`;
"Errors are only delivered while open"; closing the modal (`onOpenChange(false)`) resets the flow and
does **not** emit an error code. The `main` branch adds a third `onError` arg `reason?: ErrorReason`
that is not in the 4.6.0 type definitions.

Full widget usage from the docs (https://docs.world.org/world-id/idkit/react):

```tsx
import { IDKitRequestWidget, orbLegacy, type RpContext } from "@worldcoin/idkit";

<IDKitRequestWidget
  open={open}
  onOpenChange={setOpen}
  app_id="app_xxxxx"
  action="my-action"
  rp_context={rpContext}
  allow_legacy_proofs={true}
  preset={orbLegacy({ signal: "user-123" })}
  environment="production"
  handleVerify={async (result) => {
    const response = await fetch("/api/verify-proof", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rp_id: rpContext.rp_id, idkitResponse: result }),
    });
    if (!response.ok) throw new Error("Backend verification failed");
  }}
  onSuccess={() => { /* Called after `handleVerify` resolves (or immediately if omitted). */ }}
  onError={(errorCode, debugReport) => { console.error("IDKit error", errorCode, debugReport); }}
/>;
```

Headless hook `useIDKitRequest(config)` result fields (https://docs.world.org/world-id/idkit/react and hooks.d.ts):
`open()`, `reset()`, `isAwaitingUserConnection`, `isAwaitingUserConfirmation`, `isSuccess`, `isError`,
`connectorURI`, `result`, `errorCode`, `getDebugReport()`, plus (d.ts) `isOpen`, `isInWorldApp`.

Vanilla JS (https://docs.world.org/world-id/idkit/javascript): `IDKit.request(config).preset(p)` returns
`IDKitRequest { connectorURI, requestId, pollOnce(), pollUntilCompletion({ pollInterval, timeout }), getDebugReport() }`.
`pollUntilCompletion` returns `{ success: true, result } | { success: false, error: IDKitErrorCodes }` and
"never throws" (d.ts). Defaults (d.ts `WaitOptions`): `pollInterval` 1000 ms, `timeout` 900000 ms.
"When running inside World App, native transport is used and `connectorURI` may be empty. Outside
World App, `connectorURI` is the URL you render as a QR code."

Connect base URLs by environment (from `idkit-core@4.6.0` `dist/index.js`):
`production: "https://world.org/verify"`, `staging: "https://staging.world.org/verify"`,
`sandbox: "https://sandbox.world.org/verify"`; default bridge `https://bridge.worldcoin.org`.

### 2.2 Current result type `IDKitResult` (replaces `ISuccessResult`)

From `@worldcoin/idkit-core@4.6.0` d.ts (comments verbatim):

```ts
type IDKitResult = IDKitResultV3 | IDKitResultV4 | IDKitResultSession;

interface IDKitResultV4 {                      // uniqueness proof, World ID 4.0
  protocol_version: "4.0";
  nonce: string;                               // "Nonce used in the request"
  action: string;                              // "Action identifier (required for uniqueness proofs)"
  session_id?: `session_${string}`;            // "Present when the uniqueness request also creates a session."
  action_description?: string;
  responses: Array<ResponseItemV4 | SelfieCheckResponseItemV4>;
  user_presence_completed?: boolean;           // "Only present when requested."
  environment: string;                         // "production", "staging", or "sandbox"
  identity_attested?: boolean;                 // "Only present on IdentityCheck responses."
  integrity_bundle?: IntegrityBundle;
}
interface ResponseItemV4 {
  identifier: string;        // "Credential identifier (e.g., "proof_of_human", "passport", "mnc")"
  signal_hash?: string;      // "Signal hash (optional, included if signal was provided in request)"
  proof: string[];           // "first 4 elements are compressed Groth16 proof, 5th is Merkle root (decimal strings). Compatible with WorldIDVerifier.sol"
  nullifier: string;         // "RP-scoped nullifier (decimal)"
  issuer_schema_id: number;  // "(1=proof_of_human, 9303=passport, 9310=mnc)"
  expires_at_min: number;    // "Minimum expiration timestamp (unix seconds)"
}
interface SelfieCheckResponseItemV4 { identifier: "selfie"; signal_hash?: string; proof: string[]; nullifier: string; issuer_schema_id: 11; expires_at_min: number; sybil_score: number; }

interface IDKitResultV3 {                      // legacy proof, World ID 3.0
  protocol_version: "3.0";
  nonce: string;
  action?: string;
  action_description?: string;
  responses: ResponseItemV3[];
  user_presence_completed?: boolean;
  environment: string;
  integrity_bundle?: IntegrityBundle;
}
interface ResponseItemV3 {
  identifier: string;        // "Credential identifier (e.g., "proof_of_human", "selfie")"  (docs examples show "orb")
  signal_hash?: string;
  proof: string;             // "ABI-encoded proof (hex)"
  merkle_root: string;       // "Merkle root (hex)"
  nullifier: string;         // "Nullifier (hex)"
}
interface IntegrityBundle { version: number; signature_format: "apple_app_attest" | "android_keystore"; timestamp: number; signature: string; jwt: string; }
```

Note the field is `nullifier` (not `nullifier_hash`), and v4 has **no `merkle_root`** ("the root is
now encoded within the received ZKP" — https://docs.world.org/world-id/concepts).

Docs example of a 4.0 uniqueness result (https://docs.world.org/world-id/idkit/integrate):

```json
{
  "protocol_version": "4.0",
  "nonce": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "action": "my-action",
  "environment": "production",
  "responses": [
    {
      "identifier": "proof_of_human",
      "signal_hash": "0x0",
      "proof": ["0x1a2b...", "0x3c4d...", "0x5e6f...", "0x7a8b...", "0x9c0d..."],
      "nullifier": "0x04e5f6...rp_scoped_nullifier",
      "issuer_schema_id": 1,
      "expires_at_min": 1756166400
    }
  ]
}
```

and of a 3.0 (legacy) result:

```json
{
  "protocol_version": "3.0",
  "nonce": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "action": "my-action",
  "environment": "production",
  "responses": [
    {
      "identifier": "orb",
      "signal_hash": "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
      "proof": "0x1a2b3c...encoded_proof",
      "merkle_root": "0x0abc123...root_hash",
      "nullifier": "0x04e5f6...nullifier_hash"
    }
  ]
}
```

Hex vs decimal: the d.ts says v4 `nullifier` is "(decimal)" while the docs example and Step 6 say
"Nullifiers are returned as 0x-prefixed hex strings representing 256-bit integers. Convert and store
them as numbers". Parse with `BigInt(value)` (handles both) and store as `NUMERIC(78, 0)`.

### 2.3 Error codes emitted by the widget / hooks (`IDKitErrorCodes`)

Runtime enum from `@worldcoin/idkit-core@4.6.0` d.ts (values) and meanings from
https://docs.world.org/world-id/idkit/error-codes:

| Value | Meaning (docs) | Typical action (docs) |
| - | - | - |
| `user_rejected` | User cancelled in World ID. | Treat as user cancellation, allow retry. |
| `verification_rejected` | Legacy rejection code (older bridge/app behavior). | Handle same as `user_rejected`. |
| `credential_unavailable` | Requested credential type is not available for that user. | Offer fallback credential policy or explain requirement. |
| `feature_unavailable` | (in enum, **not on the docs page**) | — |
| `world_id_4_not_available` | World ID 4.0 credential is not available for that user. | Use a compatible fallback request or explain the World ID 4.0 requirement. |
| `world_id_3_not_available` | World ID 3.0 credential is not available for that user. | same |
| `malformed_request` | Payload or configuration is invalid. | Check `app_id`, `rp_context`, and request shape. |
| `invalid_network` | Environment mismatch between app config and World App context. | Align staging/production settings. |
| `inclusion_proof_pending` | Credential inclusion data is not ready yet. | Retry later. |
| `inclusion_proof_failed` | Inclusion proof retrieval failed. | Retry; if repeated, treat as operational incident. |
| `unexpected_response` | Malformed or unsupported bridge/app response. | Log diagnostics and retry once. |
| `connection_failed` | Could not establish/maintain bridge communication. | Check connectivity and bridge reachability. |
| `max_verifications_reached` | Action already verified the maximum allowed number of times. | Treat as terminal business-rule outcome. |
| `failed_by_host_app` | World App returned a proof, but the host app's `handleVerify` callback threw or rejected it. | Inspect the callback and backend verification response. |
| `user_presence_failed` | Required user-presence check was not completed. | Let the user retry the request. |
| `invalid_rp_signature` | RP signature could not be verified. | Check the RP signing key, nonce, timestamps, action, and signed message. |
| `nullifier_replayed` | Nullifier was already used for this action. | Treat as an already-verified outcome; do not retry the same action as a new verification. |
| `duplicate_nonce` | RP reused a signature nonce. | Generate a fresh nonce and signed RP context for each request. |
| `unknown_rp` | RP is not known to the registry. | Check the registered RP ID and app configuration. |
| `inactive_rp` | RP is registered but inactive. | Reactivate or reconfigure the RP before retrying. |
| `timestamp_too_old` | RP request timestamp is too old. | Generate a new signed RP context with a current timestamp. |
| `timestamp_too_far_in_future` | RP request timestamp is too far in the future. | Fix server clock skew and generate a new signed RP context. |
| `invalid_timestamp` | RP request timestamp is invalid. | Check timestamp format and regenerate the signed RP context. |
| `rp_signature_expired` | RP signature has expired. | Request a fresh RP signature before starting verification. |
| `identity_attributes_not_matched` | User identity attributes did not match the requested constraints. | Show an eligibility fallback or adjust the requested attribute constraints. |
| `generic_error` | Catch-all unknown failure. | Log details and retry with backoff. |
| `invalid_rp_id_format` | RP ID is malformed. | Use the registered `rp_...` ID from your app configuration. |
| `timeout` | Client-side polling timeout. | Extend timeout or let the user retry. |
| `cancelled` | Client-side cancellation (abort/task cancel/user close). | Treat as neutral cancellation path. |

Docs: "Widgets expose an `onError` callback. Hooks expose `isError` and `errorCode` on the result
object." ... "The widget `onError` callback receives it as a second `debugReport` argument for
flow/bridge errors (host-app verify failures such as `failed_by_host_app` omit it)". "Treat version
availability errors such as `world_id_4_not_available` and `world_id_3_not_available` as terminal for
the current user and request."

`IDKitDebugReport` (d.ts): `{ version: 1; package_version; transport: "bridge" | "mini_app"; generated_at; request_id?; request_payload?; response_payload?; mini_app? }`.

### 2.4 Legacy: `<IDKitWidget>` (IDKit 2.x) — for recognising old samples only

From `@worldcoin/idkit@2.4.2` and `@worldcoin/idkit-core@2.x` type definitions (installed and read;
the current docs no longer document this component):

```ts
// IDKitConfig (2.x)
type IDKitConfig = {
  app_id: `app_${string}`;
  action: AbiEncodedValue | string;
  action_description?: string;
  signal?: AbiEncodedValue | string;      // "Encodes data into a proof that must match when validating."
  bridge_url?: string;
  verification_level?: VerificationLevel; // "The minimum required level of verification. Defaults to "orb"."
  partner?: boolean;
};
enum VerificationLevel { Orb = "orb", SecureDocument = "secure_document", Document = "document", Device = "device" }

// WidgetConfig / WidgetProps (2.x)
autoClose?: boolean;                      // "Defaults to `false`."   (4.x default is true)
onSuccess: (result: ISuccessResult) => void | Promise<void>;
handleVerify?: (result: ISuccessResult) => void | Promise<void>;
onError?: (error: IErrorState) => void | Promise<void>;
children?: ({ open }: { open: () => void }) => JSX.Element;   // render-prop
show_modal?: boolean; disable_default_modal_behavior?: boolean; container_id?: string; language?: 'en'|'es'|'th';

interface ISuccessResult { proof: string; merkle_root: string; nullifier_hash: string; verification_level: VerificationLevel; }
interface IErrorState    { code: AppErrorCodes; message?: string; }
enum AppErrorCodes { ConnectionFailed = "connection_failed", VerificationRejected = "verification_rejected",
  MaxVerificationsReached = "max_verifications_reached", CredentialUnavailable = "credential_unavailable",
  MalformedRequest = "malformed_request", InvalidNetwork = "invalid_network", InclusionProofFailed = "inclusion_proof_failed",
  InclusionProofPending = "inclusion_proof_pending", UnexpectedResponse = "unexpected_response",
  FailedByHostApp = "failed_by_host_app", GenericError = "generic_error" }

// server helper (2.x, @worldcoin/idkit-core/backend)
verifyCloudProof(proof: ISuccessResult, app_id, action, signal?, endpoint?, headers?)
// POSTs { ...proof, action, signal_hash: hashToField(signal ?? "").digest } to
// https://developer.worldcoin.org/api/v2/verify/${app_id} with only "Content-Type: application/json"
```

SKILL.md on the type renames: "TypeScript: import errors for `IRpContext` / `ISuccessResult` — v3 type
names — removed in v4. Use `RpContext` / `IDKitResult`. No `I` prefix." and "Widget never opens —
Treating `IDKitRequestWidget` as a render-prop / function-as-child component. v4 widget is
**controlled** — pass `open` and `onOpenChange` props. There is no child function."

---

## 3. Backend step A — RP signature (required before the widget can open)

Source: https://docs.world.org/world-id/idkit/integrate (Step 3) and https://docs.world.org/world-id/idkit/signatures.

> Signatures verify that proof requests come from your app, preventing impersonation attacks.
> ... Never generate RP signatures on the client and never expose your RP signing key.

```ts
// app/api/rp-signature/route.ts  (docs Step 3, verbatim)
import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";   // also "@worldcoin/idkit/signing"

export async function POST(request: Request): Promise<Response> {
  const { action } = await request.json();
  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: process.env.RP_SIGNING_KEY!,
    action,
  });
  return NextResponse.json({ sig, nonce, created_at: createdAt, expires_at: expiresAt });
}
```

`signRequest({ signingKeyHex, action?, ttl })` — "`ttl: 300, // optional, default 300s`"
(https://docs.world.org/world-id/idkit/javascript). The signed `action` **must equal** the `action`
passed to the widget (error `invalid_rp_signature` otherwise). Because the signature expires in
5 minutes by default, fetch it right before opening the widget (error `rp_signature_expired`).

Algorithm (for non-Node backends), verbatim from https://docs.world.org/world-id/idkit/signatures:
`hash_to_field(x) = keccak256(x) >> 8` (always starts with `0x00`); message =
`0x01 || nonce(32) || be_u64(created_at) || be_u64(expires_at) [|| hash_to_field(utf8(action))]`
(49 or 81 bytes); EIP-191 prefix `"\x19Ethereum Signed Message:\n" + decimal length`; secp256k1
recoverable signature `r||s||(recovery_id+27)`. Test vectors on that page (e.g. `hash_to_field("")`
= `0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4`).

---

## 4. Backend step B — the verify endpoint

### 4.1 Current: `POST https://developer.world.org/api/v4/verify/{rp_id}`

Source: https://docs.world.org/api-reference/developer-portal/verify (OpenAPI) and
https://docs.world.org/world-id/idkit/integrate (Step 5).

- Servers (OpenAPI): `https://developer.world.org` (Primary), `https://developer.worldcoin.org`
  (Legacy domain), `https://staging-developer.worldcoin.org` (Staging domain).
- Path param: "RP ID (`rp_...`) is recommended. App ID (`app_...`) is also accepted for backward compatibility."
- Headers: only `content-type: application/json` is used in every official sample. OpenAPI has
  `security: []` — **no API key**. No `User-Agent` requirement is documented anywhere.
- Body: "Forward the complete IDKit result without remapping response identifiers or constructing a
  legacy `verification_level`." / "Forward the IDKit result payload as-is. No field remapping is required."
  SKILL.md: "**DO NOT mutate, re-encode, or trim the proof JSON before forwarding**".

Request schema (`VerifyV4Request` = oneOf):

| Request type | Required | Optional |
| - | - | - |
| Legacy Proofs (v3): `protocol_version: "3.0"` | `protocol_version`, `nonce`, `action`, `responses[]` (min 1, `VerifyV4ResponseItemV3`) | `action_description`, `environment` (`production`/`staging`/`sandbox`, default `production`), `integrity_bundle`, `user_presence_completed` |
| Uniqueness Proofs (v4): `protocol_version: "4.0"` | `protocol_version`, `nonce`, `action`, `responses[]` (`VerifyV4ResponseItemV4`) | same |
| Session Proofs (v4) | `protocol_version`, `nonce`, `session_id`, `responses[]` (`VerifyV4SessionResponseItem`) | `environment`, `integrity_bundle`, `user_presence_completed` |

Response items:

- `VerifyV4ResponseItemV3` — required `identifier`, `proof` (string), `merkle_root`, `nullifier`;
  optional `signal_hash` (default `0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4`
  = hash of empty string), `max_age` (3600–604800). identifier: "for example, `orb` or `selfie`.
  Use `selfie` for Selfie Check; the historical `face` value remains accepted".
- `VerifyV4ResponseItemV4` — required `identifier`, `issuer_schema_id` (int), `nullifier`,
  `expires_at_min` (int), `proof` (array of **exactly 5** hex strings: "4 compressed proof elements +
  Merkle root"); optional `signal_hash` (default `'0x0'`), `sybil_score` ("Required only when
  `issuer_schema_id` is 11").
- `integrity_bundle` — "Required with version 2 when any response item is a Selfie Check credential
  (`issuer_schema_id: 11`)." Fields: `version` (1|2), `signature_format`, `timestamp`, `signature`, `jwt`.

`signal` vs `signal_hash`: the v4 endpoint has **only `signal_hash`**, and you never compute it —
IDKit puts it in `responses[].signal_hash`. To enforce your expected signal, compute
`hashSignal(expected)` (`import { hashSignal } from "@worldcoin/idkit-core/hashing"` or
`@worldcoin/idkit/hashing`) and compare it to `responses[i].signal_hash` before/after forwarding.
`hashSignal` implementation (`idkit-core@4.6.0 dist/hashing.js`): if input is `0x` + valid hex it is
hashed as bytes, otherwise as UTF-8; `hashToField = keccak256(input) >> 8`, returned as `0x` + 64 hex
chars. Docs: "Signal (optional): Bind specific context into the requested proof. Examples: user ID,
wallet address. Your backend should enforce the same value." Note the 4.0 example results show
`"signal_hash": "0x0"` when no signal was passed.

Success response `VerifyV4SuccessResponse` (200, "At least one proof verified successfully"):

```json
{ "success": true, "action": "...", "nullifier": "...", "created_at": "<date-time>",
  "environment": "production" | "staging" | "sandbox", "session_id": "session_...(optional)",
  "results": [ { "identifier": "...", "success": true, "nullifier": "...", "code": "...", "detail": "..." } ],
  "message": "(optional)" }
```

Required: `success`, `results`. Docs Step 5 instructs: check `response.ok`, then
`verification.success === true && verification.environment === expectedEnvironment`.

Error response `VerifyV4ErrorResponse` (required `success:false`, `code`, `detail`; optional `results[]`):

| HTTP | `code` | `detail` (verbatim) |
| - | - | - |
| 400 | `app_not_migrated` | "This app has not been migrated to World ID 4.0. Please use the v2 verify endpoint." |
| 400 | `all_verifications_failed` | "All proof verifications failed." with `results: [{ identifier, success: false, code: "verification_error", detail: "On-chain proof verification failed." }]` |
| 404 | (unspecified) | "App not found or no longer active" |

`code` is an open string; only these are documented. Additional codes named in SKILL.md's gotcha
table (not in the OpenAPI): "`/api/v4/verify/{rp_id}` returns `invalid_proof` or
`verification_failed` — Often staging/production env mismatch, or proof was mutated before forward"
and "returns `not_registered` or 4xx with `rp` errors — On-chain registration is still `pending`".

Extra body field seen only in the Simulator MCP guide and Portal MCP skill (not in OpenAPI):
`{ ...completionResult, min_protocol_version: "4.0" }` — "enforce `min_protocol_version: "4.0"` at
verification" (https://github.com/worldcoin/simulator/blob/main/docs/mcp.md). Treat as optional.

Replay / uniqueness is YOUR job: "The Developer Portal confirms the proof is **cryptographically
valid**, but your backend must check that the nullifier hasn't been used before." (integrate Step 6).
The Portal MCP skill is explicit: "Portal v4 currently accepts nullifier reuse — a repeat verification
succeeds with a message noting the reuse — so application-level duplicate-operation rules must be
tested separately." (https://github.com/worldcoin/developer-portal/blob/main/web/api/mcp/SKILL.md)

Reference verifier (docs Step 5, verbatim):

```ts
// app/api/verify-proof/route.ts
import { NextResponse } from "next/server";
import type { IDKitResult } from "@worldcoin/idkit";

export async function POST(request: Request): Promise<Response> {
  const { rp_id, idkitResponse } = (await request.json()) as { rp_id: string; idkitResponse: IDKitResult };
  const expectedEnvironment = "production";
  if (idkitResponse?.environment !== expectedEnvironment) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }
  const response = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...idkitResponse, environment: expectedEnvironment }),
  });
  if (!response.ok) return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  const verification = await response.json();
  if (verification?.success !== true || verification?.environment !== expectedEnvironment) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }
  // Uniqueness: store the nullifier (Step 6).
  return NextResponse.json({ success: true });
}
```

Storage (docs Step 6, verbatim): "PostgreSQL doesn't natively support 256-bit integers, so convert
the nullifier to a decimal and store it as `NUMERIC(78, 0)`."

```sql
CREATE TABLE nullifiers (
  nullifier   NUMERIC(78, 0) NOT NULL,
  action      TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nullifier, action)
);
```

Which fields to also persist/assert from the result for Trenches: `action` (must equal the action
you signed), `environment`, `responses[0].identifier`, `responses[0].signal_hash` (== `hashSignal(wallet)`),
`responses[0].nullifier`, `protocol_version`.

### 4.2 Legacy: `POST https://developer.worldcoin.org/api/v2/verify/{app_id}` ("Verify (Legacy)")

Source: https://docs.world.org/api-reference/developer-portal/verify-legacy. Still documented; the
v4 endpoint returns `app_not_migrated` and tells you to use this one for apps not migrated to 4.0.

Request (`VerifyProofRequest`, required `nullifier_hash`, `proof`, `merkle_root`, `verification_level`, `action`):

```json
{
  "nullifier_hash": "0x2bf8...",
  "merkle_root": "0x2264...",
  "proof": "0x1aa8...",
  "verification_level": "orb",
  "action": "my_action",
  "signal_hash": "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
  "max_age": 3600
}
```

- `verification_level` enum: `orb`, `secure_document`, `document`, `device`, `face`, `selfie`
  ("Use `selfie` for Selfie Check. The historical `face` value remains accepted ... behaves the same as `selfie`").
- `signal_hash`: "The hash of the signal that was used to generate the proof. Defaults to the hash of
  an empty string." (compute with `hashToField` / `hashSignal`, i.e. keccak256 >> 8; there is no plain `signal` field).
- `max_age`: int, min 3600, max 604800, default 7200 — "how old the Merkle root used in the proof can be".
- Headers: none documented beyond JSON body (`security: []`); legacy `verifyCloudProof` sent only `Content-Type`.

200: `{ "success": true, "action": "my_action", "nullifier_hash": "0x...", "created_at": "2023-02-18T11:20:39.530041+00:00" }`

400 ("Invalid or already verified") — documented `code` values with verbatim `detail`:

| `code` | `detail` | `attribute` |
| - | - | - |
| `invalid_proof` | "The provided proof is invalid and it cannot be verified. Please check all inputs and try again." | null |
| `invalid_merkle_root` | "The provided Merkle root is invalid. User appears to be unverified." | null |
| `root_too_old` | "The provided merkle root is too old. Please generate a new proof and try again." | null |
| `invalid` | "Invalid credential type." | `credential_type` |
| `exceeded_max_verifications` | "This user has exceeded the maximum number of verifications allowed for this proof." | null |
| `already_verified` | "This person has already verified for this action." | null |

(`max_verifications_reached` is the widget/bridge error code; the legacy endpoint's equivalent is
`exceeded_max_verifications`.)

---

## 5. "Proof of Human" and the other levels — what to request and why

Current credential model (https://docs.world.org/world-id/idkit/credentials — "What you can request with IDKit"):

| Offering | What it proves | SDK path |
| - | - | - |
| Proof of Human | "The user is a unique human, backed by anonymous biometric verification by the Orb." | `proofOfHuman` |
| Proof of Attributes (Passport) | "The user holds a verified NFC passport credential." | `passport` |
| Proof of Presence (Selfie Check) | "A medium-assurance biometric credential using the device camera for liveness and facial similarity." | `selfieCheck` |
| Proof of Attributes (Identity Check) | document-backed attribute attestation (preview) | `identityCheck` |

Proof of Human credential page (https://docs.world.org/world-id/credentials/1): ID `1`, "Issued by
World Foundation", "Sybil resistance: Yes — each human can only have one PoH credential.", "Validity
period: 3 years". "The Proof of Human (PoH) Credential is the highest-assurance credential issued
under World ID. Users obtain it by verifying at an Orb". Use cases: "**Sybil resistance**: enforcing
one account per human for airdrops, voting, rewards or rate limiting."

Relationship to orb/device:

- "Proof of Human" (4.0, `identifier: "proof_of_human"`, `issuer_schema_id: 1`) is the 4.0 successor
  of the 3.0 **`orb`** verification level. `proofOfHuman()` "includes legacy Orb fallback for users
  without a World ID 4.0 proof" (credentials page), so with `allow_legacy_proofs: true` you may get
  either a 4.0 `proof_of_human` item or a 3.0 `orb` item.
- **`device`** is legacy-only and deprecated: "`deviceLegacy` — **Deprecated.** Keep `deviceLegacy`
  only for existing Device integrations. For new integrations, use Selfie Check." There is no 4.0
  device credential.
- Selfie Check / Proof of Presence (ID `11`, https://docs.world.org/world-id/credentials/11): "does
  not provide a strict one-person-one-account guarantee and is considered a medium-assurance
  verification method"; "Anyone with World ID App can use Proof of Presence. No Orb, passport or
  other prerequisite credential is required."; each response carries a `sybil_score` 0–10 "risk
  signal, not a uniqueness verdict", 90-day validity.
- Mini-apps page table (https://docs.world.org/world-id/idkit/mini-apps): "Strong sybil resistance
  or one-human-one-action checks → `proofOfHuman`; Lower-friction liveness or bot deterrence →
  `selfieCheck`; Passport-backed checks → `passport`".

Picking the minimum sufficient level (bounty asks you to justify this): the prize page says "Use the
credential that is proportionate to your use case." / "We are not rewarding the most credentials
used." For "one human may join a Trench once" the documented fit is **Proof of Human** (the only
credential with "Sybil resistance: Yes"). If the trust moment were merely bot deterrence with no
scarce reward, `selfieCheck` would be the lower-friction choice. SKILL.md: "**The default if the user
said "proof of human" or "verify a real human."**"

What the verify endpoint accepts: it does not take a level parameter at all; it verifies whatever
`responses[].identifier` / `issuer_schema_id` IDKit returned (`proof_of_human`=1, `passport`=9303,
`mnc`=9310, `selfie`=11, legacy `orb`/`selfie`/`face`). Your backend decides which identifiers are
acceptable (e.g. accept `proof_of_human` and legacy `orb`; reject `selfie`).

---

## 6. Developer Portal setup

Portal: https://developer.world.org (old domain https://developer.worldcoin.org still linked by the prize page).

Step 2 of the integration guide (https://docs.world.org/world-id/idkit/integrate):
> Create your app in the Developer Portal. If you're migrating from an old app, complete RP
> registration by clicking the Enable World ID 4.0 banner. Keep these values: `app_id`, `rp_id`,
> `signing_key` - this should be stored as a secret.

Where the IDs live: `app_id` and `rp_id` are shown in the app's World ID configuration; the signing
key is "returned ONCE" at creation/rotation and "the portal does not retain it" (Portal MCP skill).
Example values: `NEXT_PUBLIC_APP_ID=app_d8bbd5341f16fb97a61e644b7e169c0e`, `NEXT_PUBLIC_RP_ID=rp_7b4f23dd5fb2a826`.

Staging vs production (from https://world.id/SKILL.md, Phase 5):
> - The **production** World ID app only signs **production** proofs.
> - A **staging** action only verifies against the World ID **Simulator** (https://simulator.worldcoin.org).
> - The IDKit `environment` prop, the action's `environment`, and the simulator-vs-real-app choice **must all match.**
> **CRITICAL: if real users will scan with their phones, the action environment must be `production`.**
> A staging action with the production World ID app will silently produce zero proofs and look like a
> frontend bug. If the user needs both simulator testing and real-device QA, create separate staging
> and production actions.

Also from the Portal MCP skill (https://github.com/worldcoin/developer-portal/blob/main/web/api/mcp/SKILL.md):
"`configure_world_id` ... Staging apps return `-32004` with `data.reason: "staging_not_supported"` — use
a production app instead." and "MCP-created apps are production apps. The MCP no longer exposes
staging app creation; use the dashboard". A production RP registration "(on production) duplicates to
the staging contract", and the simulator test flow polls until "both `production_status` and
`staging_status` are `registered`". So: create a **production** app + RP, and use `environment:
"staging"` on the request (with a staging action) to test against the simulator.

Actions ("incognito actions" is the legacy portal name; 4.0 calls them "World ID actions"):

- Concept (https://docs.world.org/world-id/concepts): "**Action**: A developer-facing primitive that
  lets you put any app operation behind a unique-human gate." "**Nullifier**: ... a unique identifier
  for a combination of a user, `app_id`, and `action`."
- Legacy create API (https://docs.world.org/api-reference/developer-portal/create-incognito-action):
  `POST /api/v2/create-action/{app_id}` with `Authorization: Bearer <api key>`, body
  `{ action (required), name, description, max_verifications (integer, default 1, "Maximum number of verifications allowed for this action") }`;
  response includes `external_nullifier`. Errors: `constraint-violation` "Action already exists".
- 4.0 action (Portal MCP `create_world_id_action`, schema in `web/api/mcp/index.ts`): inputs `app_id`,
  `action` (required), optional `description`, `environment` enum `["production", "staging"]`.
  The GraphQL mutation `McpUpsertActionV4` writes `action_v4 { rp_id, action, description, environment }`
  with unique constraint `action_v4_rp_id_action_environment_key`. **No `max_verifications` field
  exists on 4.0 actions.**
- Lazy creation: "Actions need no pre-registration — the v4 verify endpoint lazy-creates them on
  first verification; use `create_world_id_action` only to configure one deliberately." (Portal MCP
  skill; repeated in the Simulator MCP doc). Contradicted by SKILL.md's gotcha "World ID shows
  'action not found' or QR scan does nothing — Action wasn't created in the environment IDKit is
  pointing at". See section 9.
- Dashboard UI for actions (field names, max-verifications control) is not documented on any
  docs.world.org page found; the only documented ways are the dashboard (undocumented UI), the v2
  create-action API, and the Portal MCP.

How to get "once per Trench":

1. Uniqueness in World ID is per **(human, app/RP, action)**: "The same person verifying the same
   action always produces the same nullifier, but different apps or actions produce different ones"
   (integrate Step 6). "World ID 4.0 uniqueness proofs are one-time per action for each user. Use
   separate actions for separate one-time operations" (SKILL.md).
2. **The signal does not change the nullifier.** Signal only binds data into the proof
   (`signal_hash`). Two proofs for the same action with different signals carry the same nullifier.
3. Therefore the documented pattern is **one action per Trench**: `action = "join-trench-<trenchId>"`
   (sign `rp_context` per action; actions can be created lazily or via the Portal). Nullifiers are
   then unlinkable across trenches, and `UNIQUE (nullifier, action)` enforces one join per human per
   trench.
4. Alternative: single action `join-trench` + `signal = trenchId` (or `wallet|trenchId`) and
   `UNIQUE (nullifier, trench_id)` in your own DB. This works mechanically but makes the nullifier a
   cross-trench identifier of the human inside your app, which the 4.0 docs discourage: "Do not carry
   over a uniqueness nullifier as a persistent user identifier" (https://docs.world.org/world-id/4-0-migration).
5. `max_verifications` (legacy, default 1) is enforced by the legacy endpoint (`already_verified` /
   `exceeded_max_verifications`) and surfaces in the widget as `max_verifications_reached`. For 4.0 the
   Portal "currently accepts nullifier reuse" (section 4.1), so **enforce in your DB regardless**.
6. Still pass `signal = <wallet address>` so the proof is bound to the caller; verify
   `responses[i].signal_hash === hashSignal(wallet)` server-side.

Action identifier format: all docs examples are kebab/snake case ASCII (`my-action`, `my_action`,
`verify-account-2026`, `claim-airdrop-2026`, `mcp-test-<uuid>`). No character/length rule found.

---

## 7. Simulator, sandbox, and "mock" mode

### 7.1 What the sponsor's hackathon page actually says (https://ethglobal.com/events/mumbai/prizes/world)

- Prizes: World ID Agent Pass $2,500 (Continuity Track) and $5,000; **Best Use of IDKit $2,500** ("Up
  to 2 teams receive $1,250 each"); [Cont] Best Use of IDKit $2,500.
- Mock note (in the **Agent Pass $5,000** section, as image alt text): "We are mocking proofs now, so
  you don't need sandbox app anymore" and "NOTE: Proofs are using fake identities, DO NOT rely in them
  for production". Agent Pass is a separate product (https://auth.world.org/, docs
  https://auth.world.org/docs, portal https://auth.world.org/portal), not IDKit.
- IDKit qualification requirements (verbatim list): "Integrate IDKit into a working app, mini app, or
  onchain flow." / "Use at least one supported World ID credential and verify the result on the
  server or onchain." / "Explain the specific product event that requires trust and why the chosen
  credential is the minimum sufficient assurance." / "Demonstrate a successful verification and one
  alternative path (cancellation, unavailable credential, rejection, or ineligible user)." / "Submit
  [an] integration debrief" covering "time to first success, friction, missing capabilities or docs,
  and the single highest-impact improvement."
- IDKit resources listed: IDKit JS Example https://idkit-js-example.vercel.app/, integration guide,
  Configure credentials, Proof of Human, Passport/NFC, Selfie Check Beta, Verification flows,
  Developer Portal https://developer.worldcoin.org, IDKit Docs, **World ID Simulator
  https://simulator.worldcoin.org/id/0x18310f83**, **iOS Sandbox App (TestFlight)
  https://testflight.apple.com/join/Tub7zuyD**, workshop video https://www.youtube.com/watch?v=MElIfoDffuw.
- Nothing on the page describes an IDKit-specific mock mode, a mock verify endpoint, or a mock
  `rp_id`. No docs.world.org page mentions "mock" for IDKit.

### 7.2 Staging + World ID Simulator (https://simulator.worldcoin.org)

- Docs Step 4: "To test during development, use the simulator and set `environment` to `"staging"`."
  `IDKit.request` comment: `environment: "production", // Only set this to staging for testing with the simulator`.
- Simulator page (fetched 2026-11-05): "The World ID Simulator is a stand-in for the World App. It
  lets you test World ID verifications on the staging network without a phone." Banner: "This
  simulator will change with the adoption of World ID 4.0. Learn more" (links to
  https://world.org/blog/engineering/introducing-world-id-4.0, which says only "A testnet will be
  launching soon."). The identity page shows a "Credentials" list ("no verified credentials yet" on
  a fresh identity) and a **"Paste code"** button for the IDKit connect URL.
- Deep link (simulator README https://github.com/worldcoin/simulator): "You can trigger
  verification directly from the root route with a URL-encoded World ID QR URL:
  `/?connect_url=<url-encoded-world-id-verify-url>` ... the simulator will auto-select an identity and
  open the existing verification modal flow."
- Widget behaviour: `IDKitRequestWidget.tsx` passes `showSimulatorCallout={config.environment === "staging"}`,
  so the modal shows a simulator link when `environment="staging"`.
- Staging connect URL used by IDKit: `https://staging.world.org/verify` (idkit-core 4.6.0).
- Verifying staging proofs: the sandbox page says send to the production verify endpoint
  (`https://developer.world.org/api/v4/verify/${rp_id}`); the proof carries `environment: "staging"`
  and your backend must then expect `"staging"`. The official example also offers an opt-in override to
  `https://staging-developer.worldcoin.org` ("Enable this to send proof verification requests to the
  staging Developer Portal instead of production.") and a staging deep-link base override
  (`https://staging.world.org/verify`, "Useful when testing with a Staging iOS World App build").
- Simulator MCP (https://github.com/worldcoin/simulator/blob/main/docs/mcp.md): endpoint
  `https://simulator.worldcoin.org/api/mcp`, "No API key is required", one tool
  `complete_test_request { connect_url }` which "completes a native World ID 4.0 staging Proof of Human
  uniqueness request with a real proof"; "The first version supports a single native v4 Proof of Human
  uniqueness request". Returns `{ "status": "proof_delivered", "request_id": "…" }`; "Success means the
  application's backend received Portal HTTP 200 with `protocol_version` `"4.0"` and `environment`
  `"staging"`". Minimal config it expects: `environment: "staging"`, `allow_legacy_proofs: false`,
  RP-signed `rp_context`, `preset(IDKit.proofOfHuman())`.
- Legacy-era simulator (3.0) issues an Orb credential to a staging identity ("Verifying your identity
  in the Simulator gets you an Orb credential, and it may take identities 3-5 minutes to be verified",
  older docs mirrors). Whether the browser flow today returns 3.0 `orb` or 4.0 `proof_of_human` items is
  not stated on the current page — handle both (`allow_legacy_proofs: true`).

### 7.3 Sandbox environment (`environment: "sandbox"`)

https://docs.world.org/world-id/sandbox/what-is-sandbox: "an isolated, production-like environment
for testing your World ID integration end-to-end ... with its own backend and its own builds of the
World ID app for iOS and Android". "Simulated verification. Exercise verification flows without real
hardware or real-world credentials." "Not production. ... Not a source of real uniqueness."
https://docs.world.org/world-id/sandbox/sandbox-access: iOS via TestFlight (request access under
"World ID Sandbox" in the Developer Portal; the prize page gives a direct TestFlight join link),
Android via a private Play testing track. Integration: "1. Update IDKit to the latest version. 2. Set
`environment: sandbox` in your IDKit configuration. 3. To verify a proof, send it to the production
verify endpoint (`https://developer.world.org/api/v4/verify/${rp_id}`)." Sandbox connect URL:
`https://sandbox.world.org/verify`.

---

## 8. Alternative paths the bounty wants demonstrated (cancel / unavailable / rejection / ineligible)

- **User cancels in World App / simulator** → `onError("user_rejected")` (or legacy
  `"verification_rejected"`); docs: "Treat as user cancellation, allow retry." The widget shows its
  error screen with a retry button (`ErrorState onRetry` resets and re-opens the flow).
- **User closes the modal** (X / backdrop) → `onOpenChange(false)`; the flow is reset and **no
  `onError` is fired** (widget base: "Errors are only delivered while open"). Handle in your
  `onOpenChange` handler if you need to log a cancellation. With the headless hook /
  `pollUntilCompletion`, abort/timeout surface as `cancelled` / `timeout`.
- **Credential unavailable** (user has no Orb/PoH) → `credential_unavailable`, or
  `world_id_4_not_available` / `world_id_3_not_available` ("terminal for the current user and
  request"). Docs: "If the user lacks the requested credential, World ID walks them through enrollment
  first; your integration sees no difference." (https://docs.world.org/world-id/idkit/verification-flows)
- **Already joined** → either widget `nullifier_replayed` / `max_verifications_reached`, or (4.0,
  since the Portal accepts reuse) your backend's `UNIQUE (nullifier, action)` violation → throw inside
  `handleVerify` → widget shows error, `onError("failed_by_host_app")`, `onSuccess` not called.
- **Backend rejects** (env mismatch, wrong signal, Portal `all_verifications_failed`) → same
  `failed_by_host_app` path; return a specific JSON error from your route so the UI can show why.
- **Environment mismatch** (prod phone vs staging action) → `invalid_network` on the widget, or
  silently no proof ("will silently produce zero proofs and look like a frontend bug" — SKILL.md).
- **Expired signature** (user left the modal open > 5 min) → `rp_signature_expired` /
  `timestamp_too_old`; re-fetch `rp_context` and re-open.
- Mini App context: inside World App the widget renders nothing and auto-closes on success/error;
  `debugReport?.transport === "mini_app"`.

---

## 9. Unknown / must confirm at the booth

1. **IDKit mock mode.** The "We are mocking proofs now, so you don't need sandbox app anymore / Proofs
   are using fake identities" note is only under the **Agent Pass** prize. Ask: does the IDKit track
   have a mocked path too, and if so is it (a) the staging simulator, (b) the sandbox app, (c) a
   special `rp_id`/`app_id` whose `/api/v4/verify` returns success, or (d) something else? Which
   `environment` value should the widget use, and which value will the proof's `environment` carry?
2. **Does the browser simulator return 4.0 `proof_of_human` or 3.0 `orb` proofs today?** The page
   says it "will change with the adoption of World ID 4.0"; the Simulator MCP does 4.0 PoH. Decide
   whether `allow_legacy_proofs` must be `true` (safe default) and which `identifier`s to accept.
3. **Staging action creation.** SKILL.md says actions must exist in the environment IDKit points to;
   the Portal MCP skill says the v4 verify endpoint lazy-creates actions. Confirm whether a
   per-trench action (`join-trench-<id>`) needs pre-creation in the dashboard for staging, and whether
   there is a dashboard field for max verifications on 4.0 actions (none exists in the MCP schema).
4. **Nullifier reuse on v4 verify.** The Portal MCP skill says reuse currently succeeds "with a
   message noting the reuse". Confirm the exact `message` / `results[].code` text so the backend can
   log it; regardless, enforce `UNIQUE (nullifier, action)` locally.
5. **`min_protocol_version`** body field: used by the simulator/portal guides but absent from the
   OpenAPI. Confirm it is accepted/ignored.
6. **Verify-endpoint headers**: no `User-Agent` or API-key requirement found anywhere; confirm no
   WAF rule blocks default Node `fetch` user agents.
7. **Which domain to verify staging proofs against**: docs say production endpoint with
   `environment: "staging"`; the example app has an optional `staging-developer.worldcoin.org`
   override. Ask which the booth recommends for the mocked flow.
8. **Hex vs decimal `nullifier` in 4.0 results** (d.ts says decimal, docs example shows `0x...`).
   Parsing with `BigInt()` covers both.
9. **Action string constraints** (allowed characters/length) — not documented.
10. **`onError` third argument `reason`** exists on `main` but not in 4.6.0 — ignore unless a newer
    release lands during the event.
11. **Whether a staging app (`app_staging_...`) can have an `rp_id` at all** — the Portal MCP returns
    `staging_not_supported` for `configure_world_id` on staging apps; dashboard behaviour unconfirmed.

---

## 10. Source index

- IDKit integrate: https://docs.world.org/world-id/idkit/integrate (markdown: https://docs.world.org/world-id/idkit/integrate.md)
- React reference: https://docs.world.org/world-id/idkit/react
- JavaScript reference: https://docs.world.org/world-id/idkit/javascript
- Error codes: https://docs.world.org/world-id/idkit/error-codes
- Configure credentials (presets, levels): https://docs.world.org/world-id/idkit/credentials
- Verification flows (hot/cold/invite code): https://docs.world.org/world-id/idkit/verification-flows
- RP signatures spec + test vectors: https://docs.world.org/world-id/idkit/signatures
- Session proofs: https://docs.world.org/world-id/idkit/session-proofs
- Mini apps: https://docs.world.org/world-id/idkit/mini-apps
- Verify (v4) OpenAPI: https://docs.world.org/api-reference/developer-portal/verify
- Verify (Legacy v2) OpenAPI: https://docs.world.org/api-reference/developer-portal/verify-legacy
- Create Incognito Action (legacy): https://docs.world.org/api-reference/developer-portal/create-incognito-action
- Get Action Metadata / precheck: https://docs.world.org/api-reference/developer-portal/get-action-metadata
- Core concepts: https://docs.world.org/world-id/concepts
- World ID 4.0 migration: https://docs.world.org/world-id/4-0-migration
- Proof of Human credential: https://docs.world.org/world-id/credentials/1
- Proof of Presence (Selfie Check): https://docs.world.org/world-id/credentials/11
- Sandbox: https://docs.world.org/world-id/sandbox/what-is-sandbox and https://docs.world.org/world-id/sandbox/sandbox-access
- Sponsor LLM skill: https://world.id/SKILL.md
- Developer Portal MCP docs: https://docs.world.org/model-context-protocol/developer-portal ; source + skill: https://github.com/worldcoin/developer-portal/tree/main/web/api/mcp
- IDKit monorepo + Next.js example: https://github.com/worldcoin/idkit (js/examples/nextjs), live https://idkit-js-example.vercel.app/
- Simulator: https://simulator.worldcoin.org , repo https://github.com/worldcoin/simulator , MCP guide https://github.com/worldcoin/simulator/blob/main/docs/mcp.md
- ETHGlobal Mumbai World prizes: https://ethglobal.com/events/mumbai/prizes/world
- npm: `npm view @worldcoin/idkit version peerDependencies` (4.6.0); https://www.npmjs.com/package/@worldcoin/idkit returned HTTP 403 to automated fetch, README taken from `npm view ... readme`.
- Legacy docs URLs requested in the brief (`/world-id/reference/idkit`, `/world-id/reference/api`, `/world-id/id/cloud`) now redirect to the 4.x pages above; legacy widget types were taken from the installed `@worldcoin/idkit@2.4.2` package.
