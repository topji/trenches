"use client";
import type { Fill, Order } from "@trenches/core";
import { useCallback, useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { explorers } from "@/lib/explorers";
import { formatLocalTime, formatUsd } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ExplorerLink } from "@/components/ui/explorer-link";

interface OrderView {
  order: Order & { error?: string | null; symbol: string; summary: { amount?: string } };
  fills: Fill[];
}

const OPEN = new Set(["pending", "open", "partial"]);

/** Own orders + fills, polled every 10 s while something is open. Every fill links to Basescan. */
export function OrdersList({ trenchId, refreshKey }: { trenchId: string; refreshKey: number }) {
  const session = useSession();
  const [rows, setRows] = useState<OrderView[] | null>(null);

  const load = useCallback(async () => {
    if (!session.authenticated) return;
    const res = await fetch(`/api/trenches/${trenchId}/orders`, { headers: await session.authHeaders() });
    if (!res.ok) return;
    const body = (await res.json()) as { orders: OrderView[] };
    setRows(body.orders);
  }, [trenchId, session]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!rows?.some((r) => OPEN.has(r.order.status))) return;
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [rows, load]);

  if (!session.authenticated) return null;
  const c = copy.order.list.columns;
  return (
    <section aria-labelledby="orders-heading" className="flex flex-col gap-4">
      <h2 id="orders-heading" className="text-h2">{copy.order.list.h2}</h2>
      {!rows || rows.length === 0 ? (
        <p className="text-muted">{copy.order.list.empty}</p>
      ) : (
        <table className="w-full border-t border-line">
          <thead>
            <tr className="text-small text-muted text-left">
              <th scope="col" className="py-2 pr-2">{c.order}</th>
              <th scope="col" className="py-2 pr-2">{c.status}</th>
              <th scope="col" className="py-2">{c.fills}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ order, fills }) => (
              <tr key={order.id} className="border-t border-line align-top">
                <td className="py-3 pr-2">
                  <div className="font-semibold">
                    {copy.order.types[order.type]} · {order.side === "buy" ? copy.order.fields.buy : copy.order.fields.sell} {order.symbol}
                  </div>
                  <div className="text-small text-muted tabular">
                    {order.summary.amount ?? ""} {order.side === "buy" ? "USDC" : order.symbol} · {formatLocalTime(order.createdAt)}
                  </div>
                </td>
                <td className="py-3 pr-2 text-small">
                  <span className={order.status === "failed" ? "text-loss" : order.status === "filled" ? "text-gain" : "text-muted"}>{copy.order.status[order.status]}</span>
                  {order.error && <div className="text-small text-loss mt-1 max-w-[32ch]">{order.error}</div>}
                </td>
                <td className="py-3 text-small">
                  {fills.length === 0 ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {fills.map((f) => (
                        <li key={f.id} className="flex flex-wrap items-center gap-x-2">
                          <span className="tabular">{copy.order.list.fill(f.qty.toPrecision(5), order.symbol, formatUsd(f.priceUsd), formatLocalTime(f.filledAt))}</span>
                          <ExplorerLink href={explorers.baseTx(f.txHash)} label={copy.order.list.viewTx} />
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
