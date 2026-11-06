"use client";
import { copy } from "@/lib/copy";
import { shortAddress } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

/** Nav wallet control: Connect wallet → short address + Sign out. */
export function WalletButton() {
  const s = useSession();
  if (!s.ready) return <Button variant="secondary" size="sm" disabled>{copy.nav.connect}</Button>;
  if (!s.authenticated) {
    return (
      <Button variant="secondary" size="sm" onClick={() => s.login()}>
        {copy.nav.connect}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-3">
      {s.address && <span className="font-mono text-[13px] hidden sm:inline">{shortAddress(s.address)}</span>}
      <Button variant="secondary" size="sm" onClick={() => void s.logout()}>
        {copy.nav.signOut}
      </Button>
    </span>
  );
}
