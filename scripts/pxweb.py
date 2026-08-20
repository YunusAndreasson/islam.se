#!/usr/bin/env python3
"""One command for the PxWeb statistics APIs, so a chart's numbers cost one call.

    python3 scripts/pxweb.py search "köttkonsumtion"                 # SCB, hitta tabell
    python3 scripts/pxweb.py ls jordbruksverket                      # bläddra i trädet
    python3 scripts/pxweb.py ls jordbruksverket "Konsumtion av livsmedel"
    python3 scripts/pxweb.py meta jordbruksverket "Konsumtion av livsmedel/JO1301K2.px"
    python3 scripts/pxweb.py get  jordbruksverket "Konsumtion av livsmedel/JO1301K2.px" \\
            --sel "Vara=5,6,8,10" --sel "Variabel=1" --sel "År=65"
    python3 scripts/pxweb.py meta scb TAB4822
    python3 scripts/pxweb.py get  scb TAB4822 --sel "Tid=2024" --sel "Fodelseland=SY,IQ,SO"

WHY THIS EXISTS. Measured 2026-08-20 while charting `griskott.md`: the figures were taken
from Jordbruksverket's *report page* instead of the table behind it, because getting to the
table meant four hand-written curls through an undocumented tree. The page had dropped a
category without saying so — fårkött, 1,61 kilo — and the chart shipped with a caveat that
was simply false. The API answered the same question exactly. The round trips were the
reason the page won, so this removes them.

TWO DIALECTS, and they are not compatible:

  classic PxWeb v1 (Jordbruksverket, Kolada-likes) — a browsable tree of folders ending in
    `<TABLE>.px`; GET gives metadata, POST with a `query` body gives data. Value *codes*
    are usually positional indices ("65" is the 66th year), so always run `meta` first.

  PxWebApi 2.0 (SCB) — flat table ids, GET only, selection as `valueCodes[Var]=a,b`.
    No POST, no tree. `search` only works here.

⚠️ SCB is CC0 and needs no key, but limits to 30 calls per 10 seconds. This script makes
one call per invocation, which is well inside that; a loop over many tables is not.
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

# Verified by live call 2026-08-20. Add with `probe` (below) — do not guess a host.
BASES = {
    "scb": ("v2", "https://statistikdatabasen.scb.se/api/v2"),
    "jordbruksverket": (
        "v1",
        "https://statistik.jordbruksverket.se/PXWeb/api/v1/sv/Jordbruksverkets statistikdatabas",
    ),
    "energimyndigheten": ("v1", "https://pxexternal.energimyndigheten.se/api/v1/sv"),
    "tillvaxtanalys": ("v1", "https://statistik.tillvaxtanalys.se/PXWeb/api/v1/sv"),
    "skogsstyrelsen": ("v1", "https://pxweb.skogsstyrelsen.se/api/v1/sv"),
    "konjunkturinstitutet": ("v1", "https://statistik.konj.se/PXWeb/api/v1/sv"),
    "folkhalsomyndigheten": (
        "v1",
        "https://fohm-app.folkhalsomyndigheten.se/Folkhalsodata/api/v1/sv",
    ),
}

# The host is unpredictable and the path is not. Energimyndigheten answers on `/api/v1/sv`,
# Jordbruksverket and Tillväxtanalys on `/PXWeb/api/v1/sv`, Folkhälsomyndigheten on
# `/Folkhalsodata/api/v1/sv`. Guessing hosts by hand found three of six on the first pass
# and produced a wrong conclusion — that few Swedish agencies run PxWeb — from a sample of
# five. They do; `probe` is how you check instead of assuming.
PROBE_PATHS = (
    "/PXWeb/api/v1/sv",
    "/pxweb/api/v1/sv",
    "/api/v1/sv",
    "/Folkhalsodata/api/v1/sv",
    "/PXWeb/api/v1/en",
)

TIMEOUT = 30


def fetch(url: str, body: dict | None = None) -> object:
    """GET, or POST when a body is given. Returns parsed JSON."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        urllib.parse.quote(url, safe=":/?&=%,[]*"),
        data=data,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            # A UA is politeness, not a workaround: these are public open-data endpoints.
            "User-Agent": "islam.se chart tooling (open data)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read().decode("utf-8-sig")
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} för {url}\n{e.read()[:400].decode('utf-8', 'replace')}")
    except urllib.error.URLError as e:
        sys.exit(f"nätverksfel för {url}: {e.reason}")
    if raw.lstrip().startswith("<"):
        sys.exit(f"{url} svarade med HTML, inte JSON — fel rot? (se BASES i den här filen)")
    return json.loads(raw)


def cmd_probe(args) -> None:
    """Find the PxWeb API root on a host, if it has one."""
    for host in args.hosts:
        host = host.removeprefix("https://").removeprefix("http://").rstrip("/")
        hit = None
        for path in PROBE_PATHS:
            url = f"https://{host}{path}"
            try:
                req = urllib.request.Request(
                    urllib.parse.quote(url, safe=":/?&=%"),
                    headers={"Accept": "application/json", "User-Agent": "islam.se chart tooling (open data)"},
                )
                with urllib.request.urlopen(req, timeout=8) as r:
                    body = r.read(200).decode("utf-8-sig", "replace").lstrip()
                if body[:1] in "[{":
                    hit = (path, body[:90].replace("\n", " "))
                    break
            except Exception:  # noqa: BLE001 — a miss is the expected case here
                continue
        if hit:
            print(f"\x1b[32m✓\x1b[0m {host}\n    rot:  https://{host}{hit[0]}\n    svar: {hit[1]}")
            print(f'    lägg till i BASES: "<namn>": ("v1", "https://{host}{hit[0]}"),')
        else:
            print(f"  – {host} — ingen PxWeb-rot på {len(PROBE_PATHS)} kända mönster")


