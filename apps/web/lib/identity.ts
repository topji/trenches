/** How a wallet is shown everywhere (steps 11–13): "[TAG] handle · title", falling back to the short address. */
import { shortAddress } from "./format";

export interface IdentityLite {
  handle: string | null;
  title: string;
  level: number;
  xp: number;
  clanId: string | null;
  tag: string | null;
}

export function displayName(address: string, id?: IdentityLite | null): string {
  if (!id?.handle) return shortAddress(address);
  return id.tag ? `[${id.tag}] ${id.handle}` : id.handle;
}
