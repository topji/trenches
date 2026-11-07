"use client";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { shortAddress } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";

export function ShareActions({ slug, name, pool }: { slug: string; name: string; pool: number }) {
  const [url, setUrl] = useState(`/t/${slug}`);
  const [text, setText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const full = `${window.location.origin}/t/${slug}`;
    setUrl(full);
    setText(copy.dashboard.xPost(name, 0, pool.toFixed(2), [], full));
    // Top 3: resolve the id through the discovery route, then the public board route.
    fetch(`/api/trenches?status=funded,live,ended,settled`)
      .then((r) => r.json())
      .then((b: { trenches: { id: string; slug: string }[] }) => b.trenches.find((t) => t.slug === slug)?.id)
      .then(async (id) => {
        if (!id) return;
        const res = await fetch(`/api/trenches/${id}/leaderboard`);
        if (!res.ok) return;
        const body = (await res.json()) as { rows: { trader: string }[] };
        setText(copy.dashboard.xPost(name, body.rows.length, pool.toFixed(2), body.rows.slice(0, 3).map((r) => shortAddress(r.trader)), `${window.location.origin}/t/${slug}`));
      })
      .catch(() => undefined);
  }, [slug, name, pool]);
  return (
    <div className="flex flex-col gap-3">
      <p className="hash-block text-small whitespace-pre-wrap break-words">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigator.clipboard.writeText(url).then(() => setToast(copy.dashboard.copied)).catch(() => undefined)}>{copy.dashboard.copyLink}</Button>
        <a className="inline-flex items-center h-10 lg:h-[36px] px-3 rounded bg-raised border border-line text-small font-semibold hover:no-underline" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          {copy.dashboard.postToX}
        </a>
      </div>
      <Toast message={toast} />
    </div>
  );
}
