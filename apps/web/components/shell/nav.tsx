import Link from "next/link";
import { copy } from "@/lib/copy";
import { WalletButton } from "@/components/auth/wallet-button";

export function Nav() {
  return (
    <header className="border-b border-line">
      <div className="w-full max-w-content px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-extrabold text-[18px] tracking-[-0.01em] hover:no-underline">
          {copy.app.name}
        </Link>
        <nav className="flex items-center gap-4 text-small text-muted" aria-label="Primary">
          <Link href="/trenches" className="hover:text-text">{copy.nav.trenches}</Link>
          <Link href="/clans" className="hover:text-text">{copy.nav.clans}</Link>
          <Link href="/create" className="hover:text-text">{copy.nav.create}</Link>
          <Link href="/dashboard" className="hover:text-text hidden sm:inline">{copy.nav.dashboard}</Link>
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
