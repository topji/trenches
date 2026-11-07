import { copy } from "@/lib/copy";

export function Footer() {
  const parts = copy.app.footer.split(" · ");
  return (
    <footer className="border-t border-line mt-16">
      <div className="w-full max-w-content mx-auto px-4 py-8 text-small text-muted flex flex-col gap-3" style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {parts.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p>
          <a href="https://github.com/topji/trenches" className="text-muted hover:text-text">github.com/topji/trenches</a>
          {" · "}
          <span>{copy.app.handle}</span>
        </p>
      </div>
    </footer>
  );
}
