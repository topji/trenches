import Link from "next/link";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "destructive";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded font-semibold whitespace-nowrap select-none transition-colors duration-240 disabled:opacity-40 disabled:pointer-events-none";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90",
  secondary: "bg-raised text-text border border-line hover:border-muted",
  destructive: "bg-loss text-accent-ink hover:bg-loss/90",
};
const sizes: Record<Size, string> = {
  md: "h-11 lg:h-10 px-4 text-[16px]",
  sm: "h-10 lg:h-[36px] px-3 text-small",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(base, variants[variant], sizes[size], "hover:no-underline", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" size={18} strokeWidth={1.75} aria-hidden />
          <span className="invisible">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={clsx(base, variants[variant], sizes[size], "hover:no-underline", className)}>
      {children}
    </Link>
  );
}
