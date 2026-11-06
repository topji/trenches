"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { copy } from "@/lib/copy";
import { formatDuration, formatLocalTime } from "@/lib/format";

/** HH:MM:SS hero countdown (DESIGN_SYSTEM §5). aria-live off: it changes every second. */
export function Countdown({ startAt, endAt, status, paidAt }: { startAt: string; endAt: string; status: string; paidAt?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);

  let label: string;
  let figure: string;
  let tone: "accent" | "muted";
  if (status === "settled") {
    label = paidAt ? `${copy.status.settled} · ${copy.trench.countdown.paid(formatLocalTime(paidAt))}` : copy.status.settled;
    figure = copy.status.settled;
    tone = "muted";
  } else if (now >= end || status === "ended") {
    label = copy.trench.countdown.ended;
    figure = copy.status.ended;
    tone = "muted";
  } else if (now >= start && status !== "draft") {
    label = copy.trench.countdown.left;
    figure = formatDuration(end - now);
    tone = "accent";
  } else {
    label = copy.trench.countdown.startsIn;
    figure = formatDuration(start - now);
    tone = "muted";
  }
  return (
    <div aria-live="off">
      <div className={clsx("font-scoreboard text-hero", tone === "accent" ? "text-accent" : "text-muted")}>{figure}</div>
      <div className="text-small text-muted mt-2">{label}</div>
    </div>
  );
}
