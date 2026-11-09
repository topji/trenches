import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { HostTable } from "@/components/dashboard/host-table";
import { ExportWallet } from "@/components/dashboard/export-wallet";

export const metadata: Metadata = { title: copy.dashboard.h1 };

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="text-h1">{copy.dashboard.h1}</h1>
      <HostTable />
      <ExportWallet />
    </div>
  );
}
