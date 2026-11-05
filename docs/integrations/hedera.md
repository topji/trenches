# Hedera integration reference (JS SDK + Mirror Node REST), testnet

Researched 2026-11-05 for ETHGlobal Mumbai "No Solidity Allowed". Everything below was checked against
the published docs, the live testnet Mirror Node, and the installed SDK type declarations. Where a
claim could not be verified it is listed in section 10 ("Unknown / must confirm"), not stated as fact.

Package names appear exactly as the SDK declares them. `Long` is the `long` npm type the SDK uses for
64-bit ints; most setters also accept `number | string`.

---

## 0. Which npm package

| Package | Latest | Last publish | Notes |
|---|---|---|---|
| `@hiero-ledger/sdk` | **2.90.1** | 2026-11-02 | Current. README install line: `npm install --save @hiero-ledger/sdk`. `engines.node >= 18`. ESM + CJS exports (`lib/index.js`, `lib/index.cjs`), types `lib/index.d.ts`, browser build `lib/browser.js`. |
| `@hashgraph/sdk` | 2.81.0 | 2026-03-13 | Old namespace. **Not marked deprecated on npm**, but it has not been published since March 2026 while `@hiero-ledger/sdk` continued (2.82 → 2.90.1). Same classes/methods. |

Sources: `npm view @hashgraph/sdk version time.modified` → `2.81.0`, `2026-03-13`;
`npm view @hiero-ledger/sdk version time.modified` → `2.90.1`, `2026-11-02`;
repo `https://github.com/hiero-ledger/hiero-sdk-js`; JSDoc `https://hiero-ledger.github.io/hiero-sdk-js/`;
quickstart `https://docs.hedera.com/native/quickstart/javascript.md`.

**Recommendation:** use `@hiero-ledger/sdk@2.90.1`. Every method name in this document was grepped from
the `.d.ts` files of both packages and is identical in both. The docs quickstart uses
`"type": "module"` + `import { Client, AccountId, PrivateKey, Hbar, TransferTransaction } from "@hiero-ledger/sdk"`.

The SDK depends on `@hiero-ledger/cryptography` (1.17.0) and `@hiero-ledger/proto`.

---

## 1. Client setup for testnet

Source: `https://docs.hedera.com/native/fundamentals/client.md` (redirected from
`/hedera/sdks-and-apis/sdks/client`), `https://docs.hedera.com/native/quickstart/javascript.md`,
`lib/client/NodeClient.d.ts`, `lib/client/Client.d.ts`.

```ts
import { Client, AccountId, PrivateKey, Hbar } from "@hiero-ledger/sdk";

// Declarations (verified in .d.ts):
//   static forTestnet(props?: { scheduleNetworkUpdate?: boolean }): NodeClient
//   static forMainnet(...), forPreviewnet(...), forName(network: string, ...), forLocalNode(...)
//   setOperator(accountId: AccountId | string, privateKey: PrivateKey | string): this
//   setOperatorWith(accountId, publicKey, transactionSigner: (msg: Uint8Array) => Promise<Uint8Array>): this
//   setDefaultMaxTransactionFee(fee: Hbar): this
//   setDefaultMaxQueryPayment(fee: Hbar): Client
//   setMirrorNetwork(mirrorNetwork: string[] | string): this
//   setRequestTimeout(ms: number): this ; setMaxAttempts(n: number): this
//   get operatorAccountId(): AccountId | null ; get operatorPublicKey(): PublicKey | null
//   close(): void

const operatorId  = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);      // "0.0.1234"
const operatorKey = PrivateKey.fromStringECDSA(process.env.HEDERA_OPERATOR_KEY!); // see key parsing below

const client = Client.forTestnet().setOperator(operatorId, operatorKey);
client.setDefaultMaxTransactionFee(new Hbar(10));   // docs: both defaults are 1 HBAR (100_000_000 tinybar)
client.setDefaultMaxQueryPayment(new Hbar(1));
// ... later, on shutdown:
client.close();
```

Verified by running the SDK: `Client.forTestnet()` pre-configures `mirrorNetwork = ["testnet.mirrornode.hedera.com:443"]`
and `ledgerId = "testnet"`. `setOperator` accepts a raw string for the key (it calls `PrivateKey.fromString`
internally); the docs quickstart sample is literally `Client.forTestnet().setOperator(operatorId, operatorKey)`
with `operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY)`.

Docs warning (client page): "The default max transaction fee and default max query payment are set to
100_000_000 tinybar (1 HBAR)". `TokenCreateTransaction` costs ~1 USD, so raise the default or call
`setMaxTransactionFee(new Hbar(30))` on that transaction (the docs sample does exactly that).

### Key types: ED25519 vs ECDSA secp256k1

Source: `https://docs.hedera.com/learn/core-concepts/keys.md`,
`https://docs.hedera.com/native/keys/generate-key-pair.md`, `lib/PrivateKey.d.ts`.

- Docs: "**ECDSA secp256k1 is the recommended key type for all new accounts and applications on Hedera.**"
  Ed25519 is "supported" and "appropriate for HCS-based applications, Hedera-native workflows", but does
  **not** produce an EVM address from the public key.
- EVM address from an ECDSA public key = rightmost 20 bytes of keccak256(uncompressed pubkey). SDK:
  `publicKey.toEvmAddress(): string` (returns hex without `0x`, verified: `b047138b...`).
- `PrivateKey.generate()` is deprecated ("silently generates an ED25519 key"). Use the explicit ones.

```ts
// Declarations (verified):
//   static generateED25519(): PrivateKey ; static generateECDSA(): PrivateKey
//   static generateED25519Async(): Promise<PrivateKey> ; static generateECDSAAsync(): Promise<PrivateKey>
//   get publicKey(): PublicKey ; get type(): string  // "ED25519" | "secp256k1"
//   toStringDer(): string ; toStringRaw(): string ; toBytesDer() ; toBytesRaw()
//   sign(bytes: Uint8Array): Uint8Array
// PublicKey: static fromString / fromStringECDSA / fromStringED25519 ; toStringDer() ; toStringRaw()
//            toEvmAddress(): string ; verify(msg, sig): boolean ; toAccountId(shard, realm): AccountId
const k = PrivateKey.generateECDSA();
k.type;            // "secp256k1"
k.toStringDer();   // 100 hex chars, starts "3030020100300706052b8104000a042204 20..."
k.toStringRaw();   // 64 hex chars (32 bytes), no prefix
const e = PrivateKey.generateED25519();
e.type;            // "ED25519"
e.toStringDer();   // 96 hex chars, starts "302e020100300506032b657004220420..."
```

### Parsing a private key string from the portal

