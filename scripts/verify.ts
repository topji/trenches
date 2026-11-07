/**
 * `pnpm verify`: unit → smoke (read-only parts) → e2e → Solidity grep → judging checklist status.
 * Exit 1 on any failure. Set VERIFY_SKIP_E2E=1 to skip Playwright (e.g. on CI without a server).
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const step = (name: string, cmd: string, args: string[]) => {
  console.log(`\n== ${name}: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`== ${name} FAILED (exit ${r.status})`);
    process.exit(1);
  }
};

step("typecheck", "pnpm", ["-r", "typecheck"]);
step("unit", "pnpm", ["test"]);
if (process.env.VERIFY_SKIP_E2E !== "1") step("e2e", "pnpm", ["e2e"]);

console.log("\n== solidity grep");
const sol = execSync("find . -name '*.sol' -not -path '*/node_modules/*' | wc -l").toString().trim();
const needle = ["pragma", "solidity"].join(" ");
const pragma = execSync(`grep -rl '${needle}' --include='*.ts' --include='*.tsx' --include='*.js' . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=e2e --exclude-dir=scripts || true`).toString().trim();
if (sol !== "0" || pragma) {
  console.error(`Solidity found: ${sol} .sol files, pragma in: ${pragma || "-"}`);
  process.exit(1);
}
console.log("zero .sol files, zero pragma");

console.log("\n== docs/judging.md");
const judging = readFileSync("docs/judging.md", "utf8");
const rows = judging.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Requirement") && !l.startsWith("|---"));
let pending = 0;
for (const row of rows) {
  const cells = row.split("|").map((c) => c.trim());
  const status = cells[3] ?? "";
  const ok = status.startsWith("✓");
  if (!ok) pending += 1;
  console.log(`${ok ? "✓" : "·"} ${cells[1]?.slice(0, 70)} — ${status}`);
}
console.log(`\n${rows.length - pending}/${rows.length} judging rows proven; ${pending} pending`);
