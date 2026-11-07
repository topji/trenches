import { ImageResponse } from "next/og";
import { arkivReader } from "@trenches/services";
import { mergeBoard } from "@/lib/board";

export const runtime = "nodejs";
export const alt = "Trenches scoreboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const T = { bg: "#0E1726", raised: "#16233A", line: "#243551", text: "#EEF3FA", muted: "#8FA3C0", accent: "#FF7A1A", gain: "#34D399", loss: "#FB5D7A", rank2: "#C9D3E3", rank3: "#C8955A" };

function pnl(n: number) {
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${s}$${Math.abs(n).toFixed(2)}`;
}
function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** OG share card (DESIGN_SYSTEM §5): bg, Trench name, top 3 in scoreboard figures, pool, URL, sponsor. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const reader = arkivReader();
  const trench = await reader.getTrenchBySlug(slug).catch(() => null);
  const [lb, entries] = trench ? await Promise.all([reader.getLeaderboard(trench.id).catch(() => []), reader.listEntries(trench.id).catch(() => [])]) : [[], []];
  const top = trench ? mergeBoard(lb, entries).slice(0, 3) : [];
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? "https://jointrenches.xyz").replace(/^https?:\/\//, "");
  const rankColor = [T.accent, T.rank2, T.rank3];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: T.bg, color: T.text, display: "flex", flexDirection: "column", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, color: T.muted }}>Trenches{trench?.sponsor ? ` · Prize pool by ${trench.sponsor.name}` : ""}</div>
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1, marginTop: 8 }}>{trench?.name ?? "Trench not found"}</div>
          </div>
          {trench && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ fontSize: 24, color: T.muted }}>Pool</div>
              <div style={{ fontSize: 56, fontWeight: 800, color: T.accent }}>${trench.prizePoolUsdc.toFixed(2)}</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, borderTop: `2px solid ${T.line}` }}>
          {top.length === 0 ? (
            <div style={{ fontSize: 32, color: T.muted, padding: "32px 0" }}>No entrants yet. Be the first to join.</div>
          ) : (
            top.map((r, i) => (
              <div key={r.trader} style={{ display: "flex", alignItems: "center", height: 88, borderBottom: `2px solid ${T.line}`, fontSize: 40 }}>
                <div style={{ width: 80, fontWeight: 800, color: rankColor[i] }}>{r.rank}</div>
                <div style={{ flex: 1, fontFamily: "monospace", fontSize: 34 }}>{short(r.trader)}</div>
                <div style={{ fontWeight: 800, color: r.pnlUsd > 0 ? T.gain : r.pnlUsd < 0 ? T.loss : T.text }}>{pnl(r.pnlUsd)}</div>
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 26, color: T.muted }}>
          <div>{trench ? `${trench.allowedAssets.map((a) => a.symbol).join(", ")} · ${trench.prizeSplit.join("/")}` : ""}</div>
          <div>{site}/t/{slug}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