Source: `https://docs.hedera.com/native/keys/import-key.md`,
`https://docs.hedera.com/learn/getting-started/create-portal-account.md`, and the SDK implementation
(`@hiero-ledger/cryptography` `PrivateKey.fromString`, printed with `fn.toString()`).

The portal shows a "DER Encoded Private Key (starts with `303...`)" for ECDSA accounts
(quickstart: `OPERATOR_KEY=3030020100300706052b8104000a04220420a1b2c...`). The portal page describes
only ECDSA generation ("Generate a new ECDSA private/public key pair"); older portal accounts may be ED25519
(DER starts with `302e...`).

| Method | Verified behaviour |
|---|---|
| `PrivateKey.fromStringDer(text)` | Detects the DER prefix and dispatches to ECDSA or ED25519 by the algorithm OID. Falls back to `fromString` if not DER. **Safest for any portal key.** |
| `PrivateKey.fromStringECDSA(text)` | Accepts ECDSA DER (`3030...`) **or** raw 64-hex **or** `0x`-prefixed 64-hex (all three verified → `type === "secp256k1"`). |
| `PrivateKey.fromStringED25519(text)` | Accepts ED25519 DER (`302e...`) or raw 64-hex. Throws `invalid private key length` if fed an ECDSA DER. |
| `PrivateKey.fromString(text)` | If DER → `fromStringDer`. **If raw 64-hex (no DER prefix) it assumes ED25519** and logs `WARNING: Consider using fromStringECDSA() or fromStringED25519() on a HEX-encoded string and fromStringDer() on a HEX-encoded string with DER prefix instead.` A raw ECDSA key passed here is silently mis-parsed as ED25519 (verified). |

Implementation (from the minified cryptography package):
```js
fromString(t){return g.isDerKey(t)?this.fromStringDer(t):new g(e.fromString(t))}
fromStringDer(t){return g.isDerKey(t)?"ecdsa"===g.getAlgorithm(t)?this.fromStringECDSA(t):this.fromStringED25519(t):g.fromString(t)}
```

**Rule for the wrapper:** store the key type alongside the key (`HEDERA_OPERATOR_KEY_TYPE=ECDSA|ED25519`) and
call the matching `fromStringECDSA` / `fromStringED25519`; or require DER and use `fromStringDer`. Never
feed a raw hex key to `fromString`.

### Testnet account, portal, faucet, limits

Sources: `https://docs.hedera.com/learn/getting-started/create-portal-account.md`,
`https://docs.hedera.com/learn/getting-started/testnet-faucet.md`,
`https://docs.hedera.com/learn/getting-started/faucet-api.md`,
`https://hedera.com/blog/introducing-a-new-testnet-faucet-and-hedera-portal-changes`.
(`https://portal.hedera.com/` itself returns 403 to non-browser fetches.)

- Portal signup/dashboard: `https://portal.hedera.com/signup`, playground `https://portal.hedera.com/playground`.
  Docs: "Your new account is automatically funded with **1000 HBAR**." Copy the account ID and the
  "DER Encoded Private Key (starts with `303...`)".
- Anonymous web faucet: `https://portal.hedera.com/faucet` — "RECEIVE 100 TESTNET HBAR", "No developer portal
  account required". Takes an EVM address (creates a *hollow* account if new) or an account ID. Blog/docs
  state a maximum of 100 HBAR every 24 hours per destination.
- Faucet API (for scripts/CI): `POST https://portal.hedera.com/api/disbursement/cli`, Bearer = Portal
  Personal Access Token, body `{"address":"0.0.12345","amount":25,"network":"testnet"}`; `amount` is 1–100
  whole HBAR; "Up to 100 HBAR per 24 hours" rolling per Portal account and "One funding per destination
  account per 24 hours" (cooldown shared with the web faucet). Testnet and previewnet only.
- Portal dashboard manual refill: older docs cite a 1,000 HBAR daily refill limit for portal accounts;
  the current pages fetched do not restate it (see section 10).
- Testnet resets: not covered on the pages fetched (see section 10).

---

## 2. Create an account

Source: `https://docs.hedera.com/native/accounts/create.md` (same content at
`/hedera/sdks-and-apis/sdks/accounts-and-hbar/create-an-account`), `lib/account/AccountCreateTransaction.d.ts`.

```ts
import { AccountCreateTransaction, PrivateKey, Hbar } from "@hiero-ledger/sdk";

// Declarations (verified):
//   setKey(key: Key): this                       // ED25519 or ECDSA, no EVM alias derived
//   setKeyWithoutAlias(key: Key): this           // same; docs: use if you expect to rotate keys
//   setECDSAKeyWithAlias(key: Key): this         // ECDSA, derives EVM address alias (docs-recommended for EVM use)
//   setKeyWithAlias(key: Key, aliasKey: Key): this   // both keys must sign
//   setAlias(alias: string | EvmAddress): this
//   setInitialBalance(initialBalance: number | string | Long | BigNumber | Hbar): this
//   setMaxAutomaticTokenAssociations(n: Long | number): this   // 0 = none, -1 = unlimited, >0 = limit
//   setAccountMemo(memo: string): this
//   setReceiverSignatureRequired(b: boolean): this
//   setStakedAccountId(...) / setStakedNodeId(...) / setDeclineStakingReward(...)

const newKey = PrivateKey.generateECDSA();           // keep newKey.toStringDer() somewhere encrypted
const tx = new AccountCreateTransaction()
  .setKey(newKey.publicKey)                           // or .setECDSAKeyWithAlias(newKey.publicKey)
  .setInitialBalance(new Hbar(1))
  .setMaxAutomaticTokenAssociations(-1)               // unlimited auto-association -> no TokenAssociate step needed
  .setAccountMemo("trenches user");

const resp    = await tx.execute(client);             // signed by the client operator (fee payer)
const receipt = await resp.getReceipt(client);
const newAccountId = receipt.accountId!;              // AccountId | null on TransactionReceipt
newAccountId.toString();                              // "0.0.123456"
```

Signatures: only the fee payer (operator) must sign; the new key does **not** need to sign unless you use
`setKeyWithAlias(key, aliasKey)` (then both sign). The new account ID only exists in the receipt.

Cost (`https://docs.hedera.com/networks/mainnet/fees.md`): **CryptoCreate $0.05** base. Docs: the payer also
pays "the fee for `maxAutoAssociations` and the rent for the first auto-renewal period". Fees are charged in
HBAR at the current exchange rate (`GET /api/v1/network/exchangerate`).

---

## 3. HTS: fungible token create, associate, transfer

Sources: `https://docs.hedera.com/native/tokens/define.md`, `.../tokens/associate.md`,
`.../tokens/transfer.md` (same content under `/hedera/sdks-and-apis/sdks/token-service/...`),
`lib/token/TokenCreateTransaction.d.ts`, `lib/token/TokenAssociateTransaction.d.ts`,
`lib/token/AbstractTokenTransferTransaction.d.ts`, `lib/account/TransferTransaction.d.ts`.

