import Link from "next/link";
import { clsx } from "clsx";
import { Medal, TagBadge } from "@/components/ui/medal";

export interface PodiumRow {
  rank: number;
  tag: string;
  name: string;
  score: number;
  members: number;
}

/** Top three Trenches as a podium: 2 · 1 · 3, the winner's step taller. */
export function Podium({ rows }: { rows: PodiumRow[] }) {
  const byRank = (r: number) => rows.find((x) => x.rank === r);
  const order = [2, 1, 3];
  return (
    <ol className="podium" aria-label="Podium">
      {order.map((r) => {
        const row = byRank(r);
        return (
          <li key={r} className={clsx("podium-step", r === 1 && "podium-step-1", !row && "opacity-50")}>
            <Medal rank={r} />
            {row ? (
              <>
                <TagBadge tag={row.tag} />
                <Link href={`/trench/${row.tag}`} className="font-semibold leading-tight text-[15px] line-clamp-2">{row.name}</Link>
                <span className={clsx("font-scoreboard tabular", r === 1 ? "text-[32px] text-accent" : "text-[24px]")}>{row.score.toFixed(1)}</span>
                <span className="text-small text-muted">{row.members} {row.members === 1 ? "member" : "members"}</span>
              </>
            ) : (
              <span className="text-small text-muted">Open</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
