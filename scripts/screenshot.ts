/**
 * Screenshot pages at 390 px and 1280 px for design review.
 *   pnpm tsx scripts/screenshot.ts [outDir] [path ...]
 * Defaults: outDir=test-results/shots, paths = "/".
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.APP_URL ?? "http://localhost:3000";
const [outDir = "test-results/shots", ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ["/"];
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const [name, width, height] of [["390", 390, 844], ["1280", 1280, 900]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "dark" });
  const page = await ctx.newPage();
  for (const p of targets) {
    await page.goto(base + p, { waitUntil: "load" });
    const file = `${outDir}/${p === "/" ? "landing" : p.replace(/^\//, "").replace(/\//g, "_")}-${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await ctx.close();
}
await browser.close();
