import { copy } from "@/lib/copy";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="max-w-[560px]">
      <h1 className="text-h1 mb-6">Not found</h1>
      <EmptyState action={<ButtonLink href="/seasons" size="sm">{copy.cta.browse}</ButtonLink>}>
        {copy.system.pageNotFound}
      </EmptyState>
    </div>
  );
}
