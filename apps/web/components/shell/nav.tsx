import Link from "next/link";
import { copy } from "@/lib/copy";
import { WalletButton } from "@/components/auth/wallet-button";
import { NavLinks } from "./nav-links";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line nav-blur">
      <div className="w-full max-w-content mx-auto px-4 h-14 flex items-center gap-4 lg:gap-8">
        <Link href="/" className="font-extrabold text-[20px] tracking-[-0.02em] hover:no-underline inline-flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-on-dark.svg" alt="" width={22} height={22} className="rounded-[3px]" style={{ imageRendering: "pixelated" }} aria-hidden />
          {copy.app.name}
        </Link>
        <NavLinks />
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
