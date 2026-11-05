import { copy } from "@/lib/copy";

export function Footer() {
  return (
    <footer className="border-t border-line mt-12">
      <div className="w-full max-w-content px-4 py-6 text-small text-muted" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        <p>{copy.app.footer}</p>
        <p className="mt-2">
          <a href="https://github.com/topji/trenches" className="text-muted hover:text-text">github.com/topji/trenches</a>
          {" · "}
          <span>{copy.app.handle}</span>
        </p>
      </div>
    </footer>
  );
}
