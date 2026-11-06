import "dotenv/config";

/** Warm the dev server's lazy compilation so first-hit compile time does not eat into test timeouts. */
export default async function globalSetup(): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const paths = ["/", "/create", "/trenches", "/t/warm-up-slug", "/api/trenches?status=live", "/api/trenches/warm-up", "/api/world/rp-context?trenchId=warm-up"];
  for (const p of paths) {
    const started = Date.now();
    try {
      const res = await fetch(base + p, { signal: AbortSignal.timeout(120_000) });
      console.log(`[warm] ${p} → ${res.status} in ${Date.now() - started} ms`);
    } catch (e) {
      console.log(`[warm] ${p} failed: ${(e as Error).message}`);
    }
  }
  try {
    const res = await fetch(base + "/api/trenches/warm-up/join", { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(120_000) });
    console.log(`[warm] POST join → ${res.status}`);
  } catch (e) {
    console.log(`[warm] join failed: ${(e as Error).message}`);
  }
}
