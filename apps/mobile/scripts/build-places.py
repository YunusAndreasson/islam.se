#!/usr/bin/env python3
"""Regenerate src/lib/places/data.ts from the GeoNames Sweden dump.

Run once to refresh — not part of the build. The output is committed.

  curl -sSL -o /tmp/SE.zip https://download.geonames.org/export/dump/SE.zip
  unzip -o /tmp/SE.zip -d /tmp
  python3 scripts/build-places.py /tmp/SE.txt

Filters to feature_class=P (populated places) with population >= 200, excluding
abandoned/destroyed/section subtypes (PPLQ/PPLW/PPLX). Deduplicates by
(lower-cased name, county). Lands ~2,100 places — aligned with the SCB
tätorter scope. Markaryd, Älmhult, etc. are included.

GeoNames data is licensed CC-BY-4.0.
"""
import sys
from pathlib import Path

ADMIN1 = """SE.14\tNorrbotten
SE.25\tVästmanland
SE.24\tVästernorrland
SE.23\tVästerbotten
SE.22\tVärmland
SE.21\tUppsala
SE.26\tStockholm
SE.18\tSödermanland
SE.16\tÖstergötland
SE.15\tÖrebro
SE.12\tKronoberg
SE.10\tDalarna
SE.09\tKalmar
SE.08\tJönköping
SE.07\tJämtland
SE.06\tHalland
SE.05\tGotland
SE.03\tGävleborg
SE.02\tBlekinge
SE.27\tSkåne
SE.28\tVästra Götaland"""

LAN = {line.split("\t")[0].split(".")[1]: line.split("\t")[1] for line in ADMIN1.strip().splitlines()}

MIN_POP = 200
SKIP_CODES = {"PPLQ", "PPLW", "PPLX"}

# GeoNames stores a handful of large Swedish cities under their English exonym
# in the primary `name` column ("Gothenburg" rather than "Göteborg"). For a
# Swedish-language picker that reads wrong — the user types "göte" and finds
# nothing. Override known exonyms here. Add more as discovered (most Swedish
# places already carry the correct ä/ö/å spelling in `name`).
NAME_OVERRIDES = {
    "Gothenburg": "Göteborg",
}


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/SE.txt")
    dst = Path(__file__).resolve().parent.parent / "src" / "lib" / "places" / "data.ts"

    raw = []
    with src.open(encoding="utf-8") as fh:
        for line in fh:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 19 or cols[6] != "P" or cols[7] in SKIP_CODES:
                continue
            try:
                pop = int(cols[14])
            except ValueError:
                pop = 0
            if pop < MIN_POP:
                continue
            name = NAME_OVERRIDES.get(cols[1], cols[1])
            raw.append((name, LAN.get(cols[10], ""), pop, float(cols[4]), float(cols[5])))

    # Dedup pass 1: same name + same län → keep the higher-pop record.
    by_name: dict[tuple[str, str], tuple] = {}
    for rec in raw:
        key = (rec[0].lower(), rec[1])
        if key not in by_name or by_name[key][2] < rec[2]:
            by_name[key] = rec

    # Dedup pass 2: same exact coords (GeoNames sometimes registers two
    # nearby hamlets at one point — Valbo/Åby, Nättraby/Fredriksdal etc.).
    # Keep the higher-pop entry so the picker doesn't show a smaller place
    # that nearestPlace can never actually select.
    by_coord: dict[tuple[float, float], tuple] = {}
    for rec in by_name.values():
        key = (rec[3], rec[4])
        if key not in by_coord or by_coord[key][2] < rec[2]:
            by_coord[key] = rec

    places = sorted(by_coord.values(), key=lambda r: -r[2])

    with dst.open("w", encoding="utf-8") as out:
        out.write("// AUTO-GENERATED — do not edit by hand.\n")
        out.write("// Source: GeoNames SE dump (https://download.geonames.org/export/dump/SE.zip),\n")
        out.write(f"// filtered to populated places (feature class P) with population >= {MIN_POP},\n")
        out.write("// minus abandoned/destroyed/sections (PPLQ/PPLW/PPLX). Deduplicated by\n")
        out.write("// (lower-cased name, county). Sorted by population descending.\n")
        out.write("// Regenerate with scripts/build-places.py. License: CC-BY-4.0 GeoNames.\n\n")
        out.write("export interface SwedishPlace {\n")
        out.write("  /** Place name, original Swedish spelling (incl. å/ä/ö). */\n")
        out.write("  readonly name: string;\n")
        out.write("  /** Län (county) — e.g. 'Kronoberg'. Empty string if unknown. */\n")
        out.write("  readonly county: string;\n")
        out.write("  /** GeoNames population estimate at import time (people). */\n")
        out.write("  readonly population: number;\n")
        out.write("  readonly lat: number;\n")
        out.write("  readonly lon: number;\n")
        out.write("}\n\n")
        out.write("export const PLACES: readonly SwedishPlace[] = [\n")
        for n, c, p, la, lo in places:
            nm = n.replace("\\", "\\\\").replace("'", "\\'")
            cn = c.replace("\\", "\\\\").replace("'", "\\'")
            out.write(f"  {{ name: '{nm}', county: '{cn}', population: {p}, lat: {la:.5f}, lon: {lo:.5f} }},\n")
        out.write("];\n")

    print(f"wrote {len(places)} places to {dst}")


if __name__ == "__main__":
    main()