def cmd_search(args) -> None:
    """SCB only — PxWebApi 2.0 has a table search; classic PxWeb does not."""
    url = f"{BASES['scb'][1]}/tables?query={args.text}&lang=sv&pageSize={args.limit}"
    for t in fetch(url).get("tables", []):
        period = f"{t.get('firstPeriod', '?')}–{t.get('lastPeriod', '?')}"
        print(f"{t['id']:<12} {period:<14} {t['label']}")


def cmd_ls(args) -> None:
    kind, root = BASES[args.base]
    if kind == "v2":
        sys.exit("scb har inget träd — använd `search` i stället")
    url = f"{root}/{args.path}" if args.path else root
    for node in fetch(url):
        if "dbid" in node:
            print(f"[db] {node['dbid']}")
        else:
            mark = "  " if node.get("type") == "t" else "▸ "
            print(f"{mark}{node['id']:<24} {node['text']}")


def cmd_meta(args) -> None:
    kind, root = BASES[args.base]
    url = f"{root}/tables/{args.table}/metadata?lang=sv" if kind == "v2" else f"{root}/{args.table}"
    meta = fetch(url)
    if kind == "v2":
        print(meta.get("label", ""))
        for code, v in (meta.get("dimension") or {}).items():
            cats = (v.get("category") or {}).get("label") or {}
            print(f"--- {code} | {v.get('label','')} | n = {len(cats)}")
            for k, t in list(cats.items())[: args.show]:
                print(f"      {k} = {t}")
        return
    print(meta.get("title", ""))
    for v in meta.get("variables", []):
        pairs = list(zip(v["values"], v["valueTexts"]))
        print(f"--- {v['code']} | {v['text']} | n = {len(pairs)}")
        for code, text in pairs[: args.show]:
            print(f"      {code} = {text}")
        if len(pairs) > args.show:
            last = pairs[-1]
            print(f"      … sista: {last[0]} = {last[1]}")


def cmd_get(args) -> None:
    kind, root = BASES[args.base]
    sel = {}
    for s in args.sel:
        if "=" not in s:
            sys.exit(f"--sel vill ha VARIABEL=värde,värde — fick »{s}«")
        k, v = s.split("=", 1)
        sel[k] = v.split(",")

    if kind == "v2":
        q = "&".join(f"valueCodes[{k}]={','.join(v)}" for k, v in sel.items())
        url = f"{root}/tables/{args.table}/data?lang=sv&outputFormat=csv&{q}"
        req = urllib.request.Request(
            urllib.parse.quote(url, safe=":/?&=%,[]*"),
            headers={"User-Agent": "islam.se chart tooling (open data)"},
        )
        # ⚠️ This branch used raw urlopen and leaked a 40-line traceback on any HTTP error,
        # which says nothing about what was wrong with the query. SCB answers 400 with a
        # body that names the offending value code — print that instead.
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                raw = r.read()
            # ⚠️ SCB serves `outputFormat=csv` as ISO-8859-1, not UTF-8. Decoding it as
            # UTF-8 raises on the first »å« in a country name — position 76, which is the
            # header row, so the failure looks like a broken request rather than a charset
            # problem. Fall back rather than guess from the Content-Type, which SCB does
            # not always set.
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = raw.decode("iso-8859-1")
            print(text.strip())
        except urllib.error.HTTPError as e:
            detail = e.read()[:600].decode("utf-8", "replace").strip()
            sys.exit(f"HTTP {e.code} från SCB.\n{detail}\n\nKör `meta scb {args.table}` och kontrollera värdekoderna.")
        except urllib.error.URLError as e:
            sys.exit(f"nätverksfel: {e.reason}")
        return

    body = {
        "query": [
            {"code": k, "selection": {"filter": "item", "values": v}} for k, v in sel.items()
        ],
        "response": {"format": "json"},
    }
    out = fetch(f"{root}/{args.table}", body)
    # Classic PxWeb answers with `key` (the value codes) and `values`. Print the codes
    # alongside, since they are positional and meaningless without `meta`.
    for row in out.get("data", []):
        print(f"{','.join(row['key']):<16} {'  '.join(row['values'])}")
    for c in out.get("comments", []):
        print(f"# {c['variable']}={c['value']}: {c['comment'].strip()}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("probe", help="leta PxWeb-rot på en värd")
    s.add_argument("hosts", nargs="+", metavar="VÄRD")
    s.set_defaults(fn=cmd_probe)

    s = sub.add_parser("search", help="sök tabell (endast SCB)")
    s.add_argument("text")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(fn=cmd_search)

    s = sub.add_parser("ls", help="bläddra i trädet (klassisk PxWeb)")
    s.add_argument("base", choices=sorted(BASES))
    s.add_argument("path", nargs="?", default="")
    s.set_defaults(fn=cmd_ls)

    s = sub.add_parser("meta", help="variabler och värdekoder")
    s.add_argument("base", choices=sorted(BASES))
    s.add_argument("table")
    s.add_argument("--show", type=int, default=40, help="hur många värden per variabel")
    s.set_defaults(fn=cmd_meta)

    s = sub.add_parser("get", help="hämta data")
    s.add_argument("base", choices=sorted(BASES))
    s.add_argument("table")
    s.add_argument("--sel", action="append", default=[], metavar="VAR=a,b")
    s.set_defaults(fn=cmd_get)

    args = ap.parse_args()
    args.fn(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
