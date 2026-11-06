import type { Address } from "@trenches/core";

/** What client components need from auth. Implemented over Privy in lib/session.tsx; e2e may inject a demo session. */
export interface Session {
  ready: boolean;
  authenticated: boolean;
  address: Address | null;
  login: () => void;
  logout: () => Promise<void>;
  /** Headers that let a mutating route identify the caller. */
  authHeaders: () => Promise<Record<string, string>>;
}