### 3.1 TokenCreateTransaction (fungible, 6 decimals)

```ts
import { TokenCreateTransaction, TokenType, TokenSupplyType, Hbar } from "@hiero-ledger/sdk";

// Declarations (verified):
//   setTokenName(name: string) ; setTokenSymbol(symbol: string)            // required
//   setTreasuryAccountId(id: AccountId | string)                            // required; treasury key must sign
//   setDecimals(decimals: Long | number)
//   setInitialSupply(initialSupply: Long | number | BigNumber | bigint)     // in smallest units
//   setAdminKey / setSupplyKey / setKycKey / setFreezeKey / setWipeKey / setPauseKey / setFeeScheduleKey / setMetadataKey (key: Key)
//   setTokenType(TokenType.FungibleCommon | TokenType.NonFungibleUnique)
//   setSupplyType(TokenSupplyType.Infinite | TokenSupplyType.Finite) ; setMaxSupply(n)
//   setFreezeDefault(b) ; setTokenMemo(memo) ; setAutoRenewAccountId(id) ; setAutoRenewPeriod(d) ; setExpirationTime(Timestamp | Date)
//   setCustomFees(CustomFee[]) ; setMetadata(Uint8Array)
// Enum member names verified at runtime: TokenType.FungibleCommon, TokenType.NonFungibleUnique,
//                                        TokenSupplyType.Infinite, TokenSupplyType.Finite

const supplyKey = PrivateKey.generateECDSA();
const tx = await new TokenCreateTransaction()
  .setTokenName("Trenches USD")
  .setTokenSymbol("TUSD")
  .setTokenType(TokenType.FungibleCommon)
  .setDecimals(6)
  .setInitialSupply(1_000_000n * 1_000_000n)          // 1,000,000.000000 TUSD in smallest units
  .setTreasuryAccountId(treasuryId)
  .setSupplyKey(supplyKey.publicKey)                   // needed to mint/burn later; omit = fixed supply
  .setAdminKey(adminKey.publicKey)                     // optional; if set, adminKey must sign
  .setSupplyType(TokenSupplyType.Infinite)
  .setTokenMemo("hackathon test token")
  .setMaxTransactionFee(new Hbar(30))                  // docs sample uses 30 HBAR cap
  .freezeWith(client);

const signed  = await (await tx.sign(adminKey)).sign(treasuryKey);  // sign(privateKey: PrivateKey): Promise<this>
const resp    = await signed.execute(client);
const receipt = await resp.getReceipt(client);
const tokenId = receipt.tokenId!;                     // TokenId | null
```

Docs: "Any key type ... not set at creation can't be added later. Any key that is set can't be removed later."
Required signatures: treasury key, admin key if set, fee payer. If the operator *is* the treasury you can skip
`freezeWith/sign` and just `execute` (operator signs automatically).

Cost: **TokenCreate $1.00** (fungible, no custom fees; $2.00 with custom fees), plus docs note a CryptoTransfer
fee to move the initial supply to treasury.

### 3.2 TokenAssociateTransaction

```ts
import { TokenAssociateTransaction } from "@hiero-ledger/sdk";
// Declarations: setAccountId(accountId: AccountId | string): this ; setTokenIds(tokenIds: (TokenId | string)[]): this
const tx = await new TokenAssociateTransaction()
  .setAccountId(userAccountId)
  .setTokenIds([tokenId])
  .freezeWith(client);
const signed  = await tx.sign(userKey);               // the account being associated MUST sign
const receipt = await (await signed.execute(client)).getReceipt(client);
receipt.status.toString();                            // "SUCCESS"
```

Errors (docs): `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT`, `INVALID_TOKEN_REF`, `INVALID_ACCOUNT_ID`.
Not needed when the receiving account has free `maxAutomaticTokenAssociations` slots (`-1` = unlimited);
otherwise a transfer to it fails with `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` / `NO_REMAINING_AUTOMATIC_ASSOCIATIONS`.
Cost: **TokenAssociate $0.05**.

### 3.3 TransferTransaction (multi-party token transfer)

```ts
import { TransferTransaction } from "@hiero-ledger/sdk";
// Declarations (verified in AbstractTokenTransferTransaction.d.ts / TransferTransaction.d.ts):
//   addTokenTransfer(tokenId: TokenId | string, accountId: AccountId | string, amount: number | Long | BigNumber | bigint): this
//   addTokenTransferWithDecimals(tokenId, accountId, amount, decimals: number): this   // network rejects if decimals mismatch
//   addApprovedTokenTransfer(tokenId, accountId, amount): this                        // allowance spend
//   addNftTransfer(nftId | tokenId, sender | serial, receiver | sender, receiver?): this
//   addHbarTransfer(accountId: AccountId | string, amount: number | string | Long | BigNumber | Hbar): TransferTransaction
//   addApprovedHbarTransfer(accountId, amount)

// Amounts are in the token's smallest unit (6 decimals -> 1.5 tokens = 1_500_000).
// All token amounts for a given tokenId MUST sum to zero or the network returns TRANSFERS_NOT_ZERO_SUM_FOR_TOKEN.
const tx = await new TransferTransaction()
  .addTokenTransfer(tokenId, alice, -3_000_000)        // sender(s): negative
  .addTokenTransfer(tokenId, bob,    1_000_000)        // receivers: positive
  .addTokenTransfer(tokenId, carol,  2_000_000)
  .setTransactionMemo("round #42 payout")              // optional, <= 100 bytes
  .freezeWith(client);

const signed  = await tx.sign(aliceKey);               // EVERY debited account's key must sign; fee payer (operator) signs on execute
const resp    = await signed.execute(client);
const receipt = await resp.getReceipt(client);         // throws ReceiptStatusError if status != SUCCESS
resp.transactionId.toString();                         // "0.0.1234@1699999999.123456789"
```

Rules from the docs: net-zero per token; smallest units; zero-amount transfers allowed (HIP-564); atomic — if any
sender lacks balance the whole transaction fails (fee still charged). Limits: max 10 HBAR adjustments, max 10
fungible token adjustments across all token lists, max 10 NFT ownership changes, max 20 total including custom
fees. Multiple senders → each sender's key signs (chain `.sign(k1)` then `.sign(k2)`; `sign` returns
`Promise<this>`). If the operator is a sender it is signed automatically on `execute`.

Cost: **CryptoTransfer (token) $0.001**; HBAR-only transfer $0.0001.

