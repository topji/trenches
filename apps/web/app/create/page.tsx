import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { Suspense } from "react";
import { CreateForm } from "@/components/create/create-form";

export const metadata: Metadata = { title: copy.create.h1 };

export default function CreatePage() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="text-h1">{copy.create.h1}</h1>
      <Suspense fallback={null}>
        <CreateForm demoMode={process.env.DEMO_MODE === "true"} />
      </Suspense>
    </div>
  );
}
