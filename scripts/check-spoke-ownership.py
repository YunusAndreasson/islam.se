#!/usr/bin/env python3
"""Which pillar owns each /svar/ answer — and what a new pillar just took.

`related:` in a pillar's frontmatter does two jobs at once: it renders the
page's »Relaterade frågor« list (generous by nature) and it stakes that
pillar's claim to be the answer's parent (exclusive by nature). A producer
that writes a broad `related` therefore silently moves other pillars'
spokes onto the new page — the build stays green, because every slug
exists.

That has now fired on three pillars in a row (griskott took four spokes,
jihad would have orphaned `vad-ar-en-kadi`, muhammed orphaned
`erovringen-av-mecka` and then `vad-ar-koranen`). Hand-diffing caught it
each time; this makes it mechanical.

Mirrors apps/web/src/lib/svar-fordjupning.ts exactly — MAX_HOME_RANK and
HUB_CLAIMS included. If that file's rules change, change them here.

    python3 scripts/check-spoke-ownership.py --snapshot before.json
    #   ... write the new pillar ...
    python3 scripts/check-spoke-ownership.py --diff before.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Kept in step with apps/web/src/lib/svar-fordjupning.ts.
MAX_HOME_RANK = 4
HUB_CLAIMS = 3

REPO = Path(__file__).resolve().parent.parent
PILLARS = REPO / "data" / "fordjupning"


def read_pillar(path: Path) -> dict:
    """Pull `term` and the `related` list out of the YAML frontmatter.

    Deliberately a line reader, not a YAML parse: the frontmatter is
    machine-written to a fixed shape, and a dependency here would mean the
    gate cannot run from a bare checkout.
    """
    term, related, in_related = "", [], False
    with path.open(encoding="utf-8") as handle:
        for lineno, line in enumerate(handle):
            if lineno and line.rstrip() == "---":
                break
            if in_related:
                stripped = line.strip()
                if stripped.startswith("- "):
                    related.append(stripped[2:].strip().strip('"').strip("'"))
                    continue
                in_related = False
            if line.startswith("term:"):
                term = line.split(":", 1)[1].strip().strip('"').strip("'")
            elif line.startswith("related:"):
                in_related = True
    return {"id": path.stem, "term": term or path.stem, "related": related}


def ownership(pillars: list[dict]) -> tuple[dict[str, str], dict[str, list[str]]]:
    """Answer slug -> owning pillar id, plus every slug's claimants.

    Ties resolve by pillar id in Swedish collation, matching the TS side's
    `sort((a, b) => a.id.localeCompare(b.id, "sv"))` — so an equal-rank
    contest gives the same winner here as it does at build time.
    """
    claims: dict[str, list[tuple[dict, int]]] = {}
    for pillar in sorted(pillars, key=lambda p: p["id"]):
        for rank, slug in enumerate(pillar["related"]):
            claims.setdefault(slug, []).append((pillar, rank))

    homes: dict[str, str] = {}
    for slug, claimants in claims.items():
        ranked = sorted(claimants, key=lambda c: c[1])
        led = next((c for c in ranked if c[1] == 0), None)
        winner = led if led else (None if len(claimants) >= HUB_CLAIMS else ranked[0])
        if winner is None or winner[1] > MAX_HOME_RANK:
            continue
        homes[slug] = winner[0]["id"]
    return homes, {s: [p["id"] for p, _ in c] for s, c in claims.items()}


def snapshot() -> dict:
    pillars = [read_pillar(p) for p in sorted(PILLARS.glob("*.md"))]
    homes, claims = ownership(pillars)
    return {"homes": homes, "claims": claims, "pillars": [p["id"] for p in pillars]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--snapshot", metavar="FILE", help="write the current ownership map and exit 0")
    ap.add_argument("--diff", metavar="FILE", help="compare the current map against a snapshot")
    ap.add_argument("--list", action="store_true", help="show orphans and contested spokes")
    args = ap.parse_args()

    now = snapshot()

    if args.snapshot:
        Path(args.snapshot).write_text(json.dumps(now, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Ögonblicksbild: {len(now['homes'])} spokes med hem, {len(now['pillars'])} pelare → {args.snapshot}")
        return 0

    if args.list:
        orphans = {s: c for s, c in now["claims"].items() if s not in now["homes"]}
        print(f"{len(now['homes'])} spokes har ett hem, {len(orphans)} saknar det.\n")
        if orphans:
            print("FÖRÄLDRALÖSA (gör anspråk men ingen äger):")
            for slug, claimants in sorted(orphans.items(), key=lambda kv: -len(kv[1])):
                print(f"  {slug:38s} {len(claimants)} anspråk: {', '.join(claimants)}")
        return 0

    if not args.diff:
        ap.error("ange --snapshot, --diff eller --list")

    before = json.loads(Path(args.diff).read_text(encoding="utf-8"))
    added = [p for p in now["pillars"] if p not in before["pillars"]]
    stolen, orphaned, adopted = [], [], []

    for slug, owner in now["homes"].items():
        was = before["homes"].get(slug)
        if was is None:
            adopted.append((slug, owner))
        elif was != owner:
            stolen.append((slug, was, owner))
    for slug, was in before["homes"].items():
        if slug not in now["homes"]:
            orphaned.append((slug, was))

    if added:
        print(f"Nya pelare: {', '.join(added)}\n")
    for slug, owner in sorted(adopted):
        print(f"  ADOPTERAD  {slug:36s} → {owner}")
    for slug, was, owner in sorted(stolen):
        print(f"  ⛔ STULEN   {slug:36s} {was} → {owner}")
    for slug, was in sorted(orphaned):
        print(f"  ⛔ HEMLÖS   {slug:36s} förlorade {was}")

    if not (adopted or stolen or orphaned):
        print("Inga ägarbyten.")
        return 0

    if stolen or orphaned:
        print(
            f"\n{len(stolen)} stulna, {len(orphaned)} hemlösa. Korta den nya pelarens "
            "`related` till det den faktiskt äger, eller flytta en slug uppåt i den "
            "gamla pelarens lista, och kör om."
        )
        return 1
    print(f"\n{len(adopted)} adopterade, inga förluster.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