The `freezeWith(client) → sign(key) → execute(client) → getReceipt(client)` pattern
(source: `https://docs.hedera.com/native/transactions/unsigned.md`): `freezeWith(client)` assigns a
transaction ID + node list and locks the body ("The transaction cannot be modified after this point");
`sign(privateKey)` adds a signature; `execute(client)` also signs with the operator (`signWithOperator`)
and submits; `getReceipt(client)` polls until consensus. Receipts are only queryable for ~3 minutes
(`https://docs.hedera.com/native/transactions/receipt.md`).

### 3.4 Testnet USDC

**Yes, there is a well-known one.** Circle's page (`https://www.circle.com/en/usdc-multichain/hedera`) lists
Hedera **testnet USDC = `0.0.429274`** (mainnet `0.0.456858`). Verified live on testnet Mirror Node:

```
GET https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.429274
{"name":"USD Coin","symbol":"USDC","decimals":"6","type":"FUNGIBLE_COMMON","supply_type":"INFINITE",
 "treasury_account_id":"0.0.5176","memo":"USDC HBAR","total_supply":"10000000005000000", ...}
```

Circle faucet for testnet USDC: `https://faucet.circle.com/` (choose Hedera Testnet, paste the `0.0.x` account
ID; the account must already be associated with `0.0.429274` or have free auto-association slots). The EVM
address reported by a secondary source is `0x0000000000000000000000000000000000068cda` (= long-zero form of
0.0.429274) — consistent with the id, not confirmed from Circle.

---

## 4. HCS: topics and messages

Sources: `https://docs.hedera.com/native/consensus/create-topic.md`,
`https://docs.hedera.com/native/consensus/submit-message.md`,
`https://docs.hedera.com/native/consensus/get-message.md`, `lib/topic/*.d.ts`, live Mirror Node.

### 4.1 TopicCreateTransaction

```ts
import { TopicCreateTransaction } from "@hiero-ledger/sdk";
// Declarations (verified):
//   setTopicMemo(memo: string)              // public, <= 100 bytes
//   setAdminKey(key: Key)                   // optional; controls update/delete; if set it must sign. No admin key = immutable topic
//   setSubmitKey(key: Key)                  // optional; if set, only that key can submit (private topic)
//   setAutoRenewAccountId(id) ; setAutoRenewPeriod(Duration | Long | number)  // 2592000..8000001 s
//   setFeeScheduleKey(key) ; setFeeExemptKeys(Key[]) ; addFeeExemptKey(key) ; setCustomFees(CustomFixedFee[]) ; addCustomFee(fee)
const tx = new TopicCreateTransaction()
  .setTopicMemo("trenches:match:42")
  .setSubmitKey(submitKey.publicKey);        // omit for a public topic anyone can write to
// if setAdminKey(adminKey.publicKey) is used: await tx.freezeWith(client); await tx.sign(adminKey)
const receipt = await (await tx.execute(client)).getReceipt(client);
const topicId = receipt.topicId!;            // TopicId | null
```

Cost: **ConsensusCreateTopic $0.01** ($2.00 with custom fees).

### 4.2 TopicMessageSubmitTransaction, size limit and chunking

```ts
import { TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
// Declarations (verified):
//   setTopicId(topicId: TopicId | string): this
//   setMessage(message: string | Uint8Array): this     // string is UTF-8 encoded by the SDK
//   setMaxChunks(maxChunks: number): this               // default 20 (verified at runtime)
//   setChunkSize(chunkSize: number): this               // default 1024 (verified at runtime)
//   setCustomFeeLimits(CustomFeeLimit[]) ; addCustomFeeLimit(limit)
const tx = new TopicMessageSubmitTransaction()
  .setTopicId(topicId)
  .setMessage(JSON.stringify({ type: "bet", round: 42, amount: "1.5" }));
// private topic: await tx.freezeWith(client); await tx.sign(submitKey);
const resp    = await tx.execute(client);
const receipt = await resp.getReceipt(client);
receipt.topicSequenceNumber;                  // Long | null  -> .toString() / .toNumber()
receipt.topicRunningHash;                     // Uint8Array | null
resp.transactionId.toString();
```

Size: a single HCS transaction carries at most **1024 bytes** of message (the SDK's `CHUNK_SIZE` constant;
docs: "maximum HCS message size of 1024 bytes"). The SDK transparently splits larger messages into up to
`maxChunks` (20) chunks of `chunkSize` (1024) bytes, each a separate transaction with `chunkInfo`
(`initial_transaction_id`, `number`, `total`), so the practical max per `setMessage` is 20 KB by default.
`freezeWith` throws `Message with size N too long for 20 chunks` if exceeded. **`execute` returns only the first
chunk's response**; use `executeAll(client)` to get all responses. A scheduled HCS submit cannot exceed one chunk
(`schedule()` throws "cannot schedule TopicMessageSubmitTransaction with message over 1024 bytes").
Mirror Node reassembly: each chunk is its own message row with `chunk_info` — the reader must concatenate.

Cost: **ConsensusSubmitMessage $0.0008** base (fees page; the submit-message page says "about $0.0001" — fees page
is the authoritative table).

### 4.3 Reading messages back (Mirror Node REST)

```
GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages?limit=25&order=asc
GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages/{sequenceNumber}
query params (OpenAPI): encoding (default base64), limit, order (asc|desc), sequencenumber (eq/gt/gte/lt/lte:N), timestamp
```

Live testnet response shape (fetched 2026-11-05, topic 0.0.6280424):
```json
{"messages":[{
  "chunk_info":{"initial_transaction_id":{"account_id":"0.0.6280421","nonce":0,"scheduled":false,"transaction_valid_start":"1793897759.309588304"},"number":1,"total":1},
  "consensus_timestamp":"1793897772.769072104",
  "message":"eyJtZXNzYWdlVHlwZSI6Ik5ldXJvbkhlYXJ0QmVhdCIs...",      // base64
  "payer_account_id":"0.0.6280421",
  "running_hash":"FOMWoFrEnxOUL091BUA4ji5jBDlFfLT9xb0eUS06fM1bQMDEicncC/fRIUdUuDfu",
  "running_hash_version":3,
  "sequence_number":958785,
  "topic_id":"0.0.6280424"}],
 "links":{"next":"/api/v1/topics/0.0.6280424/messages?limit=2&order=desc&timestamp=lt:1793897731.790131104"}}
```
Decode: `Buffer.from(m.message, "base64").toString("utf8")`. Paginate by following `links.next` (relative path)
or `?sequencenumber=gt:<last>`. `GET /api/v1/topics/{id}` returns topic metadata (`submit_key`, `admin_key`,
`memo`, `fee_schedule_key`, `custom_fees`, `deleted`).

gRPC streaming alternative in the SDK (no REST polling): `new TopicMessageQuery().setTopicId(topicId).setStartTime(0).subscribe(client, errorHandler, listener)`;
declarations: `setTopicId`, `setStartTime(Timestamp | Date | number)`, `setEndTime`, `setLimit`,
`setErrorHandler((message, error) => void)`, `setCompletionHandler(() => void)`; the docs sample reads
`message.contents` (Uint8Array). Mirror gRPC allows 5 concurrent subscriptions per connection.

