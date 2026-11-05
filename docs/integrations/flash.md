# Definitive Flash API — integration reference

Researched 2026-11-05 for ETHGlobal Mumbai. Every item carries the URL it was taken from. Field names are copied
verbatim from the OpenAPI spec (`https://flash.definitive.fi/v1/openapi.json`, `info.version: "2.0.0"`) and the
Mintlify docs (`https://flash.definitive.fi/docs/*.md` serve raw markdown; `/docs/llms.txt` is the index). Nothing
here is invented; where the docs are silent it is listed in section 9.

Live probes (read-only `POST /quote`, `GET /search`, `GET /orders`, `GET /orders/{id}`) were run with the public
dev key on 2026-11-05 and are recorded in section 10. No order was placed.

---

## 0. TL;DR for the build

- Base URL `https://flash.definitive.fi/v1`, header `x-definitive-api-key: dpka_...`. Public dev key
  `dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b` works today (integrator fees from it accrue to Definitive, not you).
- Base (`"base"`, chainId 8453) is supported; USDC on Base is `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  (6 decimals), WETH `0x4200000000000000000000000000000000000006`.
- Flow: `POST /quote` (with `funderAddress`) → if `evm.approveTx` non-null, funder sends it on-chain (one-time
  per token, needs gas) → funder signs `evm.orderTypedData` with EIP-712 (`eth_signTypedData_v4`) → `POST /order`
  echoing the typed data + `quoteId` → poll `GET /orders/{orderId}?funderAddress=` (or WebSocket).
- Fee: send the same string `flashIntegratorFeeBps` (max `"1000"`) on quote and order. Fees land in your
  Definitive account's Flash Portfolio vault; there is no per-request recipient parameter.
- Cancel / update are gasless `personal_sign` messages, not transactions.
- Fastest fill at $2–5 on Base: `orderType: "market"` (no Definitive fee; ~5-minute signed deadline; keeper
  executes immediately). A $3 market, limit and TWAP all quoted successfully (section 10), but the placement-time
  minimum notional is not published (section 9).
- `orderType` has no `"dca"` value; the docs treat DCA as TWAP (`durationSeconds` ≥ 300, `twapBucketCount` 2–2560).

---

## 1. Base URL, auth, API key

| Item | Value | Source |
|---|---|---|
| Base URL | `https://flash.definitive.fi/v1` (OpenAPI `servers[0].url`) | https://flash.definitive.fi/v1/openapi.json ; https://flash.definitive.fi/docs/evm-overview.md |
| Auth header | `x-definitive-api-key: <key>` — OpenAPI `securitySchemes.ApiKeyAuth = {type: apiKey, in: header, name: "x-definitive-api-key"}` | https://flash.definitive.fi/v1/openapi.json |
| Key format | `dpka_` prefix, e.g. `dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b` | https://flash.definitive.fi/docs/for-agents.md |
| Public dev key | `dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b` — "safe for development"; "If you only want to trade, you can use the prefilled Definitive integrator key" | https://flash.definitive.fi/docs/for-agents.md ; https://flash.definitive.fi/docs/market-order.md |
| Get your own key | 1) Create a new Definitive account at https://app.definitive.fi with an email (or Google/Apple). 2) Top nav → "More" → "Flash" (Flash Integrator Dashboard). 3) Click "Create Flash Key". Only the account's Admin (signup email) can cancel user orders from the UI. | https://flash.definitive.fi/docs/getting-started.md |
| Alt key path (MCP) | `app.definitive.fi/account/organization/mcp-setup` → "Generate API Key" | https://flash.definitive.fi/docs/flash-mcp.md |
| Content type | `content-type: application/json` on POST/PATCH | https://flash.definitive.fi/docs/market-order.md |
| Key safety | "A leaked API key cannot move funds on its own" — every trade needs the funder's signature | https://flash.definitive.fi/docs/security.md |
| Sandbox | None. "We recommend testing on a production chain like Base or Solana using small amounts." | https://flash.definitive.fi/docs/faq.md |
| Rate limit (docs) | 5 req/s per endpoint per API key; separate bucket per endpoint; batch cancel bucket is 1 req/s. Headers `RateLimit-Policy` (e.g. `5;w=1`), `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds, ≤1). On 429 wait `RateLimit-Reset`. | https://flash.definitive.fi/docs/rate-limits.md |
| Rate limit (observed) | Live `GET /search` with the dev key returned `ratelimit-policy: 2;w=1`, `ratelimit-limit: 2` — i.e. 2/s on that endpoint for the public key. Treat 5/s as the documented ceiling, not a guarantee. | live probe, section 10 |
| WebSocket | `wss://flash.definitive.fi/v1/ws`; auth in-band via `apiKey` field on every `subscribe`; channels `orders`, `quotes`, `heartbeats`; ≥50 connections per key | https://flash.definitive.fi/docs/api-reference/flash/websocket-connection.md |
| Agent policy | The docs ask AI agents to POST an "intent report" to `https://www.definitive.fi/api/leads`. Not done during this research; a human decision. | https://flash.definitive.fi/docs/agent-policy.md |

---

## 2. Supported chains and token identification

Source: https://flash.definitive.fi/docs/supported-chains.md and OpenAPI `Chain` enum.

`Chain` enum (verbatim): `"arbitrum" | "avalanche" | "base" | "bsc" | "ethereum" | "optimism" | "polygon" | "solana" | "hyperevm" | "plasma" | "monad" | "robinhood" | "ink" | "arc"`

| `Chain` value | Chain ID | Public RPC (from docs) |
|---|---|---|
| `arbitrum` | 42161 | https://arb1.arbitrum.io/rpc |
| `arc` | 5042 | https://rpc.drpc.mainnet.arc.io |
| `avalanche` | 43114 | https://api.avax.network/ext/bc/C/rpc |
| `base` | **8453** | https://mainnet.base.org |
| `bsc` | 56 | https://bsc-dataseed.bnbchain.org |
| `ethereum` | 1 | https://ethereum-rpc.publicnode.com |
| `hyperevm` | 999 | https://rpc.hyperliquid.xyz/evm |
| `ink` | 57073 | https://rpc-gel.inkonchain.com |
| `monad` | 143 | https://rpc.monad.xyz |
| `optimism` | 10 | https://mainnet.optimism.io |
| `plasma` | 9745 | https://rpc.plasma.to |
| `polygon` | 137 | https://polygon-bor-rpc.publicnode.com |
| `robinhood` | 4663 | https://rpc.mainnet.chain.robinhood.com |
| `solana` | n/a | https://api.mainnet-beta.solana.com |

