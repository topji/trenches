# Deploy

## Web (Vercel)
1. Import https://github.com/topji/trenches, **Root Directory** `apps/web`, framework Next.js, install command `pnpm install --frozen-lockfile` (run from the repo root: enable "Include files outside the Root Directory"), build `pnpm build`.
2. Environment: every key in `.env.example` except `DEMO_TRADER_*`. Set `NEXT_PUBLIC_APP_URL=https://jointrenches.xyz`, `DEMO_MODE=true`, a strong `DEMO_SECRET`, `WORLD_MOCK=true`, `FEATURE_CLANS=true`.
3. Domain: jointrenches.xyz → Vercel.
4. Privy dashboard: add the domain to allowed origins. World Developer Portal: nothing to change for mocked proofs.

## Worker (Railway or Fly)
- Railway: new service from the repo, it picks up `railway.json` → `Dockerfile.worker`. Same env as the web app (no `NEXT_PUBLIC_*` needed except `NEXT_PUBLIC_WORLD_*`, which the verifier reads).
- Fly: `fly launch --dockerfile Dockerfile.worker`, `fly secrets set` from `.env`.
- Exactly **one** replica: the jobs claim rows atomically, but one worker is cheaper and keeps HCS snapshots single.

## Check
- `BASE_URL=https://jointrenches.xyz DEMO_SECRET=… pnpm demo` creates, funds, joins, settles and prints every link.
- Open the Trench page it prints on a phone.