---

## 5. Scheduled transactions (incl. HIP-423 long-term scheduling)

Sources: `https://docs.hedera.com/native/scheduled/create.md`, `.../scheduled/sign.md`, `.../scheduled/get-info.md`,
`https://docs.hedera.com/learn/core-concepts/transactions/scheduled.md`, HIP-423 text
(`https://raw.githubusercontent.com/hiero-ledger/hiero-improvement-proposals/main/HIP/hip-423.md`),
consensus-node release notes (`https://docs.hedera.com/networks/release-notes/services.md`),
`lib/schedule/*.d.ts`.

### 5.1 Is long-term scheduling (future execution time) live on testnet in 2026?

**Yes, per the official release notes.** Release notes, Release v0.57: "**TESTNET UPDATE: JANUARY 8, 2025**",
"**MAINNET UPDATE: JANUARY 28, 2025**" — "**HIP-423: Long-Term Scheduled Transactions:** This release completes
the implementation of HIP-423, enabling schedules to execute transactions at a future date and time."
Release v0.58 (testnet Feb 11, 2025): "The ScheduleSign transaction is now throttled like other transactions ...
This completes HIP-423." Current networks: v0.78 (testnet Oct 8, 2026; mainnet Oct 16, 2026); v0.76–v0.78 notes
mention fixes to "isolate scheduled-transaction failures in the expiry scan", i.e. the expiry-time executor is in
production. HIP-423 status: **Final**, release v0.57.0.

Caveat: in the 100 most recent testnet schedules (`GET /api/v1/schedules?limit=100&order=desc`, 2026-11-05)
**none** set `expiration_time` or `wait_for_expiry` — the feature is enabled but rarely used; do a smoke test
(section 10).

### 5.2 Semantics (HIP-423 + docs, quoted)

- `expiration_time`: "A timestamp for specifying when the transaction should be evaluated for execution and then
  expire (optional)." Max: "The maximum allowed value is **62 days (5356800 seconds)**" (docs); HIP: "2 months in the
  future ... `scheduling.maxExpirationFutureSeconds`". Exceeding → `SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE`.
  Must be > consensus time → else `SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME`.
- **Default when omitted: 30 minutes** after the `ScheduleCreate` consensus time (HIP-423).
- `wait_for_expiry` (default `false`): HIP: "This field shall specify that the transaction will wait till
  `expiration_time` to attempt to execute." Docs: with `setWaitForExpiry()` "Set the transaction to execute at the
  specified expiration time"; otherwise "The default behavior is to execute at the time the minimum number of
  signatures are received". So: **all required signatures present + `waitForExpiry=false` → executes immediately
  (inside the ScheduleCreate or the final ScheduleSign); `waitForExpiry=true` → executes at `expiration_time` even
  if fully signed earlier.**
- Sign page: when the last required signature lands "The scheduled transaction executes immediately. The exception
  is a schedule configured to execute at a specified expiration time, in which case it runs at that time instead."
- At expiration: executes "at the earliest available consensus time after their expiration time, on a best-effort
  basis" (throttling can delay it); executions at expiry are exempt from throttles and congestion pricing. If
  signatures are still incomplete at expiry: "Scheduled Transactions shall expire when they are evaluated, without
  executing, in all cases" — i.e. it is deleted, not executed. Docs: "If the required signatures are not received by
  the expiry time, the transaction does not execute."
- If the scheduled tx's fee payer lacks balance at execution, the inner tx fails but the schedule entity itself
  was created successfully.
- Immutable after creation: to change it, delete (requires `setAdminKey`) and recreate; without an admin key it must
  expire ("`ScheduleDeleteTransaction`" exists: `lib/schedule/ScheduleDeleteTransaction.d.ts`).
- Duplicate identical schedule → `IDENTICAL_SCHEDULE_ALREADY_CREATED`; the later party should `ScheduleSign` instead.
- Schedule is re-evaluated on every `ScheduleSign`; a sign that adds nothing new → `NO_NEW_VALID_SIGNATURES`.
- Throttle codes: `SCHEDULE_FUTURE_THROTTLE_EXCEEDED`, `SCHEDULE_FUTURE_GAS_LIMIT_EXCEEDED`, `SCHEDULE_PENDING_EXPIRATION`.
- Schedulable types (docs, "as of Consensus Node Release 0.57"): `TransferTransaction`, `TokenMintTransaction`,
  `TokenBurnTransaction`, `AccountCreateTransaction`, `AccountUpdateTransaction`, `FileUpdateTransaction`,
  `SystemDelete/Undelete`, `Freeze`, `ContractExecute/Create/Update/DeleteTransaction`. HIP-423 *recommends* adding
  `ConsensusSubmitMessage` to `scheduling.whitelist`; the docs list does **not** include it — treat scheduling an HCS
  message as unconfirmed (section 10). Not in whitelist → `SCHEDULED_TRANSACTION_NOT_IN_WHITELIST`.
- Inner transaction signatures: the inner tx's **fee payer** (`setPayerAccountId`, defaults to the schedule creator)
  must sign, plus every key the inner tx itself needs — e.g. a `TransferTransaction` debiting account X needs X's
  key, delivered either by signing the `ScheduleCreateTransaction` with X's key or later via `ScheduleSignTransaction`.
  Do **not** `freezeWith` the inner transaction ("`.freezeWith(client)` is not needed when creating the transaction to schedule").

### 5.3 SDK calls

