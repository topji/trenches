import { clsx } from "clsx";

/** Rank medal: gold / silver / bronze for the podium, neutral after that. */
export function Medal({ rank, className }: { rank: number; className?: string }) {
  return <span className={clsx("medal", rank <= 3 && `medal-${rank}`, className)} aria-label={`Rank ${rank}`}>{rank}</span>;
}

/** Relative bar, 0..1. */
export function Bar({ value, tone = "accent", className }: { value: number; tone?: "accent" | "gain" | "loss"; className?: string }) {
  const w = Math.max(0, Math.min(1, value));
  return (
    <span className={clsx("bar", tone === "gain" && "bar-gain", tone === "loss" && "bar-loss", className)} aria-hidden>
      <span style={{ width: `${Math.round(w * 100)}%` }} />
    </span>
  );
}

export function TitleChip({ level, title }: { level: number; title: string }) {
  return <span className={clsx("text-small font-semibold", `tier-${Math.min(5, Math.max(1, level))}`)}>{title}</span>;
}

export function TagBadge({ tag }: { tag: string }) {
  return <span className="tag-badge">[{tag}]</span>;
}
