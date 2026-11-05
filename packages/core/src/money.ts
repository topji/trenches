/** USDC and the HTS prize token both use 6 decimal places. */
export const USDC_DECIMALS = 6;
const SCALE = 10n ** BigInt(USDC_DECIMALS);

/** "12.345678" | 12.34 → base units as bigint (truncates beyond 6 dp). */
export function toBaseUnits(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toFixed(USDC_DECIMALS) : amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount: ${amount}`);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".") as [string, string?];
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  const v = BigInt(whole) * SCALE + BigInt(fracPadded);
  return neg ? -v : v;
}

/** base units → decimal string with exactly 6 dp, e.g. 300000000n → "300.000000". */
export function fromBaseUnits(units: bigint): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(USDC_DECIMALS, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export function baseUnitsToNumber(units: bigint): number {
  return Number(fromBaseUnits(units));
}