```ts
import { ScheduleCreateTransaction, ScheduleSignTransaction, ScheduleInfoQuery, ScheduleDeleteTransaction,
         TransferTransaction, Timestamp, Hbar } from "@hiero-ledger/sdk";

// ScheduleCreateTransaction declarations (verified, identical in 2.81.0 and 2.90.1):
//   setScheduledTransaction(transaction: Transaction): this
//   setPayerAccountId(account: AccountId): this          // NOTE: AccountId object, not string
//   setAdminKey(key: Key): this
//   setScheduleMemo(memo: string): this                   // <= 100 bytes, public
//   setExpirationTime(expirationTime: Timestamp | null): this
//   setWaitForExpiry(waitForExpiry: boolean): this
// Also: any Transaction has .schedule(): ScheduleCreateTransaction (verified: TransferTransaction.schedule())

// 1) inner tx — NOT frozen, NOT signed
const inner = new TransferTransaction()
  .addTokenTransfer(tokenId, alice, -5_000_000)   // alice's key will be required
  .addTokenTransfer(tokenId, bob,    5_000_000)
  .setTransactionMemo("settle match 42");

// 2) schedule it for a future time (<= 62 days), waiting for that time
const runAt = Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));  // static fromDate(date: string | number | Date): Timestamp
const sched = await new ScheduleCreateTransaction()
  .setScheduledTransaction(inner)
  .setPayerAccountId(operatorId)                   // who pays the inner tx fee at execution (defaults to creator)
  .setExpirationTime(runAt)
  .setWaitForExpiry(true)                          // false (default) => run as soon as fully signed
  .setScheduleMemo("match-42-settlement")
  .freezeWith(client);
// optionally pre-sign with inner-tx keys you already hold:
// await sched.sign(aliceKey);
const resp    = await sched.execute(client);
const receipt = await resp.getReceipt(client);
const scheduleId   = receipt.scheduleId!;                 // ScheduleId | null  -> "0.0.11327217"
const scheduledTxId = receipt.scheduledTransactionId!;    // TransactionId | null -> "0.0.1234@1699999999.123456789?scheduled"

// 3) counterparty adds a signature later
const signTx = await new ScheduleSignTransaction()
  .setScheduleId(scheduleId)                       // setScheduleId(scheduleId: ScheduleId | string): this
  .freezeWith(client);
await signTx.sign(aliceKey);                       // the signature being applied; operator pays fee on execute
const signReceipt = await (await signTx.execute(client)).getReceipt(client);  // SUCCESS; NO_NEW_VALID_SIGNATURES if redundant

// 4) inspect
const info = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(client);
// ScheduleInfo fields (verified .d.ts):
//   scheduleId: ScheduleId ; creatorAccountId: AccountId | null ; payerAccountId: AccountId | null
//   schedulableTransactionBody: proto.ISchedulableTransactionBody | null
//   signers: KeyList | null            // public keys that have signed so far
//   scheduleMemo: string | null ; adminKey: Key | null
//   expirationTime: Timestamp | null ; executed: Timestamp | null ; deleted: Timestamp | null
//   scheduledTransactionId: TransactionId | null ; waitForExpiry: boolean
info.executed === null  // not yet executed
```

Scheduled transaction ID: it is the ScheduleCreate's own transaction ID with the `scheduled` flag:
`TransactionId.toString()` renders it as `0.0.123@1793898027.508206574?scheduled` (verified). The record of the
inner execution is looked up with that id (Mirror Node: same `0.0.123-sec-nanos` path plus `?scheduled=true`).

Costs (fees page): **ScheduleCreate $0.01**, **ScheduleSign $0.001**, ScheduleGetInfo query $0.0001. Testnet sample:
a `SCHEDULECREATE` charged 14,372,358 tinybar (~0.14 HBAR at the then rate).

Mirror Node `GET /api/v1/schedules/{scheduleId}` (live, 2026-11-05):
```json
{"admin_key":null,"deleted":false,"consensus_timestamp":"1793897770.368568605","creator_account_id":"0.0.6582718",
 "executed_timestamp":null,"expiration_time":null,"memo":"","payer_account_id":"0.0.6582718","schedule_id":"0.0.11327217",
 "signatures":[{"consensus_timestamp":"1793897770.368568605","public_key_prefix":"Ap4hA0be...","signature":"pnVI99...","type":"ECDSA_SECP256K1"}],
 "transaction_body":"CIDC1y8SJGYzNWYzZjMyLWY3NjMt...","wait_for_expiry":false}
```
`executed_timestamp` becomes non-null once run; `expiration_time` is a `sec.nanos` string when set; `transaction_body`
is base64 protobuf `SchedulableTransactionBody`. List: `GET /api/v1/schedules?schedule.id=gt:0.0.X&limit=..&order=desc`.

---

## 6. Mirror Node REST (testnet)

Base: `https://testnet.mirrornode.hedera.com` (mainnet `https://mainnet.mirrornode.hedera.com`, previewnet
`https://previewnet.mirrornode.hedera.com`). Swagger: `https://testnet.mirrornode.hedera.com/api/v1/docs/`,
spec `https://testnet.mirrornode.hedera.com/api/v1/docs/openapi.yml`. No auth. Rate limit: docs state
"throttled at 50 per IP address" (operators page) / "100 requests per second" (HCS API page) for **mainnet**; testnet
limit not published. Source: `https://docs.hedera.com/operators/mirror-node/index.md`,
`https://docs.hedera.com/hedera/sdks-and-apis/rest-api`.

All examples below are real testnet responses fetched 2026-11-05 (trimmed).

### 6.1 Account incl. token balances

```
GET /api/v1/accounts/{idOrAliasOrEvmAddress}?transactions=false
{"account":"0.0.5176","alias":"CIQD4ABL...","auto_renew_period":7776000,
 "balance":{"balance":187498795079,"timestamp":"1767446882.864460762",
            "tokens":[{"token_id":"0.0.429274","balance":55699998}]},
 "created_timestamp":"1706820250.556670189","deleted":false,"ethereum_nonce":0,
 "evm_address":"0x0000000000000000000000000000000000001438","expiry_timestamp":"1714596250.556670189",
 "key":{"_type":"ED25519","key":"3e002b09..."},"max_automatic_token_associations":0,"memo":"auto-created account",
 "pending_reward":0,"receiver_sig_required":false,"staked_account_id":null,"staked_node_id":null,
 "transactions":[],"links":{"next":null}}
```
`balance.balance` is **tinybar** (1 HBAR = 100,000,000). `balance.tokens[].balance` is in the token's smallest
unit; decimals are **not** included here — get them from `/api/v1/tokens/{id}` or use:

```
GET /api/v1/accounts/{id}/tokens?limit=100
{"tokens":[{"automatic_association":false,"balance":55699998,"created_timestamp":"1706825561.156945003",
            "decimals":6,"token_id":"0.0.429274","freeze_status":"UNFROZEN","kyc_status":"NOT_APPLICABLE"}],"links":{"next":null}}

GET /api/v1/balances?account.id=0.0.2
{"timestamp":"1793897615.275172742","balances":[{"account":"0.0.2","balance":3384619399623922992,"tokens":[]}],"links":{"next":null}}

GET /api/v1/tokens/{tokenId}/balances?account.id=0.0.X
{"timestamp":"...","balances":[{"account":"0.0.11326748","balance":100000,"decimals":6}],"links":{"next":"..."}}
```
`/balances` is a periodic snapshot (its `timestamp` can lag minutes); `/accounts/{id}` `balance` is the fresher
one. SDK alternative with no REST code: `MirrorNodeAccountBalanceQuery` / `MirrorNodeTokenBalanceQuery` (exported
in 2.90.1; the quickstart says `MirrorNodeAccountBalanceQuery` "replaces the deprecated `AccountBalanceQuery`").

### 6.2 Token info

