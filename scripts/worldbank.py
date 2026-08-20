#!/usr/bin/env python3
"""Världsbankens WDI, med de två fällorna redan bortbyggda.

    python3 scripts/worldbank.py search "literacy"                   # hitta indikatorkod
    python3 scripts/worldbank.py search "refugee" --limit 30
    python3 scripts/worldbank.py get SP.POP.TOTL --iso SE,SY,IQ --years 2015:2024
    python3 scripts/worldbank.py get SM.POP.REFG.OR --iso SY --years 2010:2024 --csv
    python3 scripts/worldbank.py countries --aggregates               # de 78 aggregaten

Licens **CC BY 4.0** — attribution krävs. Skriv `Källa: Världsbanken, World Development
Indicators` plus indikatorns namn och året. v2 är aktuell; `/v3/` ger 404 (kontrollerat
2026-08-20). Ingen nyckel, ingen känd hastighetsgräns.

TVÅ FÄLLOR, båda uppmätta 2026-08-20 och båda hanterade här:

1. **Svaret är en tvåelementsarray** — `[metadata, data]`, inte en lista med rader. Den
   klassiska parsningsmissen ger `KeyError` eller, värre, en tyst tom lista.

2. ⚠️ **`country/all` blandar länder och aggregat.** Anropet ger 295 poster, varav **78 är
   aggregat** — `ARB` (Arab World), `MEA`, `SSF`, inkomstgrupper, `WLD`. De känns igen på
   att `region.id == "NA"`. Ett diagram som rankar »länder« på den listan sätter Sverige
   bredvid Arabvärlden och dubbelräknar varje land i sitt eget aggregat. Det här skriptet
   **filtrerar bort aggregat som standard**; `--aggregates` tar med dem, och då är det ett
   medvetet val som hör hemma i bildtexten.

⛔ WDI INNEHÅLLER INGEN RELIGIONSSTATISTIK. Inte en enda av de 1 498 indikatorerna mäter
tro. Att gruppera länder efter majoritetsreligion är en analys du gör själv, inte en
kategori som finns i källan — och på den här sajten är det sällan rätt drag: det gör
religion till förklaring av ett utfall som mäts i BNP eller läskunnighet. Vill du visa
ursprungsländernas förhållanden, namnge länderna. Se `[[no-shia-content]]` för den
angränsande regeln om kategorier.

⚠️ Aggregatens namn ändras. `MEA` heter numera *Middle East, North Africa, Afghanistan &
Pakistan* — en bildtext som säger »Mellanöstern och Nordafrika« beskriver då inte längre
det som räknats. Läs namnet ur svaret, översätt inte ur minnet.
"""

import argparse
import csv
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.worldbank.org/v2"
TIMEOUT = 30
UA = {"User-Agent": "islam.se chart tooling (open data)"}
WDI_SOURCE = "2"


def fetch(path: str, **params) -> tuple[dict, list]:
    """GET and unwrap the two-element array. Returns (metadata, rows)."""
    quiet = params.pop("_quiet", False)
    params.setdefault("format", "json")
    params.setdefault("per_page", "500")  # default is 50 and silently truncates
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=TIMEOUT) as r:
            payload = json.loads(r.read().decode("utf-8-sig"))
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} för {url}")
    except urllib.error.URLError as e:
        sys.exit(f"nätverksfel: {e.reason}")

    if not isinstance(payload, list) or len(payload) < 2:
        # A bad indicator code answers with a one-element array holding a message.
        msg = payload[0] if isinstance(payload, list) and payload else payload
        sys.exit(f"Världsbanken svarade utan data: {json.dumps(msg, ensure_ascii=False)[:300]}")
    meta, rows = payload[0], payload[1] or []
    if meta.get("pages", 1) > 1 and not quiet:
        print(
            f"# ⚠️ {meta['pages']} sidor, {meta['total']} rader — bara sida 1 hämtad. Smalna av frågan.",
            file=sys.stderr,
        )
    return meta, rows


