"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { base } from "viem/chains";
import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session";

/**
 * Privy: email + external wallet login, embedded wallets for users without one, Base by default
 * (DECISIONS.md). Dark theme, accent token. The session context sits inside so it can read Privy.
 */
export function Providers({ children, demoMode }: { children: ReactNode; demoMode: boolean }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <SessionProvider demoMode={demoMode}>{children}</SessionProvider>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: base,
        supportedChains: [base],
        appearance: { theme: "dark", accentColor: "#FF7A1A", walletChainType: "ethereum-only" },
      }}
    >
      <SessionProvider demoMode={demoMode}>{children}</SessionProvider>
    </PrivyProvider>
  );
}
