/**
 * Demo rehearsal against a running app (BASE_URL, default http://localhost:3000): create a Trench,
 * fund it, make it live, join two traders (mocked World ID), clan flow, fast-forward, settle, and
 * print every explorer link. Run it before recording the video.
 *   pnpm demo            (needs DEMO_MODE=true + DEMO_SECRET on the target)
 */
import "dotenv/config";
import { buildMockIdKitResult, joinSignal } from "../packages/worldid/src/client.js";

const BASE = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SECRET = process.env.DEMO_SECRET ?? "";
const ADMIN = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87";
const A = "0x1234123412341234123412341234123412341234";
const B = "0x5678567856785678567856785678567856785678";
const log = (...a: unknown[]) => console.log("[demo]", ...a);
const hs = (id: string) => {
  const b = id.split("?")[0]!; const [p, t] = b.split("@"); const [sec, n = "0"] = (t ?? "").split(".");
  return `https://hashscan.io/testnet/transaction/${p}-${sec}-${n.padEnd(9, "0")}`;
};

async function api(path: string, who: string, body?: unknown, method = "POST") {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-trenches-demo": SECRET, "x-trenches-address": who }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function join(trenchId: string, who: string) {
  const rp = (await api(`/api/world/rp-context?trenchId=${trenchId}`, who, undefined, "GET")) as { rp_context: { nonce: string }; action: string; environment: string };
  const result = buildMockIdKitResult({ nonce: rp.rp_context.nonce, action: rp.action, environment: rp.environment, signal: joinSignal(trenchId, who), identity: who });
  return api(`/api/trenches/${trenchId}/join`, who, { result });
}

async function main() {
  if (!SECRET) throw new Error("DEMO_SECRET missing");
  const now = Date.now();
  const tag = Date.now().toString(36).slice(-4).toUpperCase();
  log("target", BASE);

  const created = (await api("/api/trenches", ADMIN, {
    name: `Demo Trench ${tag}`, description: "Rehearsal", startAt: new Date(now - 60_000).toISOString(), endAt: new Date(now + 30 * 60_000).toISOString(),
    allowedAssets: [{ chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH" }], prizePoolUsdc: 5, prizeSplit: [50, 30, 20], entryRule: "open", adminFeeShareBps: 5000,
  })) as { trench: { id: string; slug: string; hedera: { escrowAccountId: string; topicId: string } }; links: Record<string, string | null> };
  const t = created.trench;
  log(`created /t/${t.slug}`, created.links.escrow, created.links.topic, created.links.arkivEntity);
  const funded = (await api(`/api/trenches/${t.id}/fund`, ADMIN, {})) as { fundingTxId: string };
  log("funded", hs(funded.fundingTxId));
  await api("/api/dev/tick", ADMIN, { trenchId: t.id });
  await join(t.id, A); await join(t.id, B);
  log("joined A + B");

  // clan flow
  const clan = (await api("/api/clans", A, { name: `Demo Clan ${tag}`, tag: `D${tag}`.slice(0, 5), description: "rehearsal", open: true })) as { id: string; tag: string };
  await api("/api/profile/handle", A, { handle: `demo_${tag.toLowerCase()}` }).catch((e) => log("handle:", (e as Error).message));
  await api(`/api/clans/${clan.id}/join`, B, {});
  log(`clan /c/${clan.tag} with A (leader) + B`);

  const ff = (await api("/api/dev/fast-forward", ADMIN, { trenchId: t.id })) as { settlement: { payoutTxId: string | null; winners: { rank: number; trader: string; amountUsdc: number }[]; feeShare: { scheduleId: string | null } } | null };
  const s = ff.settlement;
  if (s) {
    log("settled: winners", s.winners, "payout", s.payoutTxId ? hs(s.payoutTxId) : "none", "fee-share schedule", s.feeShare.scheduleId ? `https://hashscan.io/testnet/schedule/${s.feeShare.scheduleId}` : "none");
  } else log("settlement claimed by the worker; check /t/" + t.slug);
  await api("/api/dev/tick", ADMIN, { clans: true });
  const ladder = (await api("/api/clans/ladder", ADMIN, undefined, "GET")) as { rows: { tag: string; score: number; rank: number }[] };
  log("ladder", ladder.rows.slice(0, 5));
  log(`open ${BASE}/t/${t.slug} · ${BASE}/clans · ${BASE}/u/${A}`);
  log("PASS");
}

main().catch((e) => { console.error("[demo] FAIL", e); process.exit(1); });