def fetch_all(path: str, **params) -> list:
    """Every page. The indicator list is 1 498 rows over 3 pages, and the first version
    of this script searched only page 1 — alphabetical, so every SM.* and SP.* indicator
    was invisible and `search "refugee"` returned nothing. A silent truncation in a
    discovery tool is the worst kind: it looks like the data does not exist."""
    rows, page = [], 1
    while True:
        meta, chunk = fetch(path, page=str(page), _quiet=True, **params)
        rows.extend(chunk)
        if page >= meta.get("pages", 1):
            return rows
        page += 1


def cmd_search(args) -> None:
    rows = fetch_all("indicator", source=WDI_SOURCE)
    needle = args.text.lower()
    hits = [i for i in rows if needle in i["name"].lower() or needle in i["id"].lower()]
    for i in hits[: args.limit]:
        print(f"{i['id']:<24} {i['name']}")
    print(f"\n# {len(hits)} träffar av {len(rows)} WDI-indikatorer", file=sys.stderr)


def cmd_countries(args) -> None:
    _, rows = fetch("country")
    for c in rows:
        is_agg = c["region"]["id"] == "NA"
        if is_agg != args.aggregates:
            continue
        print(f"{c['id']:<6} {c['name'].strip()}")


def cmd_get(args) -> None:
    # ⚠️ v2 separates countries with ';', not ','. A comma answers HTTP 200 with
    # {"message":[{"id":"120","key":"Invalid value"}]} — a *successful* response carrying
    # an error, which is why fetch() has to inspect the payload rather than the status.
    # Accept the comma the rest of this toolchain uses and translate it here.
    iso = args.iso.replace(",", ";") if args.iso else "all"
    params = {}
    if args.years:
        params["date"] = args.years
    _, rows = fetch(f"country/{iso}/indicator/{args.indicator}", **params)

    if not args.aggregates:
        # Aggregates are only distinguishable via the country endpoint, so fetch the
        # 78 ids once and filter. Cheap, and it is the whole point of this script.
        _, all_c = fetch("country")
        agg = {c["id"] for c in all_c if c["region"]["id"] == "NA"}
        # The data rows carry the 3-letter id under countryiso3code.
        before = len(rows)
        rows = [r for r in rows if r.get("countryiso3code") not in agg]
        if before != len(rows):
            print(f"# {before - len(rows)} aggregatrader bortfiltrerade (--aggregates tar med dem)", file=sys.stderr)

    rows = [r for r in rows if r["value"] is not None] if not args.keep_null else rows
    if not rows:
        sys.exit("inga rader — fel indikatorkod, fel land eller inga värden för de åren")

    print(f"# {rows[0]['indicator']['value']}", file=sys.stderr)
    if args.csv:
        w = csv.writer(sys.stdout)
        w.writerow(["land", "iso3", "år", "värde"])
        for r in rows:
            w.writerow([r["country"]["value"], r.get("countryiso3code", ""), r["date"], r["value"]])
        return
    for r in rows:
        print(f"{r['country']['value']:<28} {r['date']}  {r['value']}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search", help="sök bland de 1 498 WDI-indikatorerna")
    s.add_argument("text")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(fn=cmd_search)

    s = sub.add_parser("countries", help="lista länder, eller aggregaten")
    s.add_argument("--aggregates", action="store_true", help="visa de 78 aggregaten i stället")
    s.set_defaults(fn=cmd_countries)

    s = sub.add_parser("get", help="hämta en indikator")
    s.add_argument("indicator", help="t.ex. SP.POP.TOTL")
    s.add_argument("--iso", help="SE,SY,IQ (komma; översätts till v2:s semikolon)")
    s.add_argument("--years", help="2000:2024")
    s.add_argument("--aggregates", action="store_true", help="ta med Arab World m.fl. — säg det i bildtexten")
    s.add_argument("--keep-null", action="store_true", help="behåll år utan värde")
    s.add_argument("--csv", action="store_true")
    s.set_defaults(fn=cmd_get)

    args = ap.parse_args()
    args.fn(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
