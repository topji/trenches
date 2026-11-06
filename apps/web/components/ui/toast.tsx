"use client";
import { useEffect, useState } from "react";

/** Bottom toast, 3 s, same verb as the action (DESIGN_SYSTEM §5). */
export function Toast({ message }: { message: string | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [message]);
  if (!message || !visible) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="panel px-4 py-3 text-small">{message}</div>
    </div>
  );
}
