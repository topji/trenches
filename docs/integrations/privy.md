# Privy integration reference (researched 2026-11-06)

Verified against docs.privy.io and the type definitions shipped in `@privy-io/react-auth@3.51.3` and `@privy-io/node@0.38.0`. `@privy-io/server-auth` is flagged deprecated on npm ("use @privy-io/node instead"), so the server side uses `@privy-io/node`.

## 1. Provider (App Router)
Docs: https://docs.privy.io/basics/react/setup · https://docs.privy.io/basics/troubleshooting/react-frameworks · https://docs.privy.io/basics/react/advanced/automatic-wallet-creation

`PrivyProvider` is client-only: a `'use client'` wrapper rendered from `app/layout.tsx` (`apps/web/components/auth/providers.tsx`).

```tsx
<PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={{
  loginMethods: ["email", "wallet"],
  embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },  // 'users-without-wallets' | 'all-users' | 'off'
  defaultChain: base, supportedChains: [base],                                  // viem chain objects
  appearance: { theme: "dark", accentColor: "#FF7A1A", walletChainType: "ethereum-only" },
}}>
```
Email and wallet must also be enabled in Dashboard → Authentication. `createOnLogin` fires only for the modal `login()`, not headless flows.

## 2. Client hooks
Docs: https://docs.privy.io/authentication/user-authentication/authentication-state · https://docs.privy.io/wallets/wallets/get-a-wallet/get-connected-wallet · https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data

- `usePrivy()` → `ready`, `authenticated`, `user`, `login()`, `logout()`, `getAccessToken()` (auto-refresh, 1 h tokens). Gate every read on `ready`.
- `useWallets()` → `{ wallets: ConnectedWallet[] }`; embedded wallet has `walletClientType === "privy"`; external ones `"metamask"`, `"coinbase_wallet"`, …
- `useIdentityToken()` → `{ identityToken }` (10 h; enable in Dashboard → User management → Authentication → Advanced → "Return user data in an identity token").
- Signing (step 5): `await wallet.switchChain(8453); const provider = await wallet.getEthereumProvider(); provider.request({ method: "eth_signTypedData_v4", params: [wallet.address, JSON.stringify(typedData)] })`, or `useSignTypedData()`.

## 3. Server side (`@privy-io/node`)
Docs: https://docs.privy.io/authentication/user-authentication/access-tokens · https://docs.privy.io/user-management/users/identity-tokens · https://docs.privy.io/basics/nodeJS/setup

Client sends `Authorization: Bearer <getAccessToken()>` and `privy-id-token: <identityToken>` (`apps/web/lib/session.tsx`). Server (`apps/web/lib/server/privy.ts`):

```ts
const privy = new PrivyClient({ appId, appSecret });
const { user_id } = await privy.utils().auth().verifyAccessToken(token);   // local JWT check
const user = await privy.users().get({ id_token: idToken });               // no API call, no rate limit
// user.linked_accounts[]: { type: "wallet", address, chain_type: "ethereum", wallet_client_type: "privy" (embedded) }
const fallback = await privy.users()._get(user_id);                        // REST, rate-limited; used only without an id token
```
Cookies (`privy-token`, `privy-id-token`) exist only with HttpOnly cookies enabled on a verified base domain, so the Bearer header is used.

## 4. Test accounts (e2e)
Docs: https://docs.privy.io/recipes/using-test-accounts — Dashboard → User management → Authentication → Advanced → "Enable test accounts" gives a fixed email + OTP. Not used: Playwright runs with the DEMO_MODE session header instead (`e2e/helpers.ts`), gated by `DEMO_SECRET`.

## 5. Next.js notes
EVM-only install needs only `@privy-io/react-auth` + `viem`; Solana peer deps stay optional. Hooks only under the provider, so every consumer is a client component. `@privy-io/node` is listed in `serverExternalPackages`.
