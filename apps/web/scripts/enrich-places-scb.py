#!/usr/bin/env python3
"""Overlay official SCB statistics onto the GeoNames place spine.

Run once to refresh — not part of the build. The output (places.ts) is committed.

  python3 apps/web/scripts/enrich-places-scb.py

The GeoNames-derived list in src/lib/bonetider/places.ts is the routing/coordinate
spine for the /bonetider/[stad] pages (its name+county+population+lat+lon define the
2,118 routes and the solar map). This script PRESERVES that spine byte-for-byte and
only *appends* official statistics from SCB where a confident match exists:

  - kommun           SCB municipality (from the tätort's kommunkod)
  - scbPopulation    official tätort population, ref. 31 Dec 2023
  - landAreaKm2      land area (SCB "Landareal, ha" / 100)
  - densityPerKm2    SCB "Folkmängd per kvadratkilometer"
  - scbRank          rank among all SCB tätorter by population (descending)
  - scbCode          SCB region/tätort code (traceability)

Unmatched places (e.g. GeoNames suburbs that SCB folds into a larger tätort, like
Sollentuna → Stockholm) keep their GeoNames population and get NO SCB block, so we
never attach a wrong official figure.

Source: SCB "Statistiska tätorter 2023" via the PxWeb API, table
MI/MI0810/MI0810A/LandarealTatortN (Tid=2023). SCB statistical data is CC0.
GeoNames data is CC-BY-4.0. The match key is (casefolded name, county/län): SCB
region codes embed the kommunkod (first 4 digits) and länkod (first 2), which we map
to the same county names GeoNames uses.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

PLACES_TS = Path(__file__).resolve().parent.parent / "src" / "lib" / "bonetider" / "places.ts"

SCB_TATORT = "https://api.scb.se/OV0104/v1/doris/sv/ssd/MI/MI0810/MI0810A/LandarealTatortN"
SCB_BEFOLK = "https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0101/BE0101A/BefolkningNy"

# SCB länkod (first two digits of a kommunkod) -> the county name GeoNames uses in
# places.ts. Kept identical to build-places.py's ADMIN1 names so the join lines up.
LANKOD_TO_COUNTY = {
    "01": "Stockholm", "03": "Uppsala", "04": "Södermanland", "05": "Östergötland",
    "06": "Jönköping", "07": "Kronoberg", "08": "Kalmar", "09": "Gotland",
    "10": "Blekinge", "12": "Skåne", "13": "Halland", "14": "Västra Götaland",
    "17": "Värmland", "18": "Örebro", "19": "Västmanland", "20": "Dalarna",
    "21": "Gävleborg", "22": "Västernorrland", "23": "Jämtland",
    "24": "Västerbotten", "25": "Norrbotten",
}

# Each committed place line starts with these five fields, in this order. We capture
# the raw lat/lon tokens so re-emission can't drift the coordinates.
PLACE_RE = re.compile(
    r'\{\s*name:\s*"((?:[^"\\]|\\.)*)",\s*'
    r'county:\s*"((?:[^"\\]|\\.)*)",\s*'
    r"population:\s*(\d+),\s*"
    r"lat:\s*(-?[\d.]+),\s*"
    r"lon:\s*(-?[\d.]+)"
)


def fetch_json(url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers)
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def norm(name: str) -> str:
    return " ".join(name.strip().casefold().split())


def kommun_names() -> dict[str, str]:
    """kommunkod (4-digit) -> kommun name, from SCB's current population table."""
    meta = fetch_json(SCB_BEFOLK)
    regvar = next(v for v in meta["variables"] if v["code"] == "Region")
    out: dict[str, str] = {}
    for code, txt in zip(regvar["values"], regvar["valueTexts"]):
        code = code.strip()
        name = txt.strip()
        head, _, tail = name.partition(" ")
        if head.isdigit() and tail:
            name = tail.strip()
        if len(code) == 4 and code.isdigit():
            out[code] = name
    return out


SPLIT_RE = re.compile(r"\s+och\s+|,\s*")


