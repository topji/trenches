"use client";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { BoardRow } from "@/lib/board";
import { useSession } from "@/lib/session";
import { Leaderboard } from "./leaderboard";

const POLL_MS = 15_000;

/**
 * F4: server-rendered rows from Arkiv, then polled every 15 s from the public leaderboard route.
 * Rows whose rank changed flash for 1.5 s; the caller's own move is announced in a polite live region.
 */
export function LiveBoard({ trenchId, initialRows, settled, live }: { trenchId: string; initialRows: BoardRow[]; settled?: boolean; live: boolean }) {
  const session = useSession();
  const [rows, setRows] = useState<BoardRow[]>(initialRows);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState("");
  const ranks = useRef(new Map(initialRows.map((r) => [r.trader.toLowerCase(), r.rank])));

  useEffect(() => {
    if (!live && !settled) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/trenches/${trenchId}/leaderboard`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const body = (await res.json()) as { rows: BoardRow[] };
        const moved = new Set<string>();
        for (const r of body.rows) {
          const key = r.trader.toLowerCase();
          const before = ranks.current.get(key);
          if (before !== undefined && before !== r.rank) moved.add(key);
        }
        ranks.current = new Map(body.rows.map((r) => [r.trader.toLowerCase(), r.rank]));
        setRows(body.rows);
        if (moved.size) {
          setFlash(moved);
          setTimeout(() => setFlash(new Set()), 1500);
          const me = session.address?.toLowerCase();
          if (me && moved.has(me)) {
            const mine = body.rows.find((r) => r.trader.toLowerCase() === me);
            if (mine) setAnnounce(copy.leaderboard.liveRegion(mine.rank));
          }
        }
      } catch {
        /* next tick */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [trenchId, live, settled, session.address]);

  return (
    <>
      <Leaderboard rows={rows} settled={settled} flash={flash} />
      <p className="sr-only" aria-live="polite" role="status">{announce}</p>
    </>
  );
}
