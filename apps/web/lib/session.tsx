"use client";
import type { Address } from "@trenches/core";
import { useIdentityToken, usePrivy, useWallets } from "@privy-io/react-auth";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "./session-types";

export const DEMO_STORAGE_KEY = "trenches.demo";

const SessionContext = createContext<Session | null>(null);

function readDemo(): { address: Address; secret: string } | null {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { address?: string; secret?: string };
    if (!v.address || !v.secret) return null;
    return { address: v.address.toLowerCase() as Address, secret: v.secret };
  } catch {
    return null;
  }
}

/** Privy-backed session. In DEMO_MODE a localStorage entry (set by Playwright / demo scripts) can stand in. */
function PrivySession({ children, demoMode }: { children: ReactNode; demoMode: boolean }) {
  const privy = usePrivy();
  const { wallets } = useWallets();
  const { identityToken } = useIdentityToken();
  const [demo, setDemo] = useState<{ address: Address; secret: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (demoMode) setDemo(readDemo());
  }, [demoMode]);

  const value = useMemo<Session>(() => {
    if (demo) {
      return {
        ready: true,
        authenticated: true,
        address: demo.address,
        login: () => undefined,
        logout: async () => {
          try {
            window.localStorage.removeItem(DEMO_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          setDemo(null);
        },
        authHeaders: async () => ({ "x-trenches-demo": demo.secret, "x-trenches-address": demo.address }),
      };
    }
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    const wallet = embedded ?? wallets[0];
    const address = (wallet?.address ?? privy.user?.wallet?.address ?? null) as Address | null;
    return {
      ready: mounted && privy.ready,
      authenticated: privy.authenticated,
      address: address ? (address.toLowerCase() as Address) : null,
      login: () => privy.login(),
      logout: () => privy.logout(),
      authHeaders: async () => {
        const token = await privy.getAccessToken();
        const h: Record<string, string> = {};
        if (token) h.authorization = `Bearer ${token}`;
        if (identityToken) h["privy-id-token"] = identityToken;
        return h;
      },
    };
  }, [demo, wallets, privy, identityToken, mounted]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Without a Privy app id (misconfigured env) the app still renders; only the demo session can act. */
function BareSession({ children, demoMode }: { children: ReactNode; demoMode: boolean }) {
  const [demo, setDemo] = useState<{ address: Address; secret: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (demoMode) setDemo(readDemo());
  }, [demoMode]);
  const value = useMemo<Session>(
    () => ({
      ready: mounted,
      authenticated: !!demo,
      address: demo?.address ?? null,
      login: () => undefined,
      logout: async () => setDemo(null),
      authHeaders: async (): Promise<Record<string, string>> => (demo ? { "x-trenches-demo": demo.secret, "x-trenches-address": demo.address } : {}),
    }),
    [demo, mounted],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children, demoMode }: { children: ReactNode; demoMode: boolean }) {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? <PrivySession demoMode={demoMode}>{children}</PrivySession> : <BareSession demoMode={demoMode}>{children}</BareSession>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <Providers>");
  return ctx;
}
