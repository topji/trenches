export function shortAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function shortHash(hash: string): string {
  return shortAddress(hash, 6, 4);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Signed P&L with an explicit + or − (U+2212). */
export function formatPnl(n: number): string {
  if (n === 0) return "$0.00";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${usd.format(Math.abs(n))}`;
}

export function formatUsd(n: number): string {
  return usd.format(n);
}

/** $5.0k / $1.2M style for volume. */
export function formatCompactUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  return usd.format(n);
}

export function formatPct(n: number): string {
  if (n === 0) return "0.0%";
  return `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
}

/** HH:MM:SS for countdowns. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Short relative text for list rows: "2h 14m" / "3d". */
export function formatShortDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) + " IST";
}
