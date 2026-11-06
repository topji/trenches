import { clsx } from "clsx";
import type { ReactNode } from "react";
import { InlineError } from "./inline-error";

export const inputClass =
  "w-full h-11 lg:h-10 px-3 rounded bg-raised border border-line text-text placeholder:text-faint focus:border-muted outline-none";

export function Field({
  label,
  htmlFor,
  helper,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  helper?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-small text-muted">
        {label}
      </label>
      {children}
      {helper && !error && <p className="text-small text-faint">{helper}</p>}
      <InlineError id={htmlFor ? `${htmlFor}-error` : undefined}>{error}</InlineError>
    </div>
  );
}
