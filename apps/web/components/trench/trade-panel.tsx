"use client";
import type { Address, AllowedAsset } from "@trenches/core";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/session";
import { OrderTicket } from "./order-ticket";
import { OrdersList } from "./orders-list";

/** Ticket + orders list, only for an entered trader while the Trench is live (F3). */
export function TradePanel({ trenchId, assets, entrants, live }: { trenchId: string; assets: AllowedAsset[]; entrants: Address[]; live: boolean }) {
  const session = useSession();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const me = session.address?.toLowerCase();
  const entered = !!me && entrants.some((a) => a.toLowerCase() === me);
  if (!session.ready || !session.authenticated || !entered) return null;
  return (
    <div className="flex flex-col gap-8">
      {live ? (
        <OrderTicket
          trenchId={trenchId}
          assets={assets}
          onPlaced={() => {
            setRefreshKey((k) => k + 1);
            router.refresh();
          }}
        />
      ) : (
        <p className="text-small text-muted">{copy.order.notLive}</p>
      )}
      <OrdersList trenchId={trenchId} refreshKey={refreshKey} />
    </div>
  );
}
