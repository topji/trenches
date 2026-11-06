import type { Address } from "@trenches/core";
import { PrivyClient } from "@privy-io/node";
import { log } from "@trenches/services";

/** docs/integrations/privy.md §3: verify the access token locally, read wallets from the identity token. */
let client: PrivyClient | null = null;
function privy(): PrivyClient | null {
  if (client) return client;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) return null;
  client = new PrivyClient({ appId, appSecret });
  return client;
}

interface LinkedWallet {
  type: string;
  address?: string;
  chain_type?: string;
  wallet_client_type?: string;
}

/** First Ethereum wallet, embedded (`wallet_client_type === "privy"`) preferred. */
export function walletOf(linked: LinkedWallet[]): Address | null {
  const wallets = linked.filter((a) => a.type === "wallet" && a.chain_type === "ethereum" && a.address);
  const pick = wallets.find((w) => w.wallet_client_type === "privy") ?? wallets[0];
  return pick?.address ? (pick.address.toLowerCase() as Address) : null;
}

const cache = new Map<string, { address: Address; until: number }>();

export async function addressFromPrivyToken(accessToken: string, idToken?: string | null): Promise<Address | null> {
  const p = privy();
  if (!p) return null;
  let userId: string;
  try {
    userId = (await p.utils().auth().verifyAccessToken(accessToken)).user_id;
  } catch (e) {
    log.warn({ err: (e as Error).message }, "privy access token rejected");
    return null;
  }
  const hit = cache.get(userId);
  if (hit && hit.until > Date.now()) return hit.address;

  let linked: LinkedWallet[] | null = null;
  if (idToken) {
    try {
      const u = await p.users().get({ id_token: idToken });
      if (u.id === userId) linked = u.linked_accounts as unknown as LinkedWallet[];
    } catch (e) {
      log.warn({ err: (e as Error).message }, "privy identity token rejected; falling back to users._get");
    }
  }
  if (!linked) {
    const u = await p.users()._get(userId);
    linked = u.linked_accounts as unknown as LinkedWallet[];
  }
  const address = walletOf(linked);
  if (address) cache.set(userId, { address, until: Date.now() + 5 * 60_000 });
  return address;
}
