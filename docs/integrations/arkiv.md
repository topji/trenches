# Arkiv integration notes — `@arkiv-network/sdk` 1.0.1 on the Rabdi testnet

Researched 2026-11-05 for ETHGlobal Mumbai. Every item carries the URL it was taken from. Where a fact comes from the SDK source rather than prose docs, the GitHub path is given (`https://github.com/Arkiv-Network/arkiv-sdk-js/blob/main/<path>`); the same files are browsable at `https://unpkg.com/@arkiv-network/sdk@1.0.1/src/<path>`.

Primary sources:
- Docs: https://docs.arkiv.network (sidebar: `/start-here/*`, `/schemas/*`, `/writing/*`, `/querying/*`, `/reference/*`, `/json-rpc/*`, `/networks/*`)
- Hub: https://hub.arkiv.network (`/networks`, `/access-keys`, `/faucet`)
- npm: https://www.npmjs.com/package/@arkiv-network/sdk (page returns 403 to fetchers; `npm view` output used instead)
- Repo: https://github.com/Arkiv-Network/arkiv-sdk-js (README, CHANGELOG, `src/`, `sample/`)
- Official agent skills, verified against SDK 1.0.1 on 2026-10-30/11-03: https://github.com/Arkiv-Network/skills (`skills/arkiv/SKILL.md`, `skills/arkiv/references/limits.md`, `skills/arkiv/references/known-issues.md`, `skills/arkiv-*/SKILL.md`)

---

## 0. READ FIRST — the spec's vocabulary is the old (0.x) API

