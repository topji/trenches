import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { CreateClanForm } from "@/components/clans/create-clan-form";

export const metadata: Metadata = { title: copy.clans.create };

export default function CreateClanPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{copy.clans.create}</h1>
      <CreateClanForm />
    </div>
  );
}
