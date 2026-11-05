import { ArrowUpRight } from "lucide-react";
import { clsx } from "clsx";
import { shortHash } from "@/lib/format";

/** Text + external icon; hash rendered in mono and truncated. */
export function ExplorerLink({
  href,
  label,
  hash,
  className,
}: {
  href: string;
  label?: string;
  hash?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx("inline-flex items-center gap-1 text-text", className)}
    >
      {label && <span>{label}</span>}
      {hash && <span className="font-mono text-[13px]">{shortHash(hash)}</span>}
      <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
