import { clsx } from "clsx";
import { copy } from "@/lib/copy";

export type PillStatus = "upcoming" | "live" | "endingSoon" | "ended" | "settled";

const styles: Record<PillStatus, string> = {
  upcoming: "text-muted border-line",
  live: "text-accent border-accent/40",
  endingSoon: "text-warn border-warn/40",
  ended: "text-muted border-line",
  settled: "text-gain border-gain/40",
};

export function StatusPill({ status, className }: { status: PillStatus; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 h-[26px] px-3 rounded-pill border bg-raised text-small",
        styles[status],
        className,
      )}
    >
      {status === "live" && <span className="live-dot inline-block w-2 h-2 rounded-pill bg-accent" aria-hidden />}
      {copy.status[status]}
    </span>
  );
}
