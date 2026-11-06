"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { useSession } from "@/lib/session";

/** One button: the treasury funds the escrow after the host confirms (DECISIONS.md). */
export function FundButton({ trenchId }: { trenchId: string }) {
  const router = useRouter();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fund() {
    setBusy(true);
    setError(null);
    try {
      const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
      const res = await fetch(`/api/trenches/${trenchId}/fund`, { method: "POST", headers, body: "{}" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't fund the escrow. Try again.");
        return;
      }
      router.replace(`/create/${trenchId}/fund?funded=1`);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button onClick={fund} loading={busy}>
          {copy.cta.fund}
        </Button>
      </div>
      <InlineError>{error}</InlineError>
    </div>
  );
}
