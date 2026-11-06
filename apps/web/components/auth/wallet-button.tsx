"use client";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { shortAddress } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

/** Nav wallet control: Connect wallet → short address (click copies the full one) + Sign out. */
export function WalletButton() {
  const s = useSession();
  const [copied, setCopied] = useState(false);
  if (!s.ready) return <Button variant="secondary" size="sm" disabled>{copy.nav.connect}</Button>;
  if (!s.authenticated) {
    return (
      <Button variant="secondary" size="sm" onClick={() => s.login()}>
        {copy.nav.connect}
      </Button>
    );
  }
  async function copyAddress() {
    if (!s.address) return;
    try {
      await navigator.clipboard.writeText(s.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <span className="inline-flex items-center gap-3">
      {s.address && (
        <button type="button" onClick={copyAddress} title={s.address} className="font-mono text-[13px] hover:underline" aria-label={`Copy address ${s.address}`}>
          {copied ? "Copied" : shortAddress(s.address)}
        </button>
      )}
      <Button variant="secondary" size="sm" onClick={() => void s.logout()}>
        {copy.nav.signOut}
      </Button>
    </span>
  );
}
