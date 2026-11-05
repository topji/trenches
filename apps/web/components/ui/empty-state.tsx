import type { ReactNode } from "react";

/** One sentence of direction and one button. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel px-4 py-8 text-center">
      <p className="text-muted">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
