/**
 * Deterministic pixel art, no assets: a 10×10 mirrored sprite per wallet (PFP) and a 24×10 pixel
 * banner per Trench. Colours come from the token palette, picked by hash, rendered as crisp SVG.
 */
const PALETTES: string[][] = [
  ["#FF7A1A", "#1A0B00", "#F5C04A"],
  ["#34D399", "#0A111D", "#C9D3E3"],
  ["#C9D3E3", "#16233A", "#FF7A1A"],
  ["#C8955A", "#0E1726", "#F5C04A"],
  ["#FB5D7A", "#1A0B00", "#C9D3E3"],
  ["#F5C04A", "#0A111D", "#34D399"],
];

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

/** Square sprite, mirrored left/right like a classic identicon but denser, with a two-tone body and an accent "eye" row. */
export function PixelAvatar({ seed, size = 32, className, rounded = true }: { seed: string; size?: number; className?: string; rounded?: boolean }) {
  const h = hash32(seed.toLowerCase());
  const next = rng(h);
  const pal = PALETTES[h % PALETTES.length]!;
  const n = 10;
  const half = n / 2;
  const cells: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < half; x++) {
      const r = next();
      const edge = y === 0 || y === n - 1 || x === 0;
      const on = r > (edge ? 0.72 : 0.42);
      if (!on) continue;
      const color = y >= 3 && y <= 4 && x >= 2 ? pal[2]! : r > 0.85 ? pal[1]! : pal[0]!;
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`);
      cells.push(`<rect x="${n - 1 - x}" y="${y}" width="1" height="1" fill="${color}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${pal[1]}" opacity="0.9"/>${cells.join("")}</svg>`;
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={`${rounded ? "rounded" : ""} shrink-0 border border-line ${className ?? ""}`}
      style={{ imageRendering: "pixelated", width: size, height: size }}
    />
  );
}

/** Wide banner: a pixel skyline over a field, deterministic per Trench. */
export function PixelBanner({ seed, width = 240, height = 100, className }: { seed: string; width?: number; height?: number; className?: string }) {
  const h = hash32(`banner:${seed.toLowerCase()}`);
  const next = rng(h);
  const pal = PALETTES[(h >>> 8) % PALETTES.length]!;
  const W = 24;
  const H = 10;
  const cells: string[] = [];
  // sky noise
  for (let i = 0; i < 18; i++) cells.push(`<rect x="${Math.floor(next() * W)}" y="${Math.floor(next() * 4)}" width="1" height="1" fill="${pal[2]}" opacity="0.7"/>`);
  // skyline columns
  for (let x = 0; x < W; x++) {
    const top = 3 + Math.floor(next() * 5);
    for (let y = top; y < H; y++) {
      const c = y === top ? pal[0] : next() > 0.82 ? pal[2] : pal[1];
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${W}" height="${H}" fill="#0A111D"/>${cells.join("")}</svg>`;
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      width={width}
      height={height}
      alt=""
      aria-hidden
      className={`rounded border border-line shrink-0 ${className ?? ""}`}
      style={{ imageRendering: "pixelated", width, height }}
    />
  );
}
