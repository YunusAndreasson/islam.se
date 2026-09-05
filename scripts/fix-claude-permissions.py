#!/usr/bin/env python3
"""Lägg till tillåtelseregler i .claude/settings.json så att Claude Code slutar
fråga om lov för rutinarbete i det här repot.

Bakgrund: modellen får inte utvidga sina egna rättigheter — auto-lägets
klassificerare blockerar den. Därför finns det här skriptet: du kör det, så är
det ditt beslut och inte modellens.

Körning:
    python3 scripts/fix-claude-permissions.py            # visa vad som skulle läggas till
    python3 scripts/fix-claude-permissions.py --apply    # skriv till .claude/settings.json
    python3 scripts/fix-claude-permissions.py --apply --accept-edits

Skriptet är idempotent, rör aldrig `deny`/`ask`, och tar aldrig bort något som
redan står i filen.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SETTINGS = REPO / ".claude" / "settings.json"

# ── Filredigering ────────────────────────────────────────────────────────────
# Det här är den grupp som i praktiken orsakar flest frågor: utan dem frågar
# Claude om lov vid VARJE redigering av en innehållsfil.
FILE_TOOLS = [
    "Edit(data/**)",
    "Write(data/**)",
    "Edit(apps/web/src/**)",
    "Write(apps/web/src/**)",
    "Edit(apps/mobile/src/**)",
    "Edit(packages/**)",
    "Edit(scripts/**)",
]

# ── Projektets egna kontroller (läser filer, skriver inget utom --fix) ───────
CHECKERS = [
    f"Bash(python3 scripts/{name}.py *)"
    for name in (
        "check-house-style",
        "check-quran-quotes",
        "check-source-urls",
        "check-language-tics",
        "check-claim-sourcing",
        "check-book-passages",
        "check-chart-sources",
        "check-chrome-copy",
    )
]

# ── Byggen, tester och pipeline ─────────────────────────────────────────────
# Medvetet EXAKTA former, inte "pnpm run *" — en jokertecken där vore
# godtycklig kodkörning.
COMMANDS = [
    "Bash(cd:*)",
    "Bash(pnpm test)",
    "Bash(pnpm test:checkers)",
    "Bash(pnpm lint:house)",
    "Bash(pnpm lint:charts)",
    "Bash(pnpm lint:articles)",
    "Bash(pnpm typecheck:web)",
    "Bash(pnpm knip)",
    "Bash(pnpm verify)",
    "Bash(pnpm dev:status)",
    "Bash(pnpm dev:logs)",
    "Bash(pnpm dev:bg)",
    "Bash(pnpm dev:stop)",
    "Bash(pnpm --filter @islam-se/web build)",
    "Bash(pnpm --filter @islam-se/content-producer build)",
    "Bash(pnpm --filter @islam-se/orchestrator build)",
    "Bash(node apps/content-producer/dist/index.js *)",
    "Bash(sqlite3:*)",
    "Bash(/home/yunus/.claude/skills/google-search-console/scripts/gsc *)",
]

# ── Läsande MCP-verktyg ─────────────────────────────────────────────────────
MCP = [
    f"mcp__quotes__{n}"
    for n in (
        "search_quotes",
        "search_books",
        "search_quran",
        "search_text",
        "search_by_filter",
        "bulk_search",
        "get_inventory",
        "get_quote_by_id",
        "fetch_wikipedia",
    )
]

GROUPS: list[tuple[str, list[str]]] = [
    ("filredigering", FILE_TOOLS),
    ("kontrollskript", CHECKERS),
    ("kommandon", COMMANDS),
    ("mcp (läsande)", MCP),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="skriv ändringarna (utan flaggan visas bara vad som skulle hända)")
    ap.add_argument("--accept-edits", action="store_true",
                    help='sätt defaultMode till "acceptEdits" — stoppar frågor om filredigering helt')
    args = ap.parse_args()

    settings: dict = {}
    if SETTINGS.exists():
        try:
            settings = json.loads(SETTINGS.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"✗ {SETTINGS} är inte giltig JSON: {e}", file=sys.stderr)
            print("  Rätta filen för hand först — skriptet vägrar skriva över trasig JSON.",
                  file=sys.stderr)
            return 1

    perms = settings.setdefault("permissions", {})
    allow = perms.setdefault("allow", [])
    if not isinstance(allow, list):
        print("✗ permissions.allow är inte en lista — avbryter.", file=sys.stderr)
        return 1

    have = set(allow)
    added_total = 0

    for label, rules in GROUPS:
        new = [r for r in rules if r not in have]
        print(f"\n{label}  ({len(rules) - len(new)} fanns redan, {len(new)} tillkommer)")
        for r in new:
            print(f"   + {r}")
            have.add(r)
            allow.append(r)
        added_total += len(new)

    mode_change = None
    if args.accept_edits and settings.get("defaultMode") != "acceptEdits":
        mode_change = settings.get("defaultMode")
        settings["defaultMode"] = "acceptEdits"
        print(f'\ndefaultMode: {mode_change or "(osatt)"} -> "acceptEdits"')

    if added_total == 0 and mode_change is None:
        print("\n✓ Inget att göra — allt fanns redan.")
        return 0

    if not args.apply:
        print(f"\n(torrkörning) {added_total} regler skulle läggas till.")
        print("Kör om med --apply för att skriva.")
        return 0

    SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    if SETTINGS.exists():
        backup = SETTINGS.with_suffix(".json.bak")
        shutil.copy2(SETTINGS, backup)
        print(f"\nSäkerhetskopia: {backup}")

    SETTINGS.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    print(f"✓ Skrev {SETTINGS} — {len(allow)} regler totalt.")
    print("  Starta om Claude Code (eller kör /permissions) för att läsa in dem.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