- **Base chainId 8453 is supported.** The API takes the chain *name* (`"base"`), never the numeric id.
- **Which chains have USDC:** the docs do not publish a token list. Any ERC-20 with on-chain liquidity is tradable
  ("advanced orders for any ERC-20 token on 13 EVM chains", https://flash.definitive.fi/docs/evm-overview.md).
  Use `GET /search?query=usdc` (omit `chain`) to get per-chain USDC listings — the docs say this "returns the
  Base, Solana, and Ethereum listings as separate results" (https://flash.definitive.fi/docs/placing-orders.md).
  Documented USDC addresses: Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Arbitrum
  `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, Ethereum `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, Solana
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- **Token identification:** always by contract address, never symbol ("Assets are always referenced by address,
  not symbol", https://flash.definitive.fi/docs/placing-orders.md). EVM addresses are `0x` hex; Solana are base58
  mints. Quantities (`qty`, `balance`, `amount`) are decimal strings in normalized (human) units, not base units.
- **Native ETH:** spend side must use the sentinel `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`; the quote then
  returns `wrap.evmTx` (a `deposit()` on WETH) to send first, and you submit with `wrap.wrappedAsset`. Submitting
  with the sentinel as the *spent* asset is rejected. Receiving native ETH (sentinel on the received side) is allowed.
  (https://flash.definitive.fi/docs/evm-overview.md#native-eth-and-wrapped-assets)
- **Target/contra convention:** `targetAsset` is the asset being traded/priced; `contraAsset` is the pricing/payment
  asset (spent on buys, received on sells). `qty` is always the amount **spent**: contra units on `buy`, target units
  on `sell`. (https://flash.definitive.fi/docs/placing-orders.md)
- **Pricing bases:** `limitNotionalPrice` / `notionalPrice` = USD price of one target unit; `limitCrossPrice` /
  `crossPrice` = contra units per target unit. Exactly one per price. (https://flash.definitive.fi/docs/placing-orders.md#pricing-basis)

---

## 3. Endpoints, request/response JSON, enums

All from https://flash.definitive.fi/v1/openapi.json unless noted. Every endpoint has `security: [{ApiKeyAuth: []}]`
and returns `ErrorResponse` on 400/401/403/404/422/429/500/503/504.

### 3.0 Enums

```ts
// OrderType
"market" | "limit" | "twap" | "stop" | "stop-loss" | "take-profit" | "bracket" | "trailing-stop" | "trailing-stop-limit"
// OrderSide
"buy" | "sell"
// PriceTrigger.triggerType
"upper" | "lower"
// FlashOrderStatus
"ORDER_STATUS_UNSPECIFIED" | "ORDER_STATUS_PENDING" | "ORDER_STATUS_ACCEPTED" | "ORDER_STATUS_PARTIALLY_FILLED"
| "ORDER_STATUS_FILLED" | "ORDER_STATUS_CANCELLED" | "ORDER_STATUS_REJECTED" | "ORDER_STATUS_TERMINATED"
// FlashChainStatus (per fill)
"CHAIN_STATUS_UNSPECIFIED" | "CHAIN_STATUS_PROCESSED" | "CHAIN_STATUS_REORGED" | "CHAIN_STATUS_FINALIZED"
// AttachedBracketRead.status
"pending_activation" | "never_activated" | "active"
// SubmitSetupTransactionResponse.status
"confirmed" | "pending"
// QuoteLeg.asset
"target" | "contra"
```

Status semantics (https://flash.definitive.fi/docs/order-statuses.md): cancellable = `PENDING`, `ACCEPTED`,
`PARTIALLY_FILLED`; terminal = `FILLED`, `CANCELLED`, `REJECTED`, `TERMINATED`. `PARTIALLY_FILLED` is a *resting*
state for TWAP. flash-mcp's `TERMINAL_STATUSES` = `{FILLED, CANCELLED, REJECTED, TERMINATED}`
(https://github.com/DefinitiveCo/flash-mcp/blob/main/src/types.ts).

`closeReason` values seen in docs (string, "not exhaustive and can grow"): `REASON_USER_REQUESTED`,
`REASON_FULLY_FILLED`, `REASON_INSUFFICIENT_FUNDER_BALANCE`, `REASON_INSUFFICIENT_ASSET_BALANCE`,
`REASON_MAXIMUM_SLIPPAGE_EXCEEDED`, `REASON_EXECUTION_COST_EXCEEDS_LIMIT` (costs > 30% of order value),
`REASON_ORDER_REJECTED_AT_VENUE`, `REASON_ORDER_TRIGGERED_ON_ENTRY`, `REASON_ORDER_EXPIRED`,
`REASON_PRICE_IMPACT_TOO_HIGH`, `REASON_INSUFFICIENT_LIQUIDITY`, `REASON_ORDER_CANNOT_BE_PLACED`.
Model as `z.string().nullable()`, not an enum.
(https://flash.definitive.fi/docs/order-statuses.md, https://flash.definitive.fi/docs/brackets.md)

Endpoint map:

| Method | Path | Request | 2xx | Purpose |
|---|---|---|---|---|
| POST | `/quote` | `QuoteRequest` | 200 `QuoteResponse` | price + signing payloads |
| POST | `/order` | `SubmitOrderRequest` | **201** `SubmitOrderResponse` | submit signed order |
| POST | `/setup-transaction` | `SubmitSetupTransactionRequest` | 200 `SubmitSetupTransactionResponse` | broadcast a signed `setupTxs[i]` |
| GET | `/orders` | query `funderAddress?`, `statuses?`, `pageSize?`, `pageToken?` | 200 `FlashListOrdersResponse` | list |
| GET | `/orders/{orderId}` | query `funderAddress` (required) | 200 `FlashGetOrderResponse` | order + fills |
| PATCH | `/orders/{orderId}` | `UpdateOrderRequest` | 200 `UpdateOrderResponse` | reprice resting order |
| POST | `/orders/{orderId}/cancel` | `CancelOrderRequest` | 200 `CancelOrderResponse` | cancel one |
| POST | `/orders/cancel` | `BatchCancelOrderRequest` | 200 `BatchCancelOrderResponse` | cancel ≤25 |
| GET | `/search` | query `query` (required), `chain?`, `limit?` | 200 `FlashSearchAssetsResponse` | asset lookup |
| GET | `/balances/{address}` | path `address` | 200 `FlashBalancesResponse` | wallet balances |

### 3.1 `POST /quote` — `QuoteRequest`

Required: `targetChain`, `contraChain`, `targetAsset`, `contraAsset`, `side`, `qty`, `orderType`.

| Field | Type | Notes (verbatim-ish from spec) |
|---|---|---|
| `targetChain` | `Chain` | chain of target asset |
| `contraChain` | `Chain` | chain of contra asset; differs from `targetChain` only for cross-chain `market` |
| `targetAsset` | string (minLength 1) | address |
| `contraAsset` | string (minLength 1) | address, "spent on buys, received on sells" |
| `side` | `OrderSide` | |
| `qty` | string | decimal, spent-asset units (contra on buy, target on sell). Example `"1.5"` |
| `orderType` | `OrderType` | cross-chain supports `market` only |
| `quickTrade` | boolean | sniping mode, same-chain market only; "Reach out to the Definitive team" |
| `maxSlippage` | string | decimal, e.g. `"0.05"`; standard market orders; if omitted engine applies `recommendedSlippage` |
| `maxPriceImpact` | string | decimal; advanced orders; triggered market orders default `"0.5"` |
| `limitNotionalPrice` | string | USD price of target; required on `limit` (unless `limitCrossPrice`); optional on `twap`, `stop`, `stop-loss`, `take-profit` (promotes trigger to LIMIT variant); rejected on `market`, `bracket`, trailing |
| `limitCrossPrice` | string | contra per target; mutually exclusive with `limitNotionalPrice` |
| `funderAddress` | string | wallet that funds/signs. **Omit it and `evm.orderTypedData` comes back empty** |
| `recipientAddress` | string | required when chains differ |
| `evmUsePermit2` | boolean | `true` forces Permit2 flow; `false` forces direct-approval flow (no `permitTypedData`); omitted = server picks from on-chain state (typically direct approval) |
| `forceMinimalAllowance` | boolean | size approvals/permits to cumulative required amount; default false |
| `svmUseNativeSOL` | boolean | Solana only |
| `flashIntegratorFeeBps` | string | "Integrator fee in basis points (100 = 1%). Maximum 1000 (10%)." Example `"100"` |
| `expireTime` | string date-time | ISO-8601; optional for limit/trigger/trailing/bracket (omit = GTC); rejected on `market` and `twap` |
| `startTime` | string date-time | TWAP only; scheduled start; `durationSeconds` measured from it |
| `durationSeconds` | integer, minimum 300 | TWAP only, required; quote-time only (not echoed on submit) |
| `twapBucketCount` | integer, 2..2560 | TWAP only; omit to auto-derive; must echo on submit |
| `triggers` | `PriceTrigger[]` maxItems 2 | required for `stop`/`stop-loss`/`take-profit` (length 1) and `bracket` (length 2, opposite `triggerType`) |
| `trailingStop` | `TrailingStopTrigger` | required for `trailing-stop`/`trailing-stop-limit`; not allowed elsewhere |
| `attachedBracket` | object `{takeProfit, stopLoss, expireTime?}` | same-chain `market`/`limit`/`twap`; requires `funderAddress` |

```ts
// PriceTrigger — required: triggerType; exactly one of notionalPrice | crossPrice
{ notionalPrice?: string; crossPrice?: string; triggerType: "upper" | "lower"; limitPrice?: string /* bracket legs only */ }
// TrailingStopTrigger — required: trailPercent ("0.005".."0.5" inclusive)
{ trailPercent: string; activationPrice?: string /* USD; omit = arm immediately */ }
// AttachedBracketLeg — exactly one of notionalPrice | crossPrice; prices are on the RECEIVED asset
{ notionalPrice?: string; crossPrice?: string; limitPrice?: string }
```

Documented example bodies (https://flash.definitive.fi/docs/placing-orders.md, .../brackets.md, .../trailing-stop.md):

```jsonc
// market buy: spend 3 USDC for WETH on Base (qty is contra units)
{ "targetChain":"base","contraChain":"base",
  "targetAsset":"0x4200000000000000000000000000000000000006","contraAsset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "side":"buy","qty":"3","orderType":"market","maxSlippage":"0.05","funderAddress":"0x…","flashIntegratorFeeBps":"50" }
// limit buy at $1000/WETH or better
{ …same pair…, "side":"buy","qty":"100","orderType":"limit","limitNotionalPrice":"1000" }
// twap: sell 5 WETH over 1h, optional buckets / schedule / limit
{ …same pair…, "side":"sell","qty":"5","orderType":"twap","durationSeconds":3600,"twapBucketCount":12,"startTime":"2026-05-12T00:00:00Z","limitNotionalPrice":"4000" }
// stop-loss: sell 0.05 WETH when price <= $3000 (sell at market; add limitNotionalPrice for stop-limit)
{ …same pair…, "side":"sell","qty":"0.05","orderType":"stop-loss","triggers":[{"notionalPrice":"3000","triggerType":"lower"}] }
// take-profit: sell when price >= $5000
{ …same pair…, "side":"sell","qty":"0.05","orderType":"take-profit","triggers":[{"notionalPrice":"5000","triggerType":"upper"}] }
// stop (buy on breakout): buy with 100 USDC once price >= $4000
{ …same pair…, "side":"buy","qty":"100","orderType":"stop","triggers":[{"notionalPrice":"4000","triggerType":"upper"}] }
// standalone bracket on held WETH: TP $5000, SL $3000 with leg limit $2950, GTT
{ …same pair…, "side":"sell","qty":"0.05","orderType":"bracket","funderAddress":"0x…",
  "triggers":[{"notionalPrice":"5000","triggerType":"upper"},{"notionalPrice":"3000","triggerType":"lower","limitPrice":"2950"}],
  "expireTime":"2026-10-28T00:00:00Z" }
// market entry with attached bracket (prices on the received asset = WETH)
{ …same pair…, "side":"buy","qty":"100","orderType":"market","funderAddress":"0x…",
  "attachedBracket":{ "takeProfit":{"notionalPrice":"5000"}, "stopLoss":{"notionalPrice":"3000"}, "expireTime":"2026-06-12T00:00:00Z" } }
// trailing stop: sell 0.05 WETH when it falls 5% from its high, arming at $4000
{ …same pair…, "side":"sell","qty":"0.05","orderType":"trailing-stop","trailingStop":{"trailPercent":"0.05","activationPrice":"4000"} }
// trailing-stop-limit (rests a limit at the effective trigger)
{ …same pair…, "side":"sell","qty":"0.05","orderType":"trailing-stop-limit","trailingStop":{"trailPercent":"0.03"} }
```

Per-type rules (https://flash.definitive.fi/docs/placing-orders.md#quick-reference, .../trigger-orders.md):

| `orderType` | fixed `side`? | price fields | expiry | notes |
|---|---|---|---|---|
| `market` | any | none allowed (`maxSlippage` optional) | auto ~5 min signed deadline; `expireTime`/`durationSeconds` rejected | |
| `limit` | any | exactly one of `limitNotionalPrice`/`limitCrossPrice` | `expireTime` optional | buy fills at/below, sell at/above |
| `twap` | any | optional limit (one basis) | `durationSeconds` (≥300) required; `startTime` optional; `expireTime` rejected | `twapBucketCount` 2–2560; 60 s execution buffer added |
| `stop` | `buy` (docs) | one `triggers[0]`, `triggerType` `upper` typical; optional limit | `expireTime` optional | |
| `stop-loss` | `sell` | one trigger, `triggerType: "lower"`; optional limit | `expireTime` optional | default `maxPriceImpact` 50% |
| `take-profit` | `sell` | one trigger, `triggerType: "upper"`; optional limit | `expireTime` optional | |
| `bracket` | `sell` | two `triggers` (one `upper`, one `lower`), per-leg `limitPrice` optional; order-level limit rejected | `expireTime` optional | leg defaults: TP 15% / SL 50% max impact |
| `trailing-stop` | any | `trailingStop` only; no limit, no `triggers` | `expireTime` optional | not updatable |
| `trailing-stop-limit` | any | same | same | rests limit at effective trigger |

### 3.2 `POST /quote` — `QuoteResponse`

Required keys: `quoteId`, `orderType`, `side`, `targetAsset`, `contraAsset`, `from`, `to`, `fees`,
`estimatedPriceImpact`, `wrap`, `evm`, `svm`. Optional: `bridgeQuoteId`, `recommendedSlippage`, `attachedBracket`, `setupTxs`.

| Field | Type | Notes |
|---|---|---|
| `quoteId` | string | UUID in practice (spec example `q_abc123`). Echo on submit |
| `bridgeQuoteId` | string \| null | cross-chain only; echo when non-null |
| `orderType`, `side` | enums | |
| `targetAsset`, `contraAsset` | string | may differ from request when native was wrapped — submit with these |
| `from` | `QuoteLeg` | spent leg: `{asset:"target"|"contra", amount:string, notional:string}` |
| `to` | `QuoteLeg` | received (net, post-fee) leg |
| `fees` | `{estimatedFeeNotional: string}` | USD: Definitive fee + integrator fee + gas |
| `estimatedPriceImpact` | string \| null | decimal; can be negative |
| `recommendedSlippage` | string \| null | set on market quotes only (observed `"0.15"` for a $3 order) |
| `wrap` | `QuoteWrapAction` \| null | `{nativeAsset, wrappedAsset, evmTx:{to,data,value}|null, svmInstructions|null}` |
| `evm` | `QuoteEvmActions` \| null | `{approveTx:{to,data}|null, permitTypedData:string|null, orderTypedData:string|null}` |
| `svm` | `QuoteSvmActions` \| null | null on EVM |
| `attachedBracket` | `QuoteAttachedBracketSigning` | only when request had `attachedBracket`: `{evm:{approveTx,permitTypedData,orderTypedData}|null, svm:{…}|null, salt:string|null, deadline:string, signedMaxFromAmount:string}` |
| `setupTxs` | string[] \| null | unsigned pre-trade txs (EVM: 0x-hex, 1–2 at consecutive nonces); sign + `POST /setup-transaction` in order |

**Zod gotcha (observed live):** when `funderAddress` is omitted, `evm.orderTypedData` and `evm.permitTypedData`
are `""` (empty string), not `null`. Model as `z.string().nullable()` and treat `""` as absent. The docs say the same
("the quote returns an empty `evm.orderTypedData`", https://flash.definitive.fi/docs/evm-overview.md).

`evm.orderTypedData` is a **JSON-stringified** EIP-712 payload `{domain, types, primaryType, message}`. Parse it to
sign; echo the original string back unchanged. (https://flash.definitive.fi/docs/for-agents.md)

### 3.3 `POST /order` — `SubmitOrderRequest` → 201 `SubmitOrderResponse`

Required: `targetChain`, `contraChain`, `targetAsset`, `contraAsset`, `side`, `qty`, `orderType`, `funderAddress`,
`userSignature`. Repeat the *same trade fields as the quote* (the docs spread the original request object) plus:

| Field | Type | Notes |
|---|---|---|
| `funderAddress` | string | required |
| `quoteId` | string | "For marketable orders, passing this value in tries executing the cached quote… For non-market orders, this field is unnecessary." Docs always send it |
| `bridgeQuoteId` | string | cross-chain only |
| `flashIntegratorFeeBps` | string | must equal the quote's value |
| `erc8021AttributionCode` | string `^[a-zA-Z0-9_.-]{1,32}$` | order-only; Base builder code (base.dev); ignored on SVM |
| `userSignature` | string | EVM: 0x-hex EIP-712 signature over `evm.orderTypedData` |
| `evmOrderTypedData` | string | echo of `QuoteResponse.evm.orderTypedData` (EVM required in practice) |
| `evmPermitTypedData` | string | echo of `evm.permitTypedData` when non-empty |
| `evmPermitSignature` | string | EIP-712 signature over `evm.permitTypedData` |
| `svmNonce`, `svmDeadline`, `svmSponsoredDelegateTx` | string | Solana only; must NOT be present on EVM |
| `twapBucketCount` | integer 2..2560 | TWAP; must equal quote value |
| `startTime` | date-time | TWAP; must equal quote value |
| `triggers` | `PriceTrigger[]` ≤2 | must echo quote values (bracket leg `limitPrice` is signed on EVM) |
| `trailingStop` | `TrailingStopTrigger` | must echo |
| `attachedBracket` | object | `{takeProfit, stopLoss, userSignature, salt (EVM), svmNonce (SVM), deadline, signedMaxFromAmount, evmPermitSignature?, evmPermitTypedData?}`; required: `takeProfit`, `stopLoss`, `userSignature`, `deadline`, `signedMaxFromAmount` |

Not sent on submit: `durationSeconds`, `expireTime`, `evmUsePermit2`, `forceMinimalAllowance`, `svmUseNativeSOL`
(flash-mcp strips exactly these: https://github.com/DefinitiveCo/flash-mcp/blob/main/src/orderFlow.ts
`orderTradeFieldsFromQuote`). `maxSlippage`/`maxPriceImpact` are "quote-time parameters" but the docs' examples
spread them into the submit body too, which is accepted.

```jsonc
// documented EVM submit (https://flash.definitive.fi/docs/monetizing-your-integration.md)
{ "targetChain":"base","contraChain":"base",
  "targetAsset":"0x4200000000000000000000000000000000000006","contraAsset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "side":"buy","qty":"100","orderType":"market",
  "funderAddress":"0xUSER_WALLET","quoteId":"q_abc123","userSignature":"0x...","evmOrderTypedData":"...",
  "flashIntegratorFeeBps":"50" }
// response (201)
{ "orderId": "887ccf13-…" }                                   // UUID
{ "orderId": "887ccf13-…", "attachedBracket": { "status": "pending_activation" } }  // when attachedBracket sent
```

`SubmitOrderResponse`: `{ orderId: string; attachedBracket?: { status: string } }`.

**Double-submit hazard** (flash-mcp source comment): `/order` "can create — and even fill — an order and STILL respond
with a 4xx (observed in the wild as `400 VALIDATION_ERROR: Request validation failed`)". flash-mcp snapshots
`GET /orders` before submit and reconciles after any error for ~40 s before surfacing it. Do not blindly retry a
failed submit. (https://github.com/DefinitiveCo/flash-mcp/blob/main/src/orderFlow.ts)

### 3.4 `POST /setup-transaction`

Request `{ signedSetupTx: string }` (one funder-signed entry from `setupTxs`, 0x-hex on EVM). Response
`{ status: "confirmed" | "pending" }`. `pending` = broadcast, poll the tx yourself, do not re-sign.
`FAILED_PRECONDITION` error = stale tx → new quote. (https://flash.definitive.fi/docs/api-reference/flash/setup-transaction.md)

### 3.5 `GET /orders/{orderId}?funderAddress=` — `FlashGetOrderResponse` (order status + fills)

Path `orderId` (uuid). Query `funderAddress` **required** per OpenAPI (flash-mcp omits it and the docs' example
`GET /v1/orders/{orderId}?funderAddress=0x…` includes it — send it).

```ts
{ order: FlashOrder; fills: FlashFill[] }

FlashOrder /* required unless marked ? */ {
  orderId: string; orderType: OrderType; side: OrderSide; status: FlashOrderStatus;
  closeReason: string | null;            // e.g. REASON_USER_REQUESTED, REASON_FULLY_FILLED
  funderAddress: string; recipientAddress: string | null;
  integratorFeeBps: string | null;       // your flashIntegratorFeeBps
  tradeFeeBps: string | null;            // Definitive's fee; null on market orders
  targetAsset: FlashAssetRef; contraAsset: FlashAssetRef;
  qty: string;
  filled: { targetAmount: string|null; contraAmount: string|null; averagePrice: string|null; averageNotionalPrice: string|null } | null;
  limitNotionalPrice: string | null; limitCrossPrice: string | null;
  trigger: PriceTrigger | null;          // single-trigger types only
  brackets: PriceTrigger[] | null;       // standalone bracket legs
  trailingStop?: TrailingStopRead;       // { trailPercent, activationPrice|null, activated:boolean, watermarkPrice|null, effectiveTriggerPrice|null, watermarkUpdatedAt|null }
  attachedBracket?: AttachedBracketRead; // { status, bracketOrderId|null, takeProfit|null, stopLoss|null, signedMaxFromAmount|null, expiresAt|null }
  sourceEntryOrderId?: string;
  maxPriceImpact: string | null; twapBucketCount: number | null;
  placedAt: string; acceptedAt: string|null; closedAt: string|null; expiresAt: string|null;
}
FlashAssetRef { id: string; name: string; address: string; ticker: string; chain: { id: string; name: string; namespace: string } }

FlashFill /* required unless ? */ {
  status: FlashChainStatus; notional: string; venues: string[]; filledAt: string;
  rootOrderId: string; orderId: string /* TWAP child slice id */; parentOrderId: string; transactionId: string;
  fillPrice: string;
  feeAmount: string; feeTicker: string;            // total fee in feeTicker (market: integrator fee only)
  tradeFeeAmount?: string; networkFeeAmount?: string;  // omitted on market orders
  integratorFeeAmount: string;                     // "0" when none
  feeNotional: string; tradeFeeNotional?: string; networkFeeNotional?: string; integratorFeeNotional: string;
  contraAmount: string; targetAmount: string;
}
```

There is no separate "list fills" endpoint; fills ride `GET /orders/{orderId}`.
(https://flash.definitive.fi/docs/post-trade-reporting.md). `completedFillCount` (TWAP progress) is documented on
the Orders WebSocket frame and the TWAP page but is **not** in the REST `FlashOrder` schema — make it optional.

Live 404 shape: `{"error":{"code":"NOT_FOUND","message":"flash get order failed: order <id> not found"}}` (no `details` key).

### 3.6 `GET /orders` — `FlashListOrdersResponse`

Query: `funderAddress?` (omit = every funder in the portfolio), `statuses?` (comma-separated `FlashOrderStatus`,
e.g. `ORDER_STATUS_FILLED,ORDER_STATUS_CANCELLED`), `pageSize?` (1..200, default 50), `pageToken?` (opaque).
Response `{ orders: FlashOrder[]; nextPageToken: string | null }`, most recent first. Live: `{"orders":[],"nextPageToken":null}`.
The list is eventually consistent ("can lag 15s+ behind a just-filled order" — flash-mcp comment).

### 3.7 `POST /orders/{orderId}/cancel` — `CancelOrderRequest` → `{ ok: true }`

```ts
{ cancelMessage: string; userSignature: string }
// cancelMessage, byte-exact, em dash U+2014, single "\n", no trailing newline:
`Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`
// userSignature: EVM = EIP-191 personal_sign over the message, 65 bytes 0x-hex (ERC-1271/ERC-6492 verified)
```

Semantics (https://flash.definitive.fi/docs/cancelling-orders.md): idempotent (already-cancelled → 200);
terminal statuses → 422 (`order already filled` when a fill won the race); partial fills kept; attached bracket
pairs are cancelled separately by their own `orderId`; token approval is left in place.

### 3.8 `POST /orders/cancel` — batch (≤25)

```ts
{ orderIds: string[] /* 1..25 lowercase UUIDs, no dups */; cancelMessage: string; userSignature: string }
// `Definitive Flash v1 — Cancel Orders\nOrders:\n${orderIds.join("\n")}`   (no trailing newline)
// → 200 { results: { orderId: string; ok: boolean; errorCode?: string }[] }
// errorCode: NOT_FOUND | ALREADY_FILLED | REJECTED | PENDING_CANCEL | SETTLING | INTERNAL_ERROR
```
Malformed signature → `400 INVALID_SIGNATURE`; rate bucket 1 req/s.

### 3.9 `PATCH /orders/{orderId}` — `UpdateOrderRequest` → `{ ok: true }`

```ts
{ limitNotionalPrice?: string; limitCrossPrice?: string;   // limit: exactly one
  trigger?: { notionalPrice?: string; crossPrice?: string; triggerType: "upper"|"lower" };  // single-trigger types
  triggers?: UpdateBracketLeg[];                            // bracket: both legs, each { …trigger, limitPrice? }
  updateMessage: string; userSignature: string }           // required
// updateMessage (no "v1", em dash, RFC3339 Issued At within 1 minute of server time, decimals byte-identical to body):
`Definitive Flash — Update Order\nOrder: ${orderId}\nIssued At: ${new Date().toISOString()}\nLimit Notional Price: 4000\nTrigger Lower Notional Price: 1800`
// bracket: no Limit line; `Trigger Lower Notional Price: …` then optional `Trigger Lower Limit Price: …`, then Upper lines
```
Updatable: `limit` (limit), `stop`/`stop-loss`/`take-profit` (trigger; `-limit` variants both), `bracket` (legs).
`market`/`twap`/trailing → 422. One update in flight at a time. 404 also covers bad signature.
(https://flash.definitive.fi/docs/updating-orders.md)

### 3.10 `GET /search` — `FlashSearchAssetsResponse`

Query `query` (required), `chain?` (`Chain`), `limit?` (1..25, default 10).
```ts
{ assets: { chain: Chain; address: string; symbol: string; name: string; decimals: number; price: string /* "0" = unknown */;
            marketCap: string; liquidity: string; volume24h: string; priceChange24h: string; holders: number;
            imageUrl: string; riskFlagged: boolean }[] }
```
Live: `GET /search?query=usdc&chain=base&limit=3` → USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` decimals 6, then axlUSDC.

### 3.11 `GET /balances/{address}` — `FlashBalancesResponse`

EVM address → balances across every supported EVM chain. Rows: `{ chain, address, symbol, tokenDecimals: number,
balance: string, notional: string, priceChange24h: string|null, imageUrl: string, isNative: boolean }`. Scam-flagged
and unpriced tokens are omitted.

---

## 4. Attaching a platform fee

Source: https://flash.definitive.fi/docs/monetizing-your-integration.md, https://flash.definitive.fi/v1/openapi.json

| Question | Answer |
|---|---|
| Parameter | `flashIntegratorFeeBps` — string, basis points (`"50"` = 0.50%). Send **the same string** on `POST /quote` and `POST /order`. |
| Limit | "Maximum 1000 (10%)" (OpenAPI). No documented minimum. |
| Recipient | **Not a request parameter.** Fees are deducted from trade output and routed "to the vault in your Flash Portfolio, controlled by your fee wallet" of the Definitive account that owns the API key. Withdraw at app.definitive.fi → Flash Portfolio → connect fee wallet → Withdraw. There is no per-order `feeRecipient`. |
| If omitted | No integrator fee for that order. |
| Fee token | Paid in one of the two trade tokens: stablecoin/major (e.g. WETH) if on either side, else the input token. `feeTicker` on each fill says which. |
| Definitive's own fee | Through 2026-12-31: 10 bps promo on advanced orders; from 2027-01-01: market 0 (all-in), advanced 20 bps. Market orders have "no added fee" since 2026-10-26 (changelog; live $3 market quote showed `estimatedFeeNotional: "0"`). Your fee stacks on top; you keep 100%. |
| Reconciling | Sum `integratorFeeNotional` across fills from `GET /orders/{orderId}`; `order.integratorFeeBps` echoes the rate. Also the Flash Integrator Dashboard. |
| Base attribution (separate) | `erc8021AttributionCode` (order-only, `[a-zA-Z0-9_.-]{1,32}`, no commas) stamps your base.dev builder code into settlement calldata as an ERC-8021 suffix. Invalid value → rejected with `erc8021AttributionCode must be 1–32 characters of [a-zA-Z0-9_.-] (no commas)`. Unregistered code never fails the order. |
| Using the public dev key | The fee would accrue to Definitive's own portfolio; get your own key for the hackathon demo. |

---

## 5. Sizes, intervals, limits

| Item | Value | Source |
|---|---|---|
| Minimum order notional | A minimum exists: error text `order below minimum notional size requirement` (400) on updates and "the same minimum order size placement enforces". **The number is not published.** Live: $3 quotes for market, limit and TWAP all returned 200 (quote stage only). | https://flash.definitive.fi/docs/updating-orders.md ; section 10 |
| Execution-cost guard | Orders are cancelled with `REASON_EXECUTION_COST_EXCEEDS_LIMIT` when "Execution costs (gas and fees) exceeded 30% of the order value" → for a $2–5 order keep fees+gas < $0.60–1.50. On Base gas is cents. | https://flash.definitive.fi/docs/order-statuses.md |
| DCA | No `dca` order type. Docs list "TWAP/DCA" together and describe DCA as "Recurring buys or sells at regular time intervals" implemented as TWAP. There is no `interval` parameter; cadence = `durationSeconds / twapBucketCount`. | https://flash.definitive.fi/docs/index.md ; https://flash.definitive.fi/docs/monetizing-your-integration.md |
| TWAP duration | `durationSeconds` integer, **minimum 300** (OpenAPI). Overview page says "over 10 minutes to 30 days" — the 30-day max is only on the marketing overview, not in the spec. 60 s execution buffer added to the signed deadline. | https://flash.definitive.fi/v1/openapi.json ; https://flash.definitive.fi/docs/index.md |
| TWAP buckets | `twapBucketCount` integer 2..2560 (optional at quote; must echo on submit). | OpenAPI |
| TWAP start | `startTime` ISO-8601 optional; must echo. | OpenAPI |
| Trailing | `trailPercent` string in [0.005, 0.5]; `activationPrice` USD optional. | OpenAPI |
| Bracket (standalone) params | `orderType:"bracket"`, `side:"sell"`, `qty`, `triggers[2]` = `{notionalPrice|crossPrice, triggerType:"upper"}` (take-profit) and `{…, triggerType:"lower", limitPrice?}` (stop-loss). `limitPrice` same units as the leg's trigger. Order-level limit fields rejected. `expireTime` optional. | https://flash.definitive.fi/docs/brackets.md |
| Bracket (attached) params | `attachedBracket.takeProfit` / `attachedBracket.stopLoss` each `{notionalPrice|crossPrice, limitPrice?}`, `attachedBracket.expireTime?`. Both legs same basis; TP trigger > SL trigger; prices on the **received** asset; on a `limit` entry use `limitCrossPrice` (not notional). Second signature required over `attachedBracket.evm.orderTypedData`; echo `salt`, `deadline`, `signedMaxFromAmount`. `signedMaxFromAmount` = quoted output +5% (market), 2× (limit/twap). | https://flash.definitive.fi/docs/brackets.md |
| Trigger defaults | Triggered market orders default `maxPriceImpact` 50%; attached-bracket legs TP 15% / SL 50%. | https://flash.definitive.fi/docs/trigger-orders.md |
| Market deadline | ~5 minutes from quote time, encoded in the typed data. | https://flash.definitive.fi/docs/placing-orders.md#order-expiry |
| GTC sentinel | `2^48 - 1` (`281474976710655`) deadline when `expireTime` omitted. | same |
| Batch cancel | ≤25 ids. | OpenAPI |
| Search limit | ≤25. List pageSize ≤200. | OpenAPI |

---

## 6. Signing flow (EVM / Base) and how a Privy embedded wallet does it

Sources: https://flash.definitive.fi/docs/evm-overview.md, https://flash.definitive.fi/docs/for-agents.md,
https://flash.definitive.fi/docs/non-custodial.md, https://flash.definitive.fi/docs/faq.md,
flash-mcp `src/signing/evm.ts` (https://github.com/DefinitiveCo/flash-mcp), Privy docs
(https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data.md, .../send-a-transaction.md, .../sign-a-message.md).

### 6.1 What gets signed, by whom, with which method

| Step | Artifact | Who | Wallet method | On-chain? |
|---|---|---|---|---|
| 1 Quote | `POST /quote` with `funderAddress` | server (your backend) | — | no |
| 2a Allowance (one-time per token per wallet) | `evm.approveTx = {to, data}` — ERC-20 `approve(spender, unlimited)` | **funder wallet must send it** ("must be sent from the `funderAddress`") | `eth_sendTransaction` with `{to, data, value: 0}`; wait for receipt | **yes, costs gas** |
| 2b Permit2 (only if quote returns it) | `evm.permitTypedData` (JSON string, EIP-712 `PermitSingle`) | funder | `eth_signTypedData_v4` → `evmPermitSignature`; echo `evmPermitTypedData` | no |
| 2c Native wrap (only if spending ETH) | `wrap.evmTx = {to, data, value}` | funder | `eth_sendTransaction` | yes |
| 3 Order | `evm.orderTypedData` (JSON string, EIP-712 `FlashOrder`) | funder | `eth_signTypedData_v4` → `userSignature` | no |
| 4 Submit | `POST /order` | server | — | Flash's keepers ("performers") land the settlement tx, pay gas, MEV-protect, retry |
| Cancel / update | plaintext message | funder | `personal_sign` (EIP-191) → `userSignature` | no |

- **Spender of the approval:** the quote decides. Default (no prior allowance) is the direct flow: spender = Flash
  settlement contract `0x5d00000873b6BF41539e6f5365B0Ff7d3c368f78` ("deployed at the same address on every
  supported EVM chain", https://flash.definitive.fi/docs/security.md). The EVM overview / minimal-authorization pages
  call this spender "FlashAllowance" / "DefinitiveFlashAllowance" — its address is not published separately; use
  `approveTx.to` as returned. Permit2 path: spender = canonical Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`,
  and the Permit2 `spender` inside the permit is scoped to the Flash settlement contract. Force the simpler direct
  flow with `evmUsePermit2: false` (changelog 2026-11-03).
- **Approval amount:** unlimited by default ("integrators who want an extra layer of safety can lower the amount to
  the exact order size before submitting it", non-custodial page). `forceMinimalAllowance: true` sizes it to the
  cumulative open-order amount (then re-approvals recur).
- **"Neither field returned"** (`approveTx: null`, `permitTypedData: ""`/null, `orderTypedData` present) is valid:
  authorization already covers it; just sign and submit.
- **Deadline** is inside `orderTypedData` (derived from `expireTime`/`durationSeconds`/~5 min for market). No separate
  deadline field on EVM.
- **What the signature authorizes:** an input debit (token, total amount, recipient, deadline, vault); not a minimum
  output. One signature can be drawn across multiple fills up to the signed amount. Price protection is enforced
  off-chain by Flash + an on-chain min-out computed by the keeper.
- **Signature validation:** if `funderAddress` has **any** on-chain code (smart wallet or EIP-7702 delegated EOA),
  Flash validates via EIP-1271 `isValidSignature`; otherwise ECDSA recovery. A bare `eth_signTypedData_v4` from a
  7702-delegated EOA is rejected `PERMISSION_DENIED: signature verification failed` unless the delegate accepts bare
  ECDSA. Cancel/update signatures are verified with ERC-1271 + ERC-6492 (counterfactual smart accounts OK).
- **Privy explicitly listed** as supported: "embedded smart wallets (e.g. Privy, Turnkey, Dynamic)" and "EOAs".

### 6.2 Known EIP-712 quirks (from flash-mcp `src/signing/evm.ts`)

```ts
const td = JSON.parse(quote.evm.orderTypedData);
// viem rejects the EIP712Domain entry inside `types`; strip it.
const { EIP712Domain: _ignored, ...types } = td.types ?? {};
// The quote serializes domain.chainId as a STRING; viem drops a string chainId from the domain hash → bad signature.
const domain = { ...td.domain, chainId: Number(td.domain.chainId) };
await wallet.signTypedData({ account, domain, types, primaryType: td.primaryType, message: td.message });
```
So the raw typed data contains `types.EIP712Domain` and `domain.chainId` as a string. `eth_signTypedData_v4`
(MetaMask-style, which Privy's provider implements) normally *wants* `EIP712Domain` in `types` and accepts a string
chainId, so passing the parsed object through the provider path should work unmodified, but this is unverified
(section 9). The FAQ notes the payload contains a `vault` address (Definitive vault for your integrator account, one
per chain) — sign what is returned, do not edit.

### 6.3 Privy embedded wallet (React, `@privy-io/react-auth`) mapping

| Flash step | Privy call | Source |
|---|---|---|
| Sign `evm.orderTypedData` / `evm.permitTypedData` / `attachedBracket.evm.orderTypedData` | `const {signTypedData} = useSignTypedData(); const {signature} = await signTypedData(JSON.parse(typedDataString), { address: wallet.address, uiOptions: { showWalletUIs: false } })` — input is "The typed data object to sign with the wallet, with the properties defined in EIP-712" (top-level `domain/types/primaryType/message`, no `typedData` wrapper shown). Returns `{signature: string}` → `userSignature` / `evmPermitSignature`. | https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data.md |
| Same via EIP-1193 (any SDK) | `provider.request({ method: 'eth_signTypedData_v4', params: [address, typedData] })` — typedData as an object (Expo docs); JSON string also conventional for v4. | same |
| Send `evm.approveTx` / `wrap.evmTx` | `const {sendTransaction} = useSendTransaction(); const {hash} = await sendTransaction({ to, data, value }, { address: wallet.address })` → type `UnsignedTransactionRequest`; returns `{hash}`. Wallet must be on Base (chainId 8453) and hold ETH for gas (or use Privy `options.sponsor`). The docs example shows only `to`/`value`; `data` is standard but the React field list was not retrievable (section 9). | https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction.md |
| Cancel / update message | `const {signMessage} = useSignMessage(); const {signature} = await signMessage({ message: cancelMessage }, { address })` — "This method uses Ethereum's `personal_sign` RPC method." Provider form: `provider.request({ method: 'personal_sign', params: [message, address] })`. | https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-message.md |
| Server-side (Privy NodeJS SDK, if your backend owns the wallet) | `privy.wallets().ethereum().signTypedData(walletId, { params: { typed_data: { domain, types, primaryType, message } } })` → `{signature, encoding}`; `privy.wallets().ethereum().signMessage(walletId, { message })`; REST `POST /v1/wallets/<id>/rpc` with `eth_signTypedData_v4`. | https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data.md |

Important: Privy embedded wallets are plain EOAs unless you opt into Privy smart wallets or sign an EIP-7702
authorization (`useSign7702Authorization`, https://docs.privy.io/wallets/using-wallets/ethereum/sign-7702-authorization.md).
Keep them as plain EOAs for Flash so ECDSA recovery applies; if 7702-delegated, signatures must come from the
delegate's typed-data flow (see 6.1).

Alternative to sending `approveTx` yourself: quote returns `setupTxs` (unsigned raw EVM txs) which you sign and hand
to `POST /setup-transaction` so Flash broadcasts them ("no RPC provider needed"). This requires raw-transaction
signing (`eth_signTransaction`) from the funder wallet; whether Privy's React SDK exposes that is not confirmed here.

### 6.4 Reference end-to-end (viem, from the docs — adapt the two signing calls to Privy)

```ts
const BASE_URL = "https://flash.definitive.fi/v1";
const post = (path, body) => fetch(`${BASE_URL}${path}`, { method: "POST",
  headers: { "content-type": "application/json", "x-definitive-api-key": API_KEY }, body: JSON.stringify(body) }).then(r => r.json());

const order = { targetChain: "base", contraChain: "base",
  targetAsset: "0x4200000000000000000000000000000000000006", contraAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  side: "buy", qty: "3", orderType: "market", maxSlippage: "0.05", flashIntegratorFeeBps: "50" };

const quote = await post("/quote", { ...order, funderAddress: account.address });
if (quote.evm.approveTx) { const hash = await wallet.sendTransaction({ to: quote.evm.approveTx.to, data: quote.evm.approveTx.data, value: 0n }); await publicClient.waitForTransactionReceipt({ hash }); }
let permitFields = {};
if (quote.evm.permitTypedData) { const evmPermitSignature = await account.signTypedData(JSON.parse(quote.evm.permitTypedData)); permitFields = { evmPermitTypedData: quote.evm.permitTypedData, evmPermitSignature }; }
const { domain, types, primaryType, message } = JSON.parse(quote.evm.orderTypedData);
const userSignature = await account.signTypedData({ domain, types, primaryType, message });
const { orderId } = await post("/order", { ...order, funderAddress: account.address, quoteId: quote.quoteId, userSignature, evmOrderTypedData: quote.evm.orderTypedData, ...permitFields });
// poll: GET /orders/{orderId}?funderAddress=… every 2 s until status ∈ terminal (flash-mcp: 120 s budget, market only)
```
(https://flash.definitive.fi/docs/market-order.md)

---

## 7. Fastest fill at $2–5 notional on Base

**Use `orderType: "market"`** — it is the only type the keeper executes immediately; everything else rests.

Evidence:
- Market: "Execute immediately at the best available price"; signed deadline ≈5 min; keeper computes min-out from
  `maxSlippage`; "For market orders it polls until the order reaches a terminal status" (flash-mcp only auto-polls
  market because "resting orders (limit/twap/trigger) would poll forever"). (https://flash.definitive.fi/docs/market-order.md, flash-mcp `orderFlow.ts`)
- No Definitive fee on market orders (live $3 quote: `fees.estimatedFeeNotional: "0"`), so the 30%
  execution-cost cancel guard is easiest to clear; a $3 TWAP quote showed `estimatedFeeNotional: "0.172715"` (≈5.8%)
  and a $3 limit `"0.023371"`.
- Live $3 market quote returned `recommendedSlippage: "0.15"` (15%) — Flash auto-applies that if you omit
  `maxSlippage`; a tight explicit `maxSlippage` on a tiny order risks `REASON_MAXIMUM_SLIPPAGE_EXCEEDED`.
- Use a deep pair (USDC→WETH on Base; liquidity ≈$47M for WETH, ≈$86M for USDC per `/search`).
- Pass `quoteId` so the cached route is reused instead of requoting. Include `funderAddress` on the quote or you get
  no `orderTypedData`.
- Avoid: `limit` (rests), `twap` (≥300 s by definition), triggers (rest until price crosses; a trigger already
  crossed at placement is *cancelled* with `REASON_ORDER_TRIGGERED_ON_ENTRY`, not filled), cross-chain (bridging).
- If you need a "limit that fills now" for the demo, a marketable limit (buy with `limitNotionalPrice` above spot)
  is executed by the keeper when the price condition is already met at admission — but market is still faster and
  fee-free. Not documented as instant; confirm at the booth.

---

## 8. Error response shape and codes

Shape (every endpoint, https://flash.definitive.fi/docs/error-codes.md, OpenAPI `ErrorResponse`):

```json
{ "error": { "code": "string", "message": "string", "details": null } }
```
`code` and `message` always present; `details` optional/nullable (live 404 omitted the key entirely → zod
`details: z.unknown().optional().nullable()`).

HTTP statuses: `400` invalid params · `401` auth failed · `403` permission denied · `404` not found (also: order
outside your key's portfolio, or **bad cancel/update signature**) · `422` resource state (closed order, pending
update, already filled, non-updatable type) · `429` rate limit · `500` · `503` · `504`.

REST `error.code` values seen in docs/live (no exhaustive list is published):

| code | where | source |
|---|---|---|
| `VALIDATION_ERROR` | 400 "Invalid request" (docs example); also observed on a submit that nonetheless created an order | https://flash.definitive.fi/docs/for-agents.md ; flash-mcp |
| `NOT_FOUND` | 404 get-order (live: `flash get order failed: order … not found`) | live |
| `INVALID_SIGNATURE` | 400 batch cancel, malformed hex/base58 | https://flash.definitive.fi/docs/cancelling-orders.md |
| `PERMISSION_DENIED` | `signature verification failed` on 7702/1271 mismatch | https://flash.definitive.fi/docs/evm-overview.md |
| `FAILED_PRECONDITION` | setup-transaction stale tx | https://flash.definitive.fi/docs/api-reference/flash/setup-transaction.md |

Message strings documented for 400/422: `order below minimum notional size requirement`,
`order already has a pending update`, `order is closed and can no longer be updated`, `order already filled`,
`erc8021AttributionCode must be 1–32 characters of [a-zA-Z0-9_.-] (no commas)`.

WebSocket error frames `{ "type":"error", "code", "message" }`: `UNAUTHORIZED`, `CONNECTION_LIMIT`, `BAD_JSON`,
`UNKNOWN_CHANNEL`, `UNKNOWN_TYPE`, `INTERNAL_ERROR`, `INVALID_REQUEST`, `FUNDER_LOCKED`, `SUBSCRIBE_FAILED`,
`SNAPSHOT_FAILED`, `STREAM_ERROR`, `STREAM_ENDED`, `FORMAT_ERROR`, `SUBSCRIPTION_LIMIT`, `RATE_LIMITED`,
`SERVICE_UNAVAILABLE`, `DEADLINE_EXCEEDED`. (https://flash.definitive.fi/docs/api-reference/flash/websocket-connection.md,
.../websocket-orders.md, .../websocket-quotes.md)

Batch-cancel per-item `errorCode`: `NOT_FOUND`, `ALREADY_FILLED`, `REJECTED`, `PENDING_CANCEL`, `SETTLING`, `INTERNAL_ERROR`.

---

## 9. Unknown / must confirm at the booth

1. **Numeric minimum order notional** at placement (`order below minimum notional size requirement`). $3 quotes
   succeed; whether `POST /order` at $2–5 is accepted is unverified. Ask: "what is the minimum notional per order
   type on Base?"
2. **Exhaustive REST `error.code` list** — only `VALIDATION_ERROR`, `NOT_FOUND`, `INVALID_SIGNATURE`,
   `PERMISSION_DENIED`, `FAILED_PRECONDITION` are evidenced. Codes for 401/403/422/429/5xx are not published.
3. **Exhaustive `closeReason` list** — docs say it "can grow".
4. **Rate limit for a fresh integrator key** — docs say 5/s; the public key returned `ratelimit-policy: 2;w=1` on `/search`.
5. **DCA** — confirm there is no dedicated DCA type/interval param and that TWAP with `twapBucketCount` is the
   intended DCA; confirm TWAP max duration (overview says 30 days; spec has no max).
6. **Privy typed-data compatibility** — whether Privy's `signTypedData` accepts the payload with `types.EIP712Domain`
   present and `domain.chainId` as a string (viem needs both fixed per flash-mcp). Also the exact field list of
   Privy React `UnsignedTransactionRequest` (does `data` + `chainId` go in the input?) — the reference page 404'd.
7. **Whether Privy React can sign raw transactions** for the `setupTxs` / `POST /setup-transaction` path
   (otherwise send `approveTx` via `sendTransaction`).
8. **`GET /orders/{orderId}` without `funderAddress`** — OpenAPI marks it required; flash-mcp omits it. Send it.
9. **`completedFillCount`** on REST `FlashOrder` — documented for WebSocket/TWAP but absent from the REST schema.
10. **`quoteId` on non-market orders** — spec says "unnecessary"; docs always send it. Harmless to send.
11. **`maxSlippage`/`maxPriceImpact` on `POST /order`** — "quote-time parameters", but examples spread them into
    the submit body. Confirm they are ignored, not rejected.
12. **FlashAllowance contract address** (direct-approval spender) — not published; use `approveTx.to`.
13. **Fee payout timing/withdrawal minimums** for the Flash Portfolio vault — not documented.
14. **Whether a marketable `limit` executes at admission** (for the "instant fill" fallback in section 7).
15. **Is `erc8021AttributionCode` accepted on the dev key** — presumably yes; untested.
16. **Agent reporting policy** — the docs condition automated use on POSTing an intent report to
    `https://www.definitive.fi/api/leads`; decide whether the team wants to do that.
17. **Idempotency on `POST /order`** — no idempotency key documented; see the double-submit hazard in 3.3.

Things that were NOT behind auth: every docs page, the OpenAPI spec, and `GET /search`, `GET /orders`,
`GET /orders/{id}`, `POST /quote` with the public key were all reachable. The Privy React SDK reference pages
for `useSignTypedData` / `UnsignedTransactionRequest` returned 404 (the guide pages worked).

---

## 10. Live probe log (2026-11-05, public dev key, read-only)

```
POST /quote  {base/base, WETH/USDC, side:buy, qty:"3", orderType:"market"}  (no funderAddress)  → HTTP 200
{"quoteId":"9ac74ae6-acf5-487a-ac64-ad013736cbab","bridgeQuoteId":null,"orderType":"market","side":"buy",
 "targetAsset":"0x4200000000000000000000000000000000000006","contraAsset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
 "from":{"asset":"contra","amount":"3","notional":"3"},
 "to":{"asset":"target","amount":"0.001317664771196693","notional":"2.985159"},
 "fees":{"estimatedFeeNotional":"0"},"estimatedPriceImpact":"-0.0003113333333333333","recommendedSlippage":"0.15",
 "wrap":null,"evm":{"approveTx":null,"permitTypedData":"","orderTypedData":""},"svm":null,"setupTxs":null}

POST /quote  {…, qty:"3", orderType:"limit", limitNotionalPrice:"1000"}  → HTTP 200
 to.amount "0.0029766290000000000001", fees.estimatedFeeNotional "0.023371", estimatedPriceImpact "0", recommendedSlippage null

POST /quote  {…, qty:"3", orderType:"twap", durationSeconds:300}  → HTTP 200
 to.amount "0.001249110985912675", fees.estimatedFeeNotional "0.172715", estimatedPriceImpact "0.0002483333333333333", recommendedSlippage null

GET /search?query=usdc&chain=base&limit=3  → HTTP 200  (USDC 0x8335…2913 decimals 6, price "0.99975", liquidity "86412084"; then axlUSDC)
GET /orders/00000000-0000-0000-0000-000000000000?funderAddress=0xd8dA…6045  → HTTP 404
 {"error":{"code":"NOT_FOUND","message":"flash get order failed: order 00000000-0000-0000-0000-000000000000 not found"}}
GET /orders?funderAddress=0xd8dA…6045&pageSize=1  → HTTP 200  {"orders":[],"nextPageToken":null}
Response headers on GET /search: ratelimit-policy: 2;w=1 · ratelimit-limit: 2 · ratelimit-remaining: 1 · ratelimit-reset: 1
```

Probes with a third-party `funderAddress` / fee were not run (sandbox policy), so a real `orderTypedData` payload
was not captured; its structure (`domain`, `types` incl. `EIP712Domain`, `primaryType`, `message` incl. `vault`,
`deadline`) is known only from the docs and flash-mcp source.

---

## 11. Extras

- **MCP / SDK:** `@definitive-fi/flash-mcp` (npm, MIT, v0.1.11, deps viem/@solana/web3.js/zod) is an MCP server
  *and* the only open reference client (`src/flashClient.ts`, `src/orderFlow.ts`, `src/signing/evm.ts`,
  `src/types.ts`). Source: https://github.com/DefinitiveCo/flash-mcp. There is **no** standalone Flash SDK package;
  `@definitive-fi/flash` does not exist. `@definitive-fi/mcp` is a different product (Definitive DDP, `ddp.definitive.fi`,
  needs `dpks_` secret) — not Flash.
- **Machine-readable docs:** https://flash.definitive.fi/docs/llms.txt, https://flash.definitive.fi/docs/llms-full.txt,
  https://flash.definitive.fi/v1/openapi.json.
- **Orders WebSocket:** subscribe `{ "channel":"orders","type":"subscribe","funderAddress":"0x…","apiKey":"dpka_…" }`
  → `snapshot` then `update` frames of `FlashOrderUpdate[]` (adds `pendingUpdate: boolean`, `completedFillCount: number|null`).
  One funder scope per connection. (https://flash.definitive.fi/docs/api-reference/flash/websocket-orders.md)
- **Security:** EVM settlement `0x5d00000873b6BF41539e6f5365B0Ff7d3c368f78` (all EVM chains); Solana program
  `FLaSHxRVv6G1NCJ2SFGPvQqKUPszuDjaTkBMFCSzEqpJ`; audits at https://github.com/DefinitiveCo/definitive-public.
  Vulnerabilities → security@definitive.fi. (https://flash.definitive.fi/docs/security.md)
- **Cross-chain:** `market` only; set different `targetChain`/`contraChain`, send `recipientAddress` on both calls,
  echo `bridgeQuoteId` if non-null; cannot cancel while funds are in flight. (https://flash.definitive.fi/docs/crosschain-orders.md)
- **Changelog highlights:** 2026-11-03 `evmUsePermit2:false`; 10-29 trailing stops; 10-27 bracket leg `limitPrice`;
  10-26 market orders all-in (no fee); 10-22 standalone `bracket`; 10-15 auto-cancel on insufficient balance;
  09-25 batch cancel; 08-19 attached brackets; 08-17 streaming quotes, balances, `setupTxs`.
  (https://flash.definitive.fi/docs/changelog.md)
