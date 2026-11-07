/**
 * Brand assets rendered from the design tokens with Playwright:
 *   apps/web/public/brand/logo.svg · logo-512.png · wordmark-dark.png · cover-1200x630.png · cover-1500x500.png
 *   apps/web/app/icon.png (favicon / app icon) · apps/web/app/opengraph-image.png (default share card)
 * Mark: a pixel "trench" — a valley cut into a block, accent rim, in the same 10×10 grid as the avatars.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const T = { bg: "#0E1726", raised: "#16233A", sunken: "#0A111D", line: "#243551", text: "#EEF3FA", muted: "#8FA3C0", accent: "#FF7A1A", ink: "#1A0B00", gain: "#34D399" };

// 10×10 pixel mark: block with a V-shaped trench; rim pixels in accent, floor in ink, block in text.
const grid = [
  "..........",
  ".TTTTTTTT.",
  ".TTAAAATT.",
  ".TTA..ATT.",
  ".TTA..ATT.",
  ".TTTA.ATT.",
  ".TTTAAATT.",
  ".TTTTTTTT.",
  ".TTTTTTTT.",
  "..........",
];
const color = { T: T.text, A: T.accent, ".": null };
function markSvg(size, { bg = null } = {}) {
  const cells = [];
  grid.forEach((row, y) => [...row].forEach((ch, x) => { const c = color[ch]; if (c) cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`); }));
  const bgRect = bg ? `<rect width="10" height="10" rx="1.2" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="${size}" height="${size}" shape-rendering="crispEdges">${bgRect}${cells.join("")}</svg>`;
}

const fontLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">`;
const base = `*{box-sizing:border-box;margin:0}body{background:${T.bg};color:${T.text};font-family:Archivo,system-ui,sans-serif;background-image:radial-gradient(rgba(238,243,250,.06) 1px,transparent 1px);background-size:24px 24px}.sb{font-variation-settings:"wdth" 118;font-weight:800;letter-spacing:-.03em}.mono{font-family:"JetBrains Mono",monospace}`;

function wordmark(sizePx) {
  return `<div style="display:flex;align-items:center;gap:${sizePx * 0.28}px">${markSvg(sizePx)}<div class="sb" style="font-size:${sizePx * 0.9}px;line-height:1">Trenches</div></div>`;
}

function cover(w, h) {
  const pad = Math.round(h * 0.11);
  const title = Math.round(h * 0.135);
  return `<!doctype html><html><head>${fontLink}<style>${base}html,body{width:${w}px;height:${h}px;overflow:hidden}</style></head><body>
  <div style="position:relative;width:${w}px;height:${h}px;padding:${pad}px;display:flex;flex-direction:column;justify-content:space-between">
    ${wordmark(Math.round(h * 0.085))}
    <div>
      <div class="sb" style="font-size:${title}px;line-height:1;max-width:${Math.round(w * 0.78)}px">The collaborative social layer for on&#8209;chain traders.</div>
      <div style="margin-top:${Math.round(h * 0.05)}px;font-size:${Math.round(h * 0.045)}px;color:${T.muted};max-width:${Math.round(w * 0.7)}px;line-height:1.35">Found a Trench, enter seasons from your own wallet, climb a public ladder nobody can fake.</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;color:${T.muted};font-size:${Math.round(h * 0.034)}px">
      <div>Execution by Definitive Flash · Records on Arkiv · Escrow on Hedera · Humans by World ID</div>
      <div class="mono" style="color:${T.text}">jointrenches.xyz</div>
    </div>
    <div style="position:absolute;right:${pad}px;top:${pad}px;display:flex;gap:6px">
      ${[1, 2, 3].map((r) => `<div style="width:${Math.round(h * 0.07)}px;height:${Math.round(h * 0.07)}px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.round(h * 0.034)}px;background:${r === 1 ? T.accent : r === 2 ? "#C9D3E3" : "#C8955A"};color:${r === 1 ? T.ink : T.bg}">${r}</div>`).join("")}
    </div>
  </div></body></html>`;
}

const out = "apps/web/public/brand";
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/logo.svg`, markSvg(512));
writeFileSync(`${out}/logo-on-dark.svg`, markSvg(512, { bg: T.bg }));

const browser = await chromium.launch();
const shots = [
  { file: `${out}/logo-512.png`, html: `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body>${markSvg(512, { bg: T.bg })}</body></html>`, w: 512, h: 512 },
  { file: `apps/web/app/icon.png`, html: `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body>${markSvg(256, { bg: T.bg })}</body></html>`, w: 256, h: 256 },
  { file: `${out}/wordmark-dark.png`, html: `<!doctype html><html><head>${fontLink}<style>${base}body{padding:40px;display:inline-block}</style></head><body>${wordmark(96)}</body></html>`, w: 700, h: 200 },
  { file: `${out}/cover-1200x630.png`, html: cover(1200, 630), w: 1200, h: 630 },
  { file: `apps/web/app/opengraph-image.png`, html: cover(1200, 630), w: 1200, h: 630 },
  { file: `${out}/cover-1500x500.png`, html: cover(1500, 500), w: 1500, h: 500 },
];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  await page.setContent(s.html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: s.file, omitBackground: s.file.includes("logo") || s.file.includes("icon") || s.file.includes("wordmark"), clip: { x: 0, y: 0, width: s.w, height: s.h } });
  await page.close();
  console.log("wrote", s.file);
}
await browser.close();