```
GET /api/v1/tokens/{tokenId}
{"admin_key":{"_type":"ED25519","key":"5db29f..."},"auto_renew_account":null,"created_timestamp":"1706825561.156945003",
 "custom_fees":{"fixed_fees":[],"fractional_fees":[]},"decimals":"6","deleted":false,"freeze_default":false,
 "freeze_key":{...},"initial_supply":"0","kyc_key":null,"max_supply":"0","memo":"USDC HBAR","name":"USD Coin",
 "pause_key":null,"pause_status":"NOT_APPLICABLE","supply_key":{...},"supply_type":"INFINITE","symbol":"USDC",
 "token_id":"0.0.429274","total_supply":"10000000005000000","treasury_account_id":"0.0.5176","type":"FUNGIBLE_COMMON","wipe_key":null}
```
Note `decimals`, `total_supply`, `max_supply` are **strings**.

### 6.3 Transaction by id (id format conversion)

SDK id: `0.0.123@1699999999.123456789` (`payer@seconds.nanos`). Mirror Node path requires
`0.0.123-1699999999-123456789`. Verified: the `@` form returns
`{"_status":{"messages":[{"message":"Invalid Transaction id. Please use \"shard.realm.num-sss-nnn\" format where sss are seconds and nnn are nanoseconds"}]}}`.

```ts
export function toMirrorTxId(sdkId: string): string {
  // strip "?scheduled" / "/nonce" suffixes first; pass scheduled=true as a query param instead
  const base = sdkId.split("?")[0].split("/")[0];
  const [payer, ts] = base.split("@");
  const [sec, nanos] = ts.split(".");
  return `${payer}-${sec}-${nanos.padEnd(9, "0")}`;
}
```
(`TransactionId.toString()` always pads nanos to 9 digits — verified in the implementation — so `padEnd` is defensive only.)

```
GET /api/v1/transactions/{0.0.x-sec-nanos}[?scheduled=true][&nonce=N]
{"transactions":[{"batch_key":null,"bytes":null,"charged_tx_fee":353789,"consensus_timestamp":"1793897772.769072104",
 "entity_id":"0.0.6280424","max_fee":"200000000","memo_base64":"","name":"CONSENSUSSUBMITMESSAGE","nft_transfers":[],
 "node":"0.0.9","nonce":0,"parent_consensus_timestamp":null,"result":"SUCCESS","scheduled":false,
 "staking_reward_transfers":[],"token_transfers":[],"transaction_hash":"Cy/mXZ...","transaction_id":"0.0.6280421-1793897759-309588304",
 "transfers":[{"account":"0.0.802","amount":353789,"is_approval":false},{"account":"0.0.6280421","amount":-353789,"is_approval":false}],
 "valid_duration_seconds":"120","valid_start_timestamp":"1793897759.309588304"}]}
```
A token transfer adds `"token_transfers":[{"token_id":"0.0.x","account":"0.0.y","amount":-1000000,"is_approval":false}, ...]`.
`result` is the status string (`SUCCESS`, `INSUFFICIENT_TOKEN_BALANCE`, ...). `entity_id` holds the created/targeted
entity (topic, token, schedule...). `scheduled` query param (OpenAPI): "If true, return information for the scheduled
transaction. If false, return information for the non-scheduled transaction. If not present, return information for all
transactions matching transactionId." List: `GET /api/v1/transactions?account.id=0.0.X&transactiontype=CRYPTOTRANSFER&result=success&limit=25&order=desc`.
404 `{"_status":{"messages":[{"message":"Not found"}]}}` while the tx has not been ingested yet.

### 6.4 Topic messages — see 4.3. Schedule info — see 5.3.

### 6.5 Typical lag

Docs (`https://docs.hedera.com/operators/mirror-node/architecture.md`): end-to-end latency from consensus to
mirror node visibility "is usually a few seconds" (consensus nodes upload record files after the record-file close
interval; the importer polls the bucket). No SLA is published. Practical: after `getReceipt` resolves, poll the Mirror
Node with backoff for up to ~10–15 s before treating "Not found" as an error. `/api/v1/balances` snapshots lag more.

---

## 7. HashScan URL patterns (testnet)

Source: route table extracted from the HashScan app bundle (`https://hashscan.io/assets/index-*.js`, the
hiero-mirror-node-explorer). Network segment is `testnet` | `mainnet` | `previewnet`.

| Entity | Pattern (route `/:network/...`) | Example |
|---|---|---|
| Account | `/:network/account/:accountId` | `https://hashscan.io/testnet/account/0.0.5176` |
| Transaction | `/:network/transaction/:transactionLoc` (alias `/:network/tx/:transactionLoc`) | `https://hashscan.io/testnet/transaction/0.0.6280421-1793897759-309588304` |
| Transactions by id | `/:network/transactionsById/:transactionId` | `https://hashscan.io/testnet/transactionsById/0.0.6280421-1793897759-309588304` |
| Token | `/:network/token/:tokenId` (NFT serial: `/token/:tokenId/:serialNumber`) | `https://hashscan.io/testnet/token/0.0.429274` |
| Topic | `/:network/topic/:topicId` | `https://hashscan.io/testnet/topic/0.0.6280424` |
| Schedule | `/:network/schedule/:scheduleId` | `https://hashscan.io/testnet/schedule/0.0.11327217` |
| Contract | `/:network/contract/:contractId` | — |
| Address (EVM) | `/:network/address/:accountAddress` | — |

`transactionLoc` is parsed by three parsers in sequence (`parseTransactionLoc(e){return Jf.parse(e)??lq.parse(e)??uq.parse(e)}`):
the mirror-style transaction id, a consensus timestamp (`sec.nanos`), and (by inference) a transaction hash. Use the
mirror-node dash form; whether the `@` form is accepted was not verified (section 10). Note: HashScan is an SPA
that returns HTTP 404 *with the app shell* for deep links — it works in a browser, so do not health-check these URLs with
status codes.

---

## 8. Transaction ID string → HashScan link

Verified at runtime (`lib/transaction/TransactionId.js`):