The hackathon spec talks about "payload bytes", "string/numeric annotations", "BTL / blocks-to-live", `updateEntities`, `createEntities`. **None of those exist in SDK 1.0.x.** The 1.0.0 release (2026-10-30) removed them. Quote from the CHANGELOG (https://github.com/Arkiv-Network/arkiv-sdk-js/blob/main/CHANGELOG.md, `[1.0.0-dev.0]`):

> "This release implements user-defined entity columns. An entity is no longer a payload plus indexed attributes: it is any number of named, typed attributes, each of which the writer marks indexed or not. The SDK describes them with schemas."
>
> "**Breaking:** the entity payload and content type: `payload`/`contentType` on writes ... along with `Entity.toText()`/`toJson()`, `jsonToPayload()`, `stringToPayload()`, `MimeType`, `InvalidContentTypeError` and `MAX_PAYLOAD_BYTES`. Use `bytes` and `str` columns instead"
>
> "**Breaking:** `expires` is now `expiration` on `createEntity()`, `extendEntity()` and every batch operation"

And from 0.8.0: "**Breaking:** `updateEntity()`. Use `patchEntity()`, which changes only what it names, or delete and recreate for a full replacement" and "**Breaking:** `mutateEntities()` is now `executeBatch()`".

Mapping to use when reading the spec:

| Spec term | SDK 1.0.1 equivalent | Source |
|---|---|---|
| payload (bytes/string) | a `bytes()` column (≤128 KiB, hex on read) or a `str()` column (≤128 UTF-8 bytes) | https://docs.arkiv.network/schemas/column-types/ |
| string annotation | `str().indexed()` column | same |
| numeric annotation | `i32()` / `u64()` / `u256()` / `dec()` `.indexed()` column | same |
| BTL / blocks-to-live | `expiration: ExpirationTime.fromBlocks(n)` or `fromDays(n)` (still counted in 2-second blocks) | https://docs.arkiv.network/writing/expiration/ |
| `createEntities([...])` | `walletClient.executeBatch({ creates: [...] })` | https://docs.arkiv.network/writing/batches/ |
| `updateEntities` / update-in-place | `walletClient.patchEntity(schema, key, { set, unset })` | https://docs.arkiv.network/writing/change/ |
| `extendEntities` | `walletClient.extendEntity({ entityKey, expiration })` | https://docs.arkiv.network/writing/expiration/ |
| `deleteEntities` | `walletClient.deleteEntity({ entityKey })` | https://docs.arkiv.network/writing/change/ |
| query string `status = "x" && ...` | builder: `.where(and(eq("status","x"), ...))`; raw language: `status = str('x') AND ...` | https://docs.arkiv.network/reference/query-language/ |

The older networks that the old API targeted (Kaolin, Braga, Tiramisu) are retired/replaced; see §2.3. Old npm dist-tags still exist (`advanced: 0.8.0-advanced.3`, `next: 0.9.0-next.5`) but `latest` is `1.0.1` and Rabdi requires "a node running arkiv-reth 1.0.0 or later, which speaks the new protocol" (CHANGELOG). Do not install 0.x.

---

## 1. Version, install, peer dependencies

`npm view @arkiv-network/sdk` on 2026-11-05 (local run):

```
version = '1.0.1'
dist-tags = { advanced: '0.8.0-advanced.3', next: '0.9.0-next.5', latest: '1.0.1', dev: '1.0.0-dev.2' }
peerDependencies = { viem: '^2.0.0', typescript: '>=5.0.0' }   # typescript is optional (peerDependenciesMeta)
repository = git+https://github.com/Arkiv-Network/arkiv-sdk-js.git
```

Install (README, https://github.com/Arkiv-Network/arkiv-sdk-js#installation):

```bash
npm install @arkiv-network/sdk viem
# or: pnpm install @arkiv-network/sdk viem | bun add @arkiv-network/sdk viem | yarn add @arkiv-network/sdk viem
```

- viem is a **required** peer dependency ("`viem` is a peer dependency: install it alongside the SDK" — README). The repo devDependency pins `viem ^2.38.2`; `package.json` `engines.node >=18.0.0`, but README prerequisites say "Node.js 22.10.0 or newer, or bun" (README `### Prerequisites`).
- Package is ESM-first with CJS build; `"type": "module"`. README recommends `"type": "module"` in your project.
- Subpath exports (https://github.com/Arkiv-Network/arkiv-sdk-js/blob/main/package.json `exports`):
  - `@arkiv-network/sdk` — clients, `ExpirationTime`, errors, entity constants, types
  - `@arkiv-network/sdk/schema` — `defineSchema`, column/value constructors (`str`, `i32`, `u64`, `u256`, `dec`, `bool`, `addr`, `key`, `bytes`), limits
  - `@arkiv-network/sdk/chains` — `rabdi`, `localhost`
  - `@arkiv-network/sdk/query` — `and`, `or`, `eq`, `gt`, `gte`, `lt`, `lte`, `between`, `startsWith`, `exists`, `hasType`, `asc`, `desc`, `render`, query errors
  - `@arkiv-network/sdk/entity` — `MAX_LIFETIME`, `NO_SALT`, `randomSalt`, `predictEntityKey`, `ENTITY_EVENTS_ABI`
  - `@arkiv-network/sdk/types`, `@arkiv-network/sdk/utils`
- Debug logging: `DEBUG=arkiv:*` (README `## Debugging`).

---

## 2. Creating a client

### 2.1 Network facts (confirmed)

| Fact | Value | Source |
|---|---|---|
| Current public testnet | **Rabdi** ("Rabdi DB-Chain") | https://hub.arkiv.network/networks |
| Chain ID | **7794095** (`0x76edaf`) | https://docs.arkiv.network/networks/rabdi/ ; `src/chains/rabdi.ts` `id: 7794095` |
| HTTP RPC | `https://rpc.rabdi.db-chain.testnet.arkiv.network` | https://docs.arkiv.network/networks/rabdi/ |
| WS RPC | `wss://rpc.rabdi.db-chain.testnet.arkiv.network` | same |
| Native token | `tGLM` (name "Golem", 18 decimals) | `src/chains/rabdi.ts` ; https://docs.arkiv.network/networks/rabdi/ |
| Block time | 2 seconds (`BLOCK_TIME = 2` in `src/consts.ts`) | https://docs.arkiv.network/start-here/introduction/ |
| Explorer | `https://rabdi.explorer.arkiv.network` | https://docs.arkiv.network/networks/rabdi/ |
| Faucet | `https://hub.arkiv.network/faucet` — "Claim testnet tokens ... One claim per wallet, per cooldown window." (amount and window not shown without wallet connect) | https://hub.arkiv.network/faucet |
| Access keys | `https://hub.arkiv.network/access-keys` | https://docs.arkiv.network/start-here/access-keys/ |
| Arkiv "contract" (operation target) | `0x4400000000000000000000000000000000000044`, same on every Arkiv chain; function `execute((uint8 operation, bytes operationData)[] ops)` selector `0x49650044` | https://docs.arkiv.network/json-rpc/mutating-entities/ ; `src/consts.ts` `ARKIV_ADDRESS` |

So the spec's RPC URL and chain id are **correct**.

### 2.2 Access key — needed? how passed?

From https://docs.arkiv.network/start-here/access-keys/ :
- "The public RPC is heavily rate limited to prevent abuse." A key is free, "tied to your wallet and one network", "one key per wallet per network", with "a monthly quota measured in cost units".
- Steps: open hub.arkiv.network/access-keys → connect wallet and sign the sign-in message (no tx) → complete registration if asked → select network Rabdi → name project, captcha, Generate → copy key.
- Accepted forms: **URL path** `https://rpc.rabdi.db-chain.testnet.arkiv.network/<key>`; header `X-API-KEY: <key>`; `Authorization: Bearer <key>`. WebSocket: path or `X-API-KEY`.
- Unknown key → every call fails HTTP 401. Omitting `accessKey` from `rabdi()` is a type error and throws `MissingAccessKeyError`. `accessKey: ""` uses the public endpoint and `console.warn`s once.
- Quota per the skills repo (https://github.com/Arkiv-Network/skills/blob/main/skills/arkiv/references/limits.md): "100,000,000 per key; each arkiv_query costs 10; other calls zero under current provider policy". Keyless access "can return HTTP 429".
- Security: "anyone holding the key can spend your quota" — restrict with **Origins** allowlist (browser) or **IP allowlist** (server). Don't add a chain with your key to a user's wallet.

The SDK puts the key in the URL path (`src/chains/rabdi.ts`):

```ts
const path = options.accessKey === "" ? "" : `/${encodeURIComponent(options.accessKey)}`
// http: [`https://rpc.rabdi.db-chain.testnet.arkiv.network${path}`], webSocket: [`wss://...${path}`]
```

### 2.3 Other testnet names

https://docs.arkiv.network/networks/older-networks/ ("Arkiv testnets that have been replaced"):

| Network | Chain ID | RPC | Status |
|---|---|---|---|
| Tiramisu | 7738577 (`0x7614d1`) | `https://rpc.tiramisu.db-chain.testnet.arkiv.network` | Replaced by Rabdi |
| Braga | 60138453102 | `https://braga.hoodi.arkiv.network/rpc` | Retired 12 Aug 2026 |
| Kaolin | 60138453025 | `https://kaolin.hoodi.arkiv.network/rpc` | Retired 15 May 2026 |

"Mendoza" does not appear anywhere in the docs, hub, SDK or skills. "Cheesecake" existed briefly (0.8.0 CHANGELOG) and was removed. SDK 1.0.1 ships only `rabdi` and `localhost` (`src/chains/index.ts`); the docs' API reference still lists a `tiramisu` chain page but the published package does not export it.

### 2.4 Client code (exact)

Wallet is a **viem account** (`privateKeyToAccount` from `viem/accounts`). Source: https://docs.arkiv.network/start-here/clients/ and `sample/write_example.ts` (https://github.com/Arkiv-Network/arkiv-sdk-js/blob/main/sample/write_example.ts):

```ts
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { http, isHex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// Rabdi is the Arkiv testnet. Without an access key, it uses the rate-limited public endpoint.
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) throw new Error("Set PRIVATE_KEY ...")
const account = privateKeyToAccount(privateKey)

const publicClient = createPublicClient({ chain, transport: http() })          // reads, events
const walletClient = createWalletClient({ chain, transport: http(), account }) // writes
```

- `http()` with no URL uses the chain's (keyed) RPC URL. `webSocket()` from viem works the same way (`rabdi()` doc comment).
- Both are viem clients extended with Arkiv actions. `createPublicClient` = viem `createClient().extend(publicActions).extend(publicArkivActions)`; `createWalletClient` = `.extend(publicActions).extend(walletActions).extend(walletArkivActions)` (`src/clients/createPublicClient.ts`, `src/clients/createWalletClient.ts`).
- The wallet client does **not** have `getEntity`/`select`/`query`/`watchEntityEvents`; the public client does not have the write methods (`src/clients/createWalletClient.test.ts`, `createPublicClient.test.ts`). Keep both.
- Browser wallet (docs clients page): `createWalletClient({ chain, transport: custom(window.ethereum), account: address })`; with wagmi: `createWalletClient({ chain, account: wagmiWalletClient.account, transport: custom(wagmiWalletClient.transport) })` (https://docs.arkiv.network/guides/react/). Add Rabdi to a wallet with `walletClient.addChain({ chain: rabdi({ accessKey: "" }) })` — **without** your key.
- Rabdi write recommendation from the skills repo (https://github.com/Arkiv-Network/skills/blob/main/skills/arkiv/SKILL.md): "Rabdi's recommended default is explicit latest nonce, gas and network gasPrice" — passed via the trailing `txParams` argument (§3.6). The SDK's own default (estimate + 25% headroom, capped at 2^24) passed their small-entity smoke test, so this is belt-and-braces, not mandatory.

---

## 3. Creating an entity

### 3.1 Define a schema (replaces "annotations")

https://docs.arkiv.network/schemas/define/ and `src/schema/schema.ts`:

```ts
import { addr, bytes, dec, defineSchema, str, u64 } from "@arkiv-network/sdk/schema"

export function defineSchema<const C extends Columns>(name: string, columns: C): Schema<C>
export function defineSchema<const C extends Columns>(columns: C): Schema<C>   // unnamed
```

- A **named** schema "tags every entity it creates with an indexed `arkiv.schema` attribute holding the name, and `.from()` filters on it" (CHANGELOG 1.0.0). Use a namespaced name, e.g. `"trenches.position"`, because "other projects may define a schema with the same name" (docs schemas/define). The tag counts as one attribute (31 user columns max for a named schema). It is **not** a security boundary: "anyone can write an entity with your tag" — filter by `$creator`/`$owner` for trust.
- Column constructors called with **no args** make a column; with a value they make a typed value (`dec()` column vs `dec("4.5")` value).
- Modifiers (chainable, each returns a new column; `src/schema/column.ts`): `.indexed()` — filterable in `where` (bytes cannot be indexed); `.optional()` — may be omitted on create, unset on patch, reads back `undefined`; `.default(value)` — SDK writes it when a create leaves it out (not applied on patch).
- Column types (https://docs.arkiv.network/schemas/column-types/ ; `src/schema/types.ts`):

| tag | holds | JS value on read (`.value`) | plain-value shortcut on write |
|---|---|---|---|
| `bool` | boolean | `boolean` | bare boolean |
| `i32` | signed 32-bit | `number` | **bare `number` is i32** |
| `u64` | unsigned 64-bit | `bigint` | must wrap: `u64(…)` (accepts bigint/number/string) |
| `u256` | unsigned 256-bit | `bigint` | **bare `bigint` is u256** |
| `dec` | signed fixed-point, 18 dp | `string` e.g. `"4.5"` | must wrap: `dec("4.5")` (pass fractions as strings) |
| `str` | UTF-8 ≤128 bytes | `string` | bare string |
| `addr` | 20-byte address | checksummed `0x…` | `addr("0x…")` (mixed case must be valid EIP-55) |
| `key` | another entity's key | `0x…` 32 bytes | `key("0x…")` (dangling refs allowed) |
| `bytes` | blob ≤128 KiB, never indexed | lowercase hex `0x…` | bare `Uint8Array` or hex; decode with viem `hexToString` |

- Attribute names: start with a letter; then letters, digits, `.`, `-`, `_`; ≤32 bytes; case-sensitive; no `$` prefix; no `--`; reserved query-language words (`and`, `or`, `between`, `order`, `by`, `asc`, `desc`, type names…) are not allowed (docs schemas/define; `src/schema/names.ts`). Schema names: "any text up to 128 bytes".

### 3.2 `createEntity` — signature and parameters

`src/clients/decorators/arkivWallet.ts` (https://github.com/Arkiv-Network/arkiv-sdk-js/blob/main/src/clients/decorators/arkivWallet.ts):

```ts
createEntity: <S extends Schema>(
  schema: S,
  values: CreateEntityValues<S>,   // keyed by column; required columns must be given
  options: CreateEntityOptions,    // { expiration: Expiry; flags?: CreationFlags; salt?: SaltInput }
  txParams?: TxParams,             // { gas?, nonce?, gasPrice? } | { gas?, nonce?, maxFeePerGas?, maxPriorityFeePerGas? }
) => Promise<CreateEntityReturnType>

export type CreateEntityReturnType = {
  entityKey: Hex      // 32-byte key
  txHash: Hash
  expiresAt: bigint   // block number, read from the EntityCreated event
}
```

`CreateEntityOptions` (`src/actions/wallet/createEntity.ts`):
- `expiration: Expiry` — **required**, built with `ExpirationTime` (§3.3).
- `flags?: { readonly?: boolean; permissionlessExtension?: boolean }` — both default `false`, immutable for the entity's life. `readonly` → attributes can never be patched; `permissionlessExtension` → anyone may extend expiry.
- `salt?: bigint | NO_SALT` — defaults to 128 random bits. `NO_SALT` (from `@arkiv-network/sdk/entity`) makes the key derivable from owner + nonce.

Behaviour: "createEntity resolves once the transaction is in a block" (sample) — it calls `waitForTransactionReceipt` internally and throws `EntityMutationError` on revert (`src/utils/arkivTransactions.ts`). Pre-send throws: `InvalidExpiryError`, `SchemaMismatchError`, `InvalidValueError`, `EntityTooLargeError` (docs writing/create).

Exact example (docs https://docs.arkiv.network/writing/create/ + `sample/write_example.ts`):

```ts
import { hexToString, stringToBytes } from "viem"

const Posts = defineSchema("posts", {
  author: addr().indexed(),
  category: str().indexed(),
  score: dec().indexed(),
  title: str(),                 // stored, not indexed
  body: bytes(),                // a blob; bytes can never be indexed
  thumbnail: bytes().optional(),
  mimeType: str().default("text/markdown"),
})

const { entityKey, txHash, expiresAt } = await walletClient.createEntity(
  Posts,
  {
    author: addr(account.address),
    category: "docs",
    score: dec("4.5"),
    title: "Hello from Arkiv",
    body: stringToBytes("# Hello\n\nArkiv chain wishes you all the best!"),
  },
  { expiration: ExpirationTime.fromDays(1) },
)
```

### 3.3 Expiration (replaces BTL) — units and "30 days"

https://docs.arkiv.network/writing/expiration/ and `src/utils/expirationTime.ts`:

```ts
import { ExpirationTime } from "@arkiv-network/sdk"
ExpirationTime.fromSeconds(n)   // must be a whole number of 2-second blocks, else InvalidExpiryError
ExpirationTime.fromMinutes(n) | fromHours(n) | fromDays(n) | fromWeeks(n)
ExpirationTime.fromMonths(n)    // exactly 30 days each
ExpirationTime.fromYears(n)     // 365 days each — exceeds MAX_LIFETIME, throws before send
ExpirationTime.fromBlocks(n)    // exact, chain's own unit
ExpirationTime.max()            // MAX_LIFETIME blocks (1.0.1+)
ExpirationTime.atBlock(block: bigint, { atLeast?: Lifetime })
ExpirationTime.atDate(date: Date, { atLeast?: Lifetime })   // rounds UP to next block
```

- Unit on the wire: **blocks**. `Expiry = { minLifetime: bigint; expiresAt: bigint | Date }`; `from*` fill `minLifetime`, `at*` fill `expiresAt`; "the engine takes whichever comes later".
- Conversion: `toBlocks(seconds) = seconds / BLOCK_TIME` with `BLOCK_TIME = 2` (`src/entity/expiry.ts`, `src/consts.ts`). **30 days = 30 × 86,400 / 2 = 1,296,000 blocks**; 1 day = 43,200 blocks. "day-based lifetimes are approximate if real block times drift" — the returned `expiresAt` is the exact block.
- Max lifetime: `MAX_LIFETIME = 7_884_000n` blocks ≈ 182.5 days, counted from the block the create/extension lands in (`src/consts.ts`; https://docs.arkiv.network/reference/limits/). No "permanent" option: `ExpirationTime.permanent()` was removed in 1.0.0.
- Cost: docs say only "a shorter lifetime costs less, so start short and extend as needed" (writing/expiration).
- After the expiry block, "queries stop returning it and operations on it fail" (start-here/introduction). Expired entities cannot be revived.

### 3.4 Many entities in one call — `executeBatch`

There is no `createEntities`. https://docs.arkiv.network/writing/batches/ and `src/actions/wallet/executeBatch.ts`:

```ts
executeBatch: (data: ExecuteBatchParameters, txParams?: TxParams) => Promise<ExecuteBatchReturnType>

type ExecuteBatchParameters = {
  creates?:          CreateEntityParameters[]     // { schema, values, expiration, flags?, salt? }
  patches?:          PatchEntityParameters[]      // { schema, entityKey, set?, unset? }
  deletes?:          { entityKey }[]
  extensions?:       { entityKey, expiration }[]
  ownershipChanges?: { entityKey, newOwner }[]
}
type ExecuteBatchReturnType = {
  txHash: Hash
  createdEntities: Hex[]       // keys in batch order
  patchedEntities: Hex[]; deletedEntities: Hex[]; extendedEntities: Hex[]; ownershipChanges: Hex[]
}
```

- "Either every operation applies or none does." At least one op required (throws otherwise). Each create/patch names its own schema, so one batch can mix schemas.
- The batch result does **not** return per-create `expiresAt` (only `createEntity`/`extendEntity` do).
- Internal order applied: creates, patches, deletes, extensions, then ownership changes (skills `arkiv-write-safety`).
- No documented max ops per batch ("there is no verified universal 1,000-operation cap" — skills). Per-tx gas cap is EIP-7825 `2^24` (`MAX_TRANSACTION_GAS`, `src/consts.ts`). Each operation ≤32 attributes (json-rpc/mutating-entities).
- To reference a sibling created in the same batch: `publicClient.predictEntityKeys({ owner, count })` → `[{ key, salt }]`, pass each `salt` to its create (`src/clients/decorators/arkivPublic.ts`).

Example (`arkivWallet.ts` doc comment):

```ts
const { txHash, createdEntities } = await client.executeBatch({
  creates: [{ schema: Posts, values: { author, category: "docs", score: dec("4.1"), title: "Hi", body: new Uint8Array() }, expiration: ExpirationTime.fromDays(30) }],
  patches: [{ schema: Posts, entityKey: keyToRevise, set: { category: "archive" } }],
  deletes: [{ entityKey: staleKey }],
  extensions: [{ entityKey: keyToKeepAlive, expiration: ExpirationTime.atBlock(1_200_000n) }],
  ownershipChanges: [{ entityKey: keyToHandOver, newOwner }],
})
```

### 3.5 How writes hit the chain

Every write is an `eth_sendRawTransaction` of `execute(ops)` to `0x4400000000000000000000000000000000000044` with value 0 (https://docs.arkiv.network/json-rpc/mutating-entities/). Operation ABI: `create(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, Attribute[] attributes)`, `patch(bytes32 entityKey, Attribute[] mutations)`, `extend(bytes32, uint64 expiresAt, uint64 minLifetime)`, `transfer ownership(bytes32, address newOwner)`, `delete(bytes32)`. Events emitted: `EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)`, `EntityPatched`, `ExpiryExtended`, `OwnershipTransferred`, `EntityDeleted` (`src/entity/events.ts`).

### 3.6 `TxParams` (`src/types/txParams.ts`)

```ts
type TxParams =
  | { gas?: bigint; nonce?: number; gasPrice?: bigint }                                   // legacy
  | { gas?: bigint; nonce?: number; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint } // EIP-1559
```
"Anything left out is estimated." Default gas = estimate + 25% (`GAS_HEADROOM_PERCENT = 25n`), capped at `2^24`; a caller-supplied `gas` is used as-is (CHANGELOG 1.0.1).

---

## 4. Querying

### 4.1 Builder (recommended)

`publicClient.select(selection).from(schema, { onMismatch? }).where(...).ownedBy(addr).createdBy(addr).orderBy(key).limit(n).offset(m).withCount().fetch()` — `src/query/queryBuilder.ts`, `src/query/builderBase.ts`; docs https://docs.arkiv.network/querying/select/ , `/querying/filter/`, `/querying/sort/`, `/querying/paginate/`, `/querying/count/`.

```ts
import { and, or, eq, gt, gte, lt, lte, between, startsWith, exists, hasType, asc, desc } from "@arkiv-network/sdk/query"
import { dec, u64, key, addr } from "@arkiv-network/sdk/schema"

const result = await publicClient
  .select({ $key: true, $owner: true, title: true, score: true, body: true })
  .from(Posts)                                               // typed + tag-filtered
  .where(and(eq("category", "docs"), gt("score", dec("4.0"))))
  .ownedBy(account.address)
  .orderBy(desc("score"))
  .limit(10)
  .offset(0)
  .fetch()

for (const row of result.entities) {
  row.$key           // Hex
  row.$owner         // checksummed Hex
  row.title.value    // string
  row.score.value    // "4.5" (string)
  hexToString(row.body.value)  // bytes come back as hex
}
```

**`select(...)` argument** (`src/clients/decorators/arkivPublic.ts`):
- `select()` or `select("*")` → every entity field and every column (through a schema) / `$attributes` map (without one). Never includes `$attributeSchema`.
- `select({ field: true, ... })` → exactly those; at least one field. System fields start with `$`; any other name is an attribute/column. Pass it inline or `as const` (a stored object widens to `boolean` → `PartialRow` with all fields optional).
- System fields and types (`src/query/selection.ts` `SYSTEM_FIELDS`; docs querying/select):

| Field | Type |
|---|---|
| `$key` | `Hex` |
| `$owner` | `Hex` (checksummed) |
| `$creator` | `Hex` (checksummed) |
| `$createdAt` | `bigint` block |
| `$updatedAt` | `bigint` block |
| `$expiresAt` | `bigint` block |
| `$creationFlags` | `{ readonly: boolean; permissionlessExtension: boolean; raw: number }` |
| `$attributes` | `Readonly<Record<string, ArkivValue>>` — only `true` accepted |
| `$attributeSchema` | `Readonly<Record<string, { type: TypeTag; indexed: boolean | undefined }>>` |

**`from(schema, options?)`** — `FromOptions = { onMismatch?: "skip" | "throw" }` (default `"skip"`). A matching entity that doesn't fit the schema is left out (counted in `skipped`) or fails the fetch with `SchemaMismatchError`. A named schema needs no `where` at all (`select().from(Posts)` matches every post); an unnamed schema or no schema needs at least one filter — "A query needs at least one filter — the language has no spelling for 'match every entity'" (`builderBase.ts`).

**`where(...exprs)`** — all must hold; repeated calls AND together. Through a schema, only `.indexed()` columns and `$key`, `$owner`, `$creator`, `$expiresAt` can be filtered; anything else is a compile error and runtime `InvalidPredicateError`.

**Operators** (`src/query/expression.ts`; docs querying/filter):

| Function | Query text | Notes |
|---|---|---|
| `eq(name, value)` | `name = str('x')` | string equality is `eq("status", "open")` (bare string → `str`) |
| `gt / gte / lt / lte(name, value)` | `>`, `>=`, `<`, `<=` | any indexable type; numeric for i32/u64/u256/dec, bytewise for str/addr/key, `false < true` |
| `between(name, low, high)` | `name BETWEEN a AND b` | inclusive, both bounds same type |
| `startsWith(name, prefix)` | `name STARTSWITH str('ab')` | `str` only |
| `exists(name)` | `EXISTS(name)` | not for system fields |
| `hasType(name, "i32")` | `TYPEOF(name) = i32` | |
| `and(...exprs)` / `and([exprs])` | `A AND B` | varargs or array |
| `or(...exprs)` / `or([exprs])` | `A OR B` | `AND` binds tighter than `OR`; parentheses rendered automatically |

Value typing in predicates: bare `number` → `i32`, bare `bigint` → `u256`, bare `string` → `str`, bare `boolean` → `bool`; anything else must be wrapped (`dec("4")`, `u64(1n)`, `addr("0x…")`, `key("0x…")`). Through a schema, `eq("score", 5)` is rejected for a `dec` column — use `dec(5)`.

**NOT SUPPORTED:** `ne`, `not`, `!=`, `IN`, `like`. CHANGELOG 1.0.0: "**Breaking:** `not()`, `ne()` and the `NotNode` type, along with `!=` ... The network does not support `NOT` or `!=`. Filter on what you want rather than what you do not: an indexed value marking the state, or an `or()` of the values to keep". So **`status IN (a, b)` must be written as**:

```ts
.where(or(eq("status", "open"), eq("status", "filled")))
```

**`ownedBy(address)` / `createdBy(address)`** — shorthand for `where(eq("$owner", addr(x)))` / `eq("$creator", …)`; calling again replaces the previous scope. For "owner A or owner B" use an explicit `or(eq("$owner", addr(a)), eq("$owner", addr(b)))`.

**`orderBy(asc(name) | desc(name))`** — exactly **one** key (a second is a compile error / `InvalidPredicateError`; calling again replaces). Sortable: any non-bytes column (indexed or not) and `$key`, `$owner`, `$creator`, `$expiresAt`. **`$createdAt` and `$updatedAt` cannot be sorted** — sort in JS. Without a schema, give the type: `desc("score", "dec")`. Default order without `orderBy`: "matches come oldest first" (docs querying/sort). Entities missing the attribute sort first in `asc`, last in `desc`.

**`limit(n)`** — 1..100 (`MAX_LIMIT = 100`); without it "the node picks the page size" (max 100). **`offset(m)`** — non-negative integer; page `n` of size `s` = `.limit(s).offset(n*s)`. No cursors (removed in 1.0.0). Offsets shift under concurrent writes; stable pattern is `.orderBy(asc("$key"))`. Keyset pagination (README, docs querying/paginate):

```ts
let last: Hex | undefined
for (;;) {
  const b = publicClient.select({ $key: true, title: true }).from(Posts, { onMismatch: "throw" }).orderBy(asc("$key")).limit(100)
  if (last) b.where(gt("$key", key(last)))
  const page = await b.fetch()
  // ...use page.entities
  if (page.entities.length < 100) break
  last = page.entities.at(-1)!.$key
}
```

**`withCount()`** — adds total match count to the page as `count: bigint`. **`publicClient.count().from(Posts).where(...).ownedBy(...).fetch()`** → `bigint` (counts include schema-mismatching entities).

**`fetch()` result** — `QueryResult` (`src/query/queryResult.ts`):

```ts
class QueryResult<TEntity, TCount extends bigint | undefined> {
  readonly entities: readonly TEntity[]   // flat rows
  readonly blockNumber: bigint            // block the page was read at
  readonly skipped: number                // entities on this page dropped for schema mismatch
  readonly count: TCount                  // bigint only with withCount()
}
```

`builder.toString()` returns the exact query string sent (for debugging).

### 4.2 Single entity — `getEntity`

```ts
getEntity: { (key: Hex): Promise<FullEntity>; <S extends Schema>(key: Hex, schema: S): Promise<FullRow<S>> }
```
(`src/clients/decorators/arkivPublic.ts`; docs https://docs.arkiv.network/querying/get-entity/). With a schema: every `$` field plus every column typed (`post.$owner`, `post.$expiresAt`, `post.title.value`, `post.summary?.value`). Without: every `$` field plus `$attributes` (`entity.$attributes.title` → `ArkivValue | undefined`; check `.type` before `.value`). Throws `NoEntityFoundError` if "no live entity has the key" (never existed, deleted, or expired); `SchemaMismatchError` if it doesn't fit. Uses JSON-RPC `arkiv_getEntity`.

### 4.3 Raw query — `query(expr | string, options?)`

```ts
query: (query: Expression | string, queryOptions?: { select?, orderBy?, limit?, offset?, count? })
  => Promise<{ entities: Row[]; blockNumber: bigint; count: bigint | undefined }>
```
A raw string "goes to the node exactly as written, with none of the name, type or operator checks". Raw language (https://docs.arkiv.network/reference/query-language/): `category = str('news') AND score > dec(4) AND EXISTS(summary)`; `(category = str('news') OR category = str('blog')) AND score >= dec(3)`; `... ORDER BY score:dec DESC`. Literals carry their type (`i32(4)`, `u64(…)`, `dec(3.5)`, `str('x')`, `addr(0x…)`, `key(0x…)`); booleans bare; single quotes in str escaped by doubling; keywords case-insensitive; `--` line comment. Node error `QueryError.kind ∈ parse | type | literal | limits` (JSON-RPC codes -32001..-32004).

JSON-RPC underneath: `arkiv_query(queryString, { select: {key,owner,creator,createdAt,updatedAt,expiresAt,creationFlags,attributes,attributeSchema,count}, limit: hex, offset: hex })` → `{ data: [...], blockNumber: hex, count?: hex }`; `arkiv_getEntity(key)` → entity or `null`; `arkiv_getBlockTiming()` → `{ current_block, current_block_time, duration }` (https://docs.arkiv.network/json-rpc/querying-data/ ; `src/types/rpcSchema.ts`). The SDK exposes `publicClient.getBlockTiming()` → `{ currentBlock: bigint; currentBlockTime: number; blockDuration: number }`.

Important: **queries read the chain head only.** No historical/`atBlock` reads (removed in 1.0.0), no cursors.

---

## 5. Updating, extending, deleting

### 5.1 Update in place — **YES, supported, via `patchEntity`**

There is no `updateEntity`/`updateEntities`. `patchEntity` changes named columns on the **same key** — key, owner, creation flags and expiry are untouched (`src/actions/wallet/patchEntity.ts`: "The entity's identity is fixed: a patch never moves the key, the owner, the creation flags or the expiry"). Docs: https://docs.arkiv.network/writing/change/

```ts
patchEntity: <S extends Schema>(
  schema: S,
  entityKey: Hex,
  changes: { set?: Partial<values>; unset?: readonly OptionalColumnName<S>[] },
  txParams?: TxParams,
) => Promise<{ entityKey: Hex; txHash: Hash }>

await walletClient.patchEntity(Posts, entityKey, { set: { score: dec("4.7"), summary: "Updated" } })
await walletClient.patchEntity(Posts, entityKey, { unset: ["summary"] })
```

- Columns not named keep their values; defaults are **not** applied on patch. `unset` only for `.optional()` columns. Throws `EmptyPatchError` (nothing to apply), `ConflictingMutationError` (same column in `set` and `unset`), `SchemaMismatchError`, `EntityTooLargeError`.
- Writing a column whose `.indexed()` flag changed in the schema re-indexes it on the entity (CHANGELOG).
- Entities created with `flags.readonly` cannot be patched by anyone.
- For a full replacement: delete and recreate (new key) — 0.8.0 CHANGELOG.
- `$updatedAt` moves to the patch block.

### 5.2 Extend expiry — `extendEntity`

```ts
extendEntity: (data: { entityKey: Hex; expiration: Expiry }, txParams?: TxParams)
  => Promise<{ entityKey: Hex; txHash: Hash; expiresAt: bigint }>

await walletClient.extendEntity({ entityKey, expiration: ExpirationTime.fromDays(30) })
```
"An extension **sets a new expiry**; it does not add to the existing one ... a duration counts from now, not from the entity's current expiry" (`src/actions/wallet/extendEntity.ts`). An earlier target is rejected (engine revert → `EntityMutationError`); an equal one changes nothing. `ExpirationTime.max()` resets to the full 7,884,000-block lifetime. Only the owner may extend unless `permissionlessExtension` was set at creation.

### 5.3 Delete — `deleteEntity`

```ts
deleteEntity: (data: { entityKey: Hex }, txParams?: TxParams) => Promise<{ entityKey: Hex; txHash: Hash }>
await walletClient.deleteEntity({ entityKey })
```
"Once the transaction is in a block, the entity is gone, as if it had expired" (docs writing/change). Owner only.

### 5.4 Transfer — `changeOwnership`

```ts
changeOwnership: (data: { entityKey: Hex; newOwner: Hex }, txParams?: TxParams) => Promise<{ entityKey: Hex; txHash: Hash }>
```
"After the transfer, only the new owner can change the entity. The `$creator` remains the original creating account." Transfer needs no recipient consent; cannot target zero address or current owner (json-rpc/mutating-entities).

---

## 6. Ownership

- **Owner = the account that signed the create** ("The account that creates an entity owns it" — https://docs.arkiv.network/start-here/introduction/). `$creator` is the same account at creation and never changes; `$owner` changes on `changeOwnership`.
- "Only the owner can update, extend, transfer, or delete it" (introduction). Permission matrix (skills `arkiv-entity-lifecycle`, https://github.com/Arkiv-Network/skills/blob/main/skills/arkiv-entity-lifecycle/SKILL.md):

| readonly | permissionlessExtension | Patch | Extend | Transfer | Delete |
|---|---|---|---|---|---|
| false | false | Owner | Owner | Owner | Owner |
| false | true | Owner | Anyone | Owner | Owner |
| true | false | Nobody | Owner | Owner | Owner |
| true | true | Nobody | Anyone | Owner | Owner |

- A different wallet attempting to patch/delete/extend/transfer an entity it doesn't own: "The node rejects operations from non-owners" (docs writing/change) → the tx reverts → SDK throws `EntityMutationError` ("A transaction failed or reverted, such as when the account isn't the owner or lacks funds" — https://docs.arkiv.network/reference/errors/).
- Query by owner: `.ownedBy(address)` or `where(eq("$owner", addr(address)))`; by creator: `.createdBy(address)` / `eq("$creator", addr(...))`. Both `$owner` and `$creator` are filterable and sortable system fields.
- For a backend with one server signer: every entity is owned by the server wallet; app-level user identity must be a column (e.g. `user: addr().indexed()`), and ownership gives you exclusive update rights. The skills repo warns: "A shared signer authenticates the service's publication, not each user's authorship" (`arkiv-security-trust`).

---

## 7. Explorer URL patterns

Base: `https://rabdi.explorer.arkiv.network` (https://docs.arkiv.network/networks/rabdi/ ; `src/chains/rabdi.ts` `blockExplorers.default.url`). It is Arkiv's own SPA ("Arkiv BlockExplorer", Vite build, `window.__ARKIV_CONFIG__ = {"VITE_NETWORK_NAME":"Rabdi","VITE_TOKEN_SYMBOL":"tGLM"}`), **not** Blockscout/Etherscan, and the docs do not publish URL patterns. The patterns below were read from the explorer's client-side route table in its JS bundle (`/assets/index-CbkB2eFO.js`, fetched 2026-11-05): route map `{ transaction: "/tx", entity: "/entity", address: "/address", block: "/block", blocks: "/blocks", transactions: "/transactions", "entity-explorer": "/entity-explorer", search: "/search" }`, a `^\/tx\/(.+)$` matcher, `startsWith("/entity/")`, and a link template `` `/address/${…}` ``.

| Object | URL (best evidence) | Confidence |
|---|---|---|
| Transaction | `https://rabdi.explorer.arkiv.network/tx/<txHash>` | High (regex `^/tx/(.+)$` in bundle) |
| Address | `https://rabdi.explorer.arkiv.network/address/<0xaddress>` | High (template literal in bundle) |
| Entity | `https://rabdi.explorer.arkiv.network/entity/<0xentityKey>` | Medium (route prefix `/entity/` in bundle; param format inferred) |
| Block | `https://rabdi.explorer.arkiv.network/block/<number>` | Medium |
| Entity browser | `https://rabdi.explorer.arkiv.network/entity-explorer` (alias `/data`) | Medium |

All paths return HTTP 200 (SPA), so a wrong path still "loads". **Verify one real entity link in the browser before shipping** (see §11).

---

## 8. Limits, cost, rate limits

From https://docs.arkiv.network/reference/limits/ (constants exported from `@arkiv-network/sdk/schema` / `@arkiv-network/sdk/entity` / root):

| Limit | Value | Constant |
|---|---|---|
| Attributes per entity / columns per schema | 32 (31 for a named schema — the tag counts) | `MAX_ATTRIBUTES` |
| Attribute name length | 32 bytes | `MAX_NAME_BYTES` |
| `str` value | 128 bytes UTF-8 | `MAX_STRING_BYTES` |
| `bytes` value | 128 KiB each | `MAX_BYTES_LENGTH` |
| Total `bytes` across one create or patch | 128 KiB ("provisional") | `MAX_ENTITY_BYTES` |
| Lifetime | 7,884,000 blocks ≈ 182.5 days from landing block | `MAX_LIFETIME` |
| Key salt | 128 bits | `MAX_SALT` |
| `i32` | −2^31 .. 2^31−1 | `I32_MIN`, `I32_MAX` |
| `u64` / `u256` | 0 .. 2^64−1 / 2^256−1 | `U64_MAX`, `U256_MAX` |
| `dec` | 18 decimal places, signed 256-bit when scaled | `DECIMAL_SCALE` |
| Rows per query page | 100 | `MAX_LIMIT` |
| Query length / nesting depth | node-enforced, numbers not published → `QueryError` kind `"limits"` | — |
| Gas per transaction | 2^24 (EIP-7825 cap enforced by node) | `MAX_TRANSACTION_GAS` |

Gas / cost per write: **not documented** by Arkiv (docs only say shorter lifetime costs less; "indexes add write cost" — schemas/define). Dated Rabdi measurements from the skills repo (https://github.com/Arkiv-Network/skills/blob/main/skills/arkiv-troubleshooting/SKILL.md): "Measured small creates used approximately 190k gas for one, 1.50M for ten in a batch and 2.97M for twenty." Their recommended explicit cap: `gas = max(1,000,000 + 400,000 × (ops − 1), 2 × estimate)`, `gasPrice` from `eth_gasPrice`, explicit latest nonce. The gas price in wei and therefore tGLM per write is **unknown** — measure with `publicClient.estimateGas`/`getGasPrice` at the venue.

RPC rate limits: keyless public endpoint is "heavily rate limited" (HTTP 429); with a key: 100,000,000 quota units/key/month, `arkiv_query` = 10 units, other calls = 0 (skills `limits.md`, citing hub access-keys page). Numbers for the keyless limit are not published.

Also note (skills `known-issues.md`, verified 2026-11-02/03 on Rabdi): `eth_getLogs` fails (`-32603 ... NotImplemented`) for blocks with logs ~1,000 blocks (~30 min) behind head; `eth_newFilter` and `eth_getBlockReceipts` return -32601; "arkiv serves state at the chain head only" for safe/finalized/old-block state reads.

---

## 9. Event subscriptions — `watchEntityEvents`

https://docs.arkiv.network/querying/watch-events/ ; `src/actions/public/watchEntityEvents.ts` ; `sample/events_example.ts`:

```ts
watchEntityEvents: (parameters: WatchEntityEventsParameters) => () => void   // returns unwatch

type WatchEntityEventsParameters = {
  onEntityCreated?: (e: EntityCreatedEvent) => void          // + owner, expiresAt, creationFlags
  onEntityPatched?: (e: EntityPatchedEvent) => void          // + owner  (says THAT it changed, not what to)
  onExpiryExtended?: (e: ExpiryExtendedEvent) => void        // + owner, expiresAt
  onOwnershipTransferred?: (e: OwnershipTransferredEvent) => void // + previousOwner, newOwner
  onEntityDeleted?: (e: EntityDeletedEvent) => void          // + owner
  onEvent?: (e: EntityEvent) => void                         // all, in application order; runs before per-kind handler
  onError?: (error: Error) => void                           // default console.error
  pollingInterval?: number                                   // ms; default half a block (1000 ms)
}
// every event: { type, entityKey, blockNumber, transactionHash, logIndex }
```

- Works over plain `http()` — the SDK **polls** (no WebSocket required). Starts at head on its first poll; nothing historical (`fromBlock` removed in 1.0.0).
- **There is no expiry event**: "an entity reaching its expiry block is not an operation, so it emits no log" — query `lt("$expiresAt", u64(head + N))` instead.
- Known issue: if the watcher falls >~1,000 blocks behind, every poll fails and it does not recover; stop, recreate at head, reconcile with a query (skills `known-issues.md`, https://github.com/Arkiv-Network/arkiv/issues/283).
- Viem's `watchEvent` and `getLogs` are also exposed on the public client; ABI in `ENTITY_EVENTS_ABI` from `@arkiv-network/sdk/entity`, emitting address `0x4400000000000000000000000000000000000044`.

---

## 10. Error classes (for the wrapper's catch blocks)

https://docs.arkiv.network/reference/errors/ ; `src/errors.ts`, `src/schema/errors.ts`, `src/entity/errors.ts`, `src/query/errors.ts`.

From `@arkiv-network/sdk`: `EntityMutationError` (tx failed/reverted — not owner, no funds, out of gas; has `txHash` if sent), `NoEntityFoundError`, `EmptyPatchError`, `MissingAccessKeyError`, `SchemaMismatchError`, `InvalidValueError`, `UntypedValueError`, `MissingValueError` (null is not a value — omit/unset instead), `EntityTooLargeError`, `ConflictingMutationError`, `InvalidExpiryError`, `InvalidCreationFlagsError`, `InvalidSaltError`, `NoRandomSourceError`, `InvalidAttributeNameError`, `SchemaDefinitionError`, `TooManyAttributesError`, `UnknownAttributeTypeError`.
From `@arkiv-network/sdk/query`: `InvalidPredicateError`, `UnsupportedOperatorError` (`startsWith` on non-str), `QueryError` (`.kind`).

---

## 11. Unknown / must confirm at the booth

1. **Explorer entity URL** — `/entity/<key>` is inferred from the SPA route table, not documented. Open one real key in the browser.
2. **tGLM cost per write** — no gas price or fee schedule is published anywhere (docs, hub, SDK, skills, litepaper link). Only dated gas-unit measurements (~190k gas per small create). Ask for current `gasPrice` and whether storage size / lifetime changes gas.
3. **Faucet amount and cooldown** — hub page says "One claim per wallet, per cooldown window" but numbers only render after wallet connect. Ask whether a hackathon faucet/bulk top-up exists.
4. **Keyless rate limit numbers** and **whether one access key per wallet per network** is enough for a backend + frontend (key is a path segment; restrict by IP for server, Origins for browser).
5. **Max operations per `executeBatch`** — no documented cap; only the 2^24 gas cap. Ask for a safe batch size.
6. **Query length / nesting limits** — enforced by node, numbers unpublished.
7. **`tiramisu` chain** — docs API reference lists it but the package exports only `rabdi` and `localhost`. Confirm Rabdi is the hackathon network and whether a reset is planned ("Network resets can invalidate keys without changing the chain ID" — skills).
8. **Historical reads / `eth_getLogs` beyond ~1,000 blocks** — confirmed broken on Rabdi as of 2026-11-02 (arkiv#283); ask if fixed.
9. **`status IN (a,b)`** — confirmed NOT supported at the language level; `or(eq, eq)` is the only route. Confirm no plan to add `IN`/`!=` before judging.
10. **"Mendoza"** — no such network found anywhere. If a mentor says it, ask for RPC/chain id.
11. Whether `createEntity` with `expiration` is charged per block of lifetime (docs imply yes: "a shorter lifetime costs less") and the exact formula.

---

## Appendix A — Minimal wrapper sketch for Trenches (uses only verified APIs)

```ts
// arkiv.ts
import { createPublicClient, createWalletClient, ExpirationTime, type Hex } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, or, eq, gt, asc, desc } from "@arkiv-network/sdk/query"
import { addr, bytes, defineSchema, str, u64, dec } from "@arkiv-network/sdk/schema"
import { http, stringToBytes, hexToString } from "viem"
import { privateKeyToAccount } from "viem/accounts"

export const Position = defineSchema("trenches.position", {
  user:      addr().indexed(),       // the app user; $owner will always be the server signer
  status:    str().indexed(),        // "open" | "filled" | ...  (eq / or() only — no IN, no !=)
  createdMs: u64().indexed(),        // u64(Date.now())  (bare number would be i32 and overflow)
  size:      dec().indexed(),        // dec("12.5")
  payload:   bytes(),                // JSON blob ≤128 KiB; read back with hexToString
})

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })
const account = privateKeyToAccount(process.env.ARKIV_PRIVATE_KEY as Hex)
export const pub = createPublicClient({ chain, transport: http() })
export const wal = createWalletClient({ chain, transport: http(), account })

export const THIRTY_DAYS = ExpirationTime.fromDays(30)   // = 1,296,000 blocks at 2 s/block

export async function createPosition(v: { user: Hex; status: string; size: string; payload: unknown }) {
  return wal.createEntity(Position, {
    user: addr(v.user), status: v.status, createdMs: u64(Date.now()), size: dec(v.size),
    payload: stringToBytes(JSON.stringify(v.payload)),
  }, { expiration: THIRTY_DAYS })                      // -> { entityKey, txHash, expiresAt }
}

export const setStatus = (key: Hex, status: string) =>
  wal.patchEntity(Position, key, { set: { status } })  // update in place, same key

export const extend30 = (key: Hex) => wal.extendEntity({ entityKey: key, expiration: THIRTY_DAYS })
export const remove   = (key: Hex) => wal.deleteEntity({ entityKey: key })

export async function listByUser(user: Hex, statuses: string[], limit = 50, offset = 0) {
  const page = await pub.select({ $key: true, $owner: true, $expiresAt: true, status: true, size: true, payload: true })
    .from(Position)
    .where(and(eq("user", addr(user)), or(statuses.map(s => eq("status", s)))))
    .orderBy(desc("createdMs")).limit(limit).offset(offset).withCount().fetch()
  return { total: page.count, skipped: page.skipped, rows: page.entities.map(r => ({
    key: r.$key, owner: r.$owner, expiresAt: r.$expiresAt,
    status: r.status.value, size: r.size.value, payload: JSON.parse(hexToString(r.payload.value)),
  })) }
}

export const explorerTx     = (h: Hex) => `https://rabdi.explorer.arkiv.network/tx/${h}`
export const explorerEntity = (k: Hex) => `https://rabdi.explorer.arkiv.network/entity/${k}`   // verify at booth
export const explorerAddr   = (a: Hex) => `https://rabdi.explorer.arkiv.network/address/${a}`
```

## Appendix B — Official agent skills

`npx skills add https://github.com/Arkiv-Network/skills --all` installs Arkiv's own Claude/agent skills (`arkiv`, `arkiv-first-write`, `arkiv-query`, `arkiv-entity-lifecycle`, `arkiv-entity-expiration`, `arkiv-write-safety`, `arkiv-app-integration`, `arkiv-troubleshooting`, …), all pinned to `arkiv-sdk >=1.0.0 <2`, network `rabdi` (https://docs.arkiv.network/start-here/agent-skill/). Useful as a second opinion while implementing.
