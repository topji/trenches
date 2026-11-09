"use client";
import { useExportWallet, usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";

/** Opens Privy's own key-export screen for the embedded wallet, so the owner can move funds out with any wallet app. */
function ExportWalletInner() {
  const { ready, authenticated, user } = usePrivy();
  const { exportWallet } = useExportWallet();
  const [error, setError] = useState<string | null>(null);
  const embedded = user?.linkedAccounts.find((a) => a.type === "wallet" && "walletClientType" in a && a.walletClientType === "privy") as { address: string } | undefined;
  if (!ready || !authenticated || !embedded) return null;
  return (
    <section aria-label={copy.dashboard.exportWallet.title} className="panel p-4 flex flex-col gap-3 max-w-[560px]">
      <h2 className="text-h2">{copy.dashboard.exportWallet.title}</h2>
      <p className="text-small text-muted">{copy.dashboard.exportWallet.body}</p>
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            exportWallet({ address: embedded.address }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
          }}
        >
          {copy.dashboard.exportWallet.cta}
        </Button>
      </div>
      <InlineError>{error}</InlineError>
    </section>
  );
}

export function ExportWallet() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
  return <ExportWalletInner />;
}