def scb_tatorter(kommun: dict[str, str]) -> tuple[dict[tuple[str, str], dict], dict[tuple[str, str], list[dict]]]:
    """Return (exact, compound) indexes keyed by (norm name, county).

    `exact` maps a tätort's own name. `compound` maps each constituent of a merged
    SCB tätort (e.g. 'Sundsvall och Timrå' → 'Sundsvall', 'Timrå') to the merged
    record, so a standalone GeoNames place can still surface the *official* tätort it
    belongs to — labelled with that combined name so the figure is never misread.
    """
    meta = fetch_json(SCB_TATORT)
    regvar = next(v for v in meta["variables"] if v["code"] == "Region")
    code2txt = {c: t for c, t in zip(regvar["values"], regvar["valueTexts"])}

    query = {
        "query": [
            {"code": "Region", "selection": {"filter": "all", "values": ["*"]}},
            {"code": "ContentsCode", "selection": {"filter": "all", "values": ["*"]}},
            {"code": "Tid", "selection": {"filter": "item", "values": ["2023"]}},
        ],
        "response": {"format": "json"},
    }
    data = fetch_json(SCB_TATORT, query)
    order = [c["code"] for c in data["columns"] if c["type"] == "c"]
    iarea, ipop, idens = (order.index("000003F9"), order.index("000003F7"), order.index("000003F8"))

    rows = []
    for row in data["data"]:
        code = row["key"][0]
        if code == "T00":
            continue
        try:
            pop = int(row["values"][ipop])
        except ValueError:
            continue  # tätort that did not exist / no 2023 figure
        county = LANKOD_TO_COUNTY.get(code[:2])
        if not county:
            continue
        try:
            area_ha = int(row["values"][iarea])
        except ValueError:
            area_ha = 0
        try:
            density = int(row["values"][idens])
        except ValueError:
            density = 0
        rows.append({
            "name": code2txt.get(code, "").strip(),
            "county": county,
            "kommun": kommun.get(code[:4], ""),
            "pop": pop,
            "areaKm2": round(area_ha / 100, 2),
            "density": density,
            "code": code,
        })

    # National rank: position among ALL tätorter by population, descending.
    rows.sort(key=lambda r: -r["pop"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i

    exact: dict[tuple[str, str], dict] = {}
    compound: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        key = (norm(r["name"]), r["county"])
        # Same (name, county) twice → keep the larger; near-impossible but safe.
        if key not in exact or exact[key]["pop"] < r["pop"]:
            exact[key] = r
        parts = [p for p in SPLIT_RE.split(r["name"]) if p.strip()]
        if len(parts) > 1:
            for part in parts:
                compound.setdefault((norm(part), r["county"]), []).append(r)
    return exact, compound


def num(x: float) -> str:
    """Emit 80.67 not 80.7, and 435.0 as 435 — tidy TS number literals."""
    s = f"{x:.2f}".rstrip("0").rstrip(".")
    return s or "0"


HEADER = """\
// AUTO-GENERATED — do not edit by hand.
// Spine: GeoNames SE dump (https://download.geonames.org/export/dump/SE.zip),
// filtered to populated places (feature class P) with population >= 200, minus
// abandoned/destroyed/sections (PPLQ/PPLW/PPLX), deduped by (name, county),
// sorted by population descending. License: CC-BY-4.0 GeoNames.
// Regenerate the spine with scripts/build-places.py.
//
// Official statistics (kommun, scbPopulation, landAreaKm2, densityPerKm2, scbRank,
// scbCode) are overlaid from SCB "Statistiska tätorter 2023" (referensår 31 dec
// 2023) via the PxWeb table MI0810A/LandarealTatortN, matched on (name, county).
// SCB statistical data is CC0. Places SCB folds into a larger tätort (e.g. suburbs)
// keep only the GeoNames population. Regenerate with scripts/enrich-places-scb.py.

export interface SwedishPlace {
\t/** Place name, original Swedish spelling (incl. å/ä/ö). */
\treadonly name: string;
\t/** Län (county) — e.g. 'Kronoberg'. Empty string if unknown. */
\treadonly county: string;
\t/** GeoNames population estimate at import time (people). */
\treadonly population: number;
\treadonly lat: number;
\treadonly lon: number;
\t/** SCB municipality (kommun) for the matched tätort. */
\treadonly kommun?: string;
\t/** Official SCB tätort population, ref. 31 Dec 2023. */
\treadonly scbPopulation?: number;
\t/** SCB land area in km² (Landareal). */
\treadonly landAreaKm2?: number;
\t/** SCB population density (people per km²). */
\treadonly densityPerKm2?: number;
\t/** Rank among all SCB tätorter by population (1 = largest). */
\treadonly scbRank?: number;
\t/** SCB region/tätort code (traceability). */
\treadonly scbCode?: string;
\t/** The SCB tätort name when it differs (a combined tätort, e.g. 'Sundsvall och
\t *  Timrå') — so the page reports the official figure under its real name. */
\treadonly scbName?: string;
}

export const PLACES: readonly SwedishPlace[] = [
"""


def main() -> None:
    text = PLACES_TS.read_text(encoding="utf-8")
    kommun = kommun_names()
    print(f"kommun names: {len(kommun)}", file=sys.stderr)
    exact, compound = scb_tatorter(kommun)
    print(f"SCB tätorter (2023, with population): {len(exact)}", file=sys.stderr)

    lines_out = [HEADER]
    total = matched = compound_hits = 0
    top_total = top_matched = 0
    unmatched_big = []

    for m in PLACE_RE.finditer(text):
        name, county, pop_s, lat_s, lon_s = m.groups()
        total += 1
        pop = int(pop_s)
        big = pop >= 5000
        if big:
            top_total += 1
        rec = exact.get((norm(name), county))
        if not rec:
            # A standalone place SCB merged into a combined tätort ("X och Y").
            # Only accept when exactly one combined tätort claims this name+county,
            # so the figure is unambiguous; it is shown under the combined name.
            cands = compound.get((norm(name), county), [])
            if len(cands) == 1:
                rec = cands[0]
                compound_hits += 1
        extra = ""
        if rec:
            matched += 1
            if big:
                top_matched += 1
            parts = [f'kommun: "{rec["kommun"]}"', f"scbPopulation: {rec['pop']}"]
            if rec["areaKm2"]:
                parts.append(f"landAreaKm2: {num(rec['areaKm2'])}")
            if rec["density"]:
                parts.append(f"densityPerKm2: {rec['density']}")
            parts.append(f"scbRank: {rec['rank']}")
            parts.append(f'scbCode: "{rec["code"]}"')
            # Emit the SCB tätort name only when it differs (combined tätorter), so
            # the page can say "ingår i tätorten «Sundsvall och Timrå»" honestly.
            if norm(rec["name"]) != norm(name):
                sn = rec["name"].replace("\\", "\\\\").replace('"', '\\"')
                parts.append(f'scbName: "{sn}"')
            extra = ", " + ", ".join(parts)
        elif big:
            unmatched_big.append((pop, name, county))
        nm = name.replace("\\", "\\\\").replace('"', '\\"')
        cn = county.replace("\\", "\\\\").replace('"', '\\"')
        lines_out.append(
            f'\t{{ name: "{nm}", county: "{cn}", population: {pop}, '
            f"lat: {lat_s}, lon: {lon_s}{extra} }},\n"
        )

    lines_out.append("];\n")
    PLACES_TS.write_text("".join(lines_out), encoding="utf-8")

    print(f"places: {total}, matched to SCB: {matched} ({matched / total:.0%})", file=sys.stderr)
    print(f"  exact: {matched - compound_hits}, via combined tätort: {compound_hits}", file=sys.stderr)
    print(f"  of pop>=5000: {top_matched}/{top_total} matched", file=sys.stderr)
    if unmatched_big:
        print("  unmatched pop>=5000 (kept GeoNames pop, no SCB block):", file=sys.stderr)
        for pop, name, county in sorted(unmatched_big, reverse=True)[:30]:
            print(f"    {pop:>8}  {name} ({county})", file=sys.stderr)
    print(f"wrote {PLACES_TS}", file=sys.stderr)


if __name__ == "__main__":
    main()
