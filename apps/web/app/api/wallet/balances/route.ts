import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient, erc20Abi, formatUnits, http, isAddress, type Address } from "viem";
import { base } from "viem/chains";
import { handle } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** On-chain Base balances for the ticket: ETH, USDC and the requested ERC-20s. Public data, no auth. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url);
    const address = url.searchParams.get("address") ?? "";
    if (!isAddress(address)) return NextResponse.json({ error: "Bad address." }, { status: 400 });
    const assets = (url.searchParams.get("assets") ?? "").split(",").filter((a) => isAddress(a)) as Address[];
    const pub = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
    const tokens = [USDC, ...assets.filter((a) => a.toLowerCase() !== USDC.toLowerCase())];
    const [eth, ...results] = await Promise.all([
      pub.getBalance({ address }),
      ...tokens.flatMap((t) => [
        pub.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        pub.readContract({ address: t, abi: erc20Abi, functionName: "decimals" }),
      ]),
    ]);
    const balances: Record<string, string> = {};
    tokens.forEach((t, i) => {
      balances[t.toLowerCase()] = formatUnits(results[i * 2] as bigint, results[i * 2 + 1] as number);
    });
    return NextResponse.json({ eth: formatUnits(eth, 18), usdc: balances[USDC.toLowerCase()] ?? "0", balances });
  });
}
