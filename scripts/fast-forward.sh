#!/usr/bin/env bash
# End a live season now and settle it (DEMO_MODE only). Usage: scripts/fast-forward.sh <season-slug> [site]
set -euo pipefail
slug="${1:?season slug (from the /t/<slug> URL)}"
site="${2:-https://www.jointrenches.xyz}"
secret="$(grep -E '^DEMO_SECRET=' "$(dirname "$0")/../.env" | cut -d= -f2- | tr -d '"' | tr -d "'" | sed 's/[[:space:]]*#.*//')"
id="$(curl -sf "$site/api/trenches?status=live" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).trenches.find(t=>t.slug===process.argv[1]);process.stdout.write(t?t.id:"")})' "$slug")"
[ -n "$id" ] || { echo "no live season with slug $slug" >&2; exit 1; }
echo "fast-forwarding $slug ($id)…"
curl -sf -X POST "$site/api/dev/fast-forward" -H "content-type: application/json" -H "x-trenches-demo: $secret" -d "{\"trenchId\":\"$id\"}"
echo
echo "done → $site/t/$slug"