```ts
// TransactionId declarations: static generate(id: AccountId | string) ; static fromString(wholeId: string)
//   static withValidStart(accountId, validStart: Timestamp) ; setScheduled(b: boolean): this ; setNonce(n): TransactionId
//   toString(): string ; readonly accountId: AccountId | null ; readonly validStart: Timestamp | null ; scheduled ; nonce
//   getReceipt(client) ; getRecord(client)
resp.transactionId.toString()                       // "0.0.123@1793898027.508206574"
tx.transactionId?.toString()                        // same, available after freezeWith (Transaction.transactionId: TransactionId | null)
TransactionId.fromString(s).setScheduled(true).toString()   // "0.0.123@1793898027.508206574?scheduled"
// child tx:                                        // "0.0.2252@1640075693.891386528/1"   (nonce after "/")

export function hashscanTxUrl(sdkId: string, network = "testnet") {
  return `https://hashscan.io/${network}/transaction/${toMirrorTxId(sdkId)}`;   // toMirrorTxId from 6.3
}
export const hashscanAccountUrl  = (id: string, n = "testnet") => `https://hashscan.io/${n}/account/${id}`;
export const hashscanTokenUrl    = (id: string, n = "testnet") => `https://hashscan.io/${n}/token/${id}`;
export const hashscanTopicUrl    = (id: string, n = "testnet") => `https://hashscan.io/${n}/topic/${id}`;
export const hashscanScheduleUrl = (id: string, n = "testnet") => `https://hashscan.io/${n}/schedule/${id}`;
```

`TransactionId.fromString` accepts the `@` form including `?scheduled` and `/nonce` suffixes; it does **not** parse
the dash form (write the inverse of `toMirrorTxId` if you need it).

Error handling: `getReceipt` throws `ReceiptStatusError` (`{ status: Status, transactionId: TransactionId, transactionReceipt }`)
on a non-success consensus status; `execute` throws `PrecheckStatusError` on node pre-check failure. Compare with
`Status` members (PascalCase, verified): `Status.Success`, `Status.IdenticalScheduleAlreadyCreated`,
`Status.ScheduleExpirationTimeTooFarInFuture`, `Status.ScheduleExpirationTimeMustBeHigherThanConsensusTime`,
`Status.ScheduleFutureThrottleExceeded`, `Status.SchedulePendingExpiration`, `Status.ScheduledTransactionNotInWhitelist`,
`Status.ScheduleAlreadyExecuted`, `Status.ScheduleAlreadyDeleted`, `Status.NoNewValidSignatures`, `Status.SomeSignaturesWereInvalid`,
`Status.TokenNotAssociatedToAccount`, `Status.TokenAlreadyAssociatedToAccount`, `Status.NoRemainingAutomaticAssociations`,
`Status.InsufficientTokenBalance`, `Status.TransfersNotZeroSumForToken`, `Status.MessageSizeTooLarge`, `Status.InvalidSignature`,
`Status.InvalidTopicId`, `Status.Unauthorized`, `Status.ReceiptNotFound`, `Status.Busy`, `Status.TransactionExpired`,
`Status.DuplicateTransaction`. `status.toString()` gives the protobuf name (`"IDENTICAL_SCHEDULE_ALREADY_CREATED"`).

---

## 9. Key management notes for the README

- **Choose ECDSA secp256k1** for user/operator accounts (docs: "recommended key type for all new accounts"); it gives an
  EVM address (`publicKey.toEvmAddress()`), works with MetaMask/WalletConnect and the faucet's EVM-address path. Use
  ED25519 only for pure-HCS/native flows. Store the key type next to the key; parse with the matching
  `PrivateKey.fromStringECDSA` / `fromStringED25519` (or `fromStringDer` for DER). Never `PrivateKey.fromString` a raw hex key.
- Persist keys as DER hex (`toStringDer()`, `302e…`/`3030…`) — self-describing; raw hex (`toStringRaw()`) loses the type.
- **Never log private keys** or `PrivateKey` objects (they stringify). Log `accountId` and `publicKey.toStringDer()` only.
  Redact env dumps; `.env` in `.gitignore`.
- **Encrypt at rest.** Custodial per-user keys (from `AccountCreateTransaction`) must be encrypted with a KMS/HSM-held
  data key (AES-256-GCM envelope), never plaintext in the DB. The operator key only in the deployment secret store.
- Least privilege: a separate operator for fee-paying vs the token treasury/supply/admin keys; keep `adminKey` off
  tokens/topics unless you need upgrades (immutability is a feature). `setMaxTransactionFee` per tx to cap spend.
- Docs: private keys "can only be recovered once lost if created with an associated recovery phrase"; the current key is
  needed to sign a key rotation (`AccountUpdateTransaction`). ECDSA alias EVM addresses are "permanently bound to the
  original ECDSA public key" — if you plan to rotate, create accounts with `setKeyWithoutAlias`.
- Testnet is reset periodically (section 10) — treat testnet keys/ids as disposable; mainnet keys never touch dev boxes.
- Receipts expire after ~3 minutes; record the `transactionId` string at submission so Mirror Node lookups work later.

---

## 10. Unknown / must confirm

1. **HIP-423 on testnet, empirically.** Release notes say enabled since v0.57 (testnet 2025-01-08) and current testnet is
   v0.78, but none of the 100 most recent testnet schedules used `expiration_time`/`wait_for_expiry`. Smoke-test:
   `ScheduleCreateTransaction` with `setExpirationTime(now+2min).setWaitForExpiry(true)` on a fully-signed
   `TransferTransaction`, then poll `GET /api/v1/schedules/{id}` for `executed_timestamp`. Also confirm the actual value
   of `scheduling.maxExpirationFutureSeconds` on testnet (docs say 5356800 s; HIP says "2 months").
2. **Scheduling `TopicMessageSubmitTransaction`.** HIP-423 recommends adding `ConsensusSubmitMessage` to the whitelist; the
   docs' schedulable list (v0.57) omits it. Expect `SCHEDULED_TRANSACTION_NOT_IN_WHITELIST` until tested.
3. **Portal daily refill limit.** Older docs cite 1,000 HBAR/day via the portal dashboard; current pages confirm only
   1,000 HBAR at account creation and 100 HBAR/24h via faucet and faucet API.
4. **Testnet reset cadence** (historically quarterly) — not on the pages fetched; check `https://docs.hedera.com/networks/testnet/index.md`
   and `https://status.hedera.com` before the event.
5. **HashScan `transaction/` route with the `@` id form** — route parsers were seen but the exact accepted formats were not
   executed; the dash (mirror) form is the safe choice. `transactionsById/:transactionId` is an alternative.
6. **Mirror Node testnet rate limit** — only mainnet figures (50 or 100 rps per IP, pages disagree) are published.
7. **Fee page caveat**: fees are USD-denominated base fees; actual HBAR charged follows the exchange rate and HIP-1313
   "high volume" multipliers — never hard-code tinybar amounts; set `setMaxTransactionFee` caps.
8. **`@hashgraph/sdk` deprecation**: not flagged on npm, but unpublished since 2.81.0 (2026-03-13) while
   `@hiero-ledger/sdk` is at 2.90.1 — assume `@hashgraph/sdk` is frozen.
9. **`ScheduleInfo.signers`** is a `KeyList`; mapping it back to account IDs requires comparing against the public keys
   you know (`PublicKey.toStringDer()`), the Mirror Node `signatures[].public_key_prefix` (base64) is the simpler check.
10. Docs pages contain embedded "Agent Instructions" blocks; they were ignored — only the documented API content was used.
