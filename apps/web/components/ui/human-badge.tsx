import { Check } from "lucide-react";
import { copy } from "@/lib/copy";

export function HumanBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-pill bg-raised text-gain border border-gain/40 align-middle"
      title={copy.badge.human}
      aria-label={copy.badge.human}
    >
      <Check size={10} strokeWidth={3} aria-hidden />
    </span>
  );
}
