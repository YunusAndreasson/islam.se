#!/usr/bin/env python3
"""Check that every endpoint in DATAKALLOR.md still answers.

    python3 scripts/check-datakallor.py            # alla URL:er
    python3 scripts/check-datakallor.py --slow     # även långsamma/stora filer
    python3 scripts/check-datakallor.py --json

⚠️ NOT part of `pnpm verify`, and it must not become part of it. CLAUDE.md's testing
philosophy is explicit: never add I/O, network calls or sleeps to the test suite. This
reaches fifteen public agencies over the network and takes tens of seconds. Run it when
you are about to use the catalogue, or every few months.

WHY THIS EXISTS. `DATAKALLOR.md` is a reference file an agent trusts without re-checking —
that is its whole purpose. So a stale entry is worse than a missing one: it produces a
confident wrong answer instead of a search. Measured 2026-08-20, the file had shipped for
one day and already contained a false claim (that Jordbruksverket does not report fårkött
separately; it does, 1,61 kilo, in JO1301K2.px). That claim came from reading a report
page instead of the table. A catalogue that nobody re-runs decays into exactly that.

What this can and cannot see: it checks that a URL still resolves. It cannot check that a
table still contains the column you cited, or that a figure written into the prose here is
still current. Those need the API call the entry exists to make cheap.
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DOC = Path(__file__).resolve().parent.parent / ".claude/skills/article-charts/DATAKALLOR.md"

# Markdown link targets, bare URLs in backticks, and URLs on their own in a code block.
URL_RE = re.compile(r"https?://[^\s`)\]<>\"']+")

# ⚠️ THE FIRST VERSION OF THIS SCRIPT REPORTED SIX DEAD LINKS AND ZERO WERE DEAD.
# Five were URL *templates* the catalogue prints on purpose — `{dataset}`, `{slug}`,
# `?q=…`, a bare `&query=` — and the sixth was this regex truncating a URL that legitimately
# contains spaces (Socialstyrelsen's `…ekonomiskt bistand.zip`, which the entry itself
# says to percent-encode). A checker that cries wolf is not read, which is the same lesson
# the ⛔ category flag in find-chart-candidates.py had to learn. Skip what is not an address.
# ⚠️ Write placeholders as {NAMN}, never <NAMN>. URL_RE stops at `<`, so a documented
# template like `…/rest/data/X/.<INDIKATOR>..` is extracted as a truncated but otherwise
# valid-looking URL, which then times out and is reported as a dead link. Braces stay
# inside the match and are caught here. Cost one false alarm 2026-08-20.
TEMPLATE = ("{", "}", "…", "<", ">")


def is_template(url: str) -> bool:
    """A documentation placeholder rather than a fetchable address."""
    return any(t in url for t in TEMPLATE) or url.endswith(("=", "?", "/api/v1/"))

# Hosts that are slow or serve large files; skipped unless --slow.
SLOW = ("bra.se/download", ".xlsx", ".pdf", ".zip")

UA = {"User-Agent": "islam.se DATAKALLOR link check (open data)"}
TIMEOUT = 25


def check(url: str) -> tuple[str, int | str, str]:
    """Return (url, status, note). GET, not HEAD — several agencies 405 a HEAD."""
    safe = urllib.parse.quote(url, safe=":/?&=%,[]*#+~@!$\'()")
    req = urllib.request.Request(safe, headers=UA, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(400)
            ctype = r.headers.get("Content-Type", "")
            note = ""
            # An endpoint documented as an API that now answers HTML is the failure mode
            # that matters most: it looks alive and returns nothing usable.
            # Only a *data* path serving HTML is a finding; an API root that serves its
            # own documentation page is normal and was pure noise in the first run.
            if "/api/" in url and body.lstrip().startswith(b"<") and not url.rstrip("/").endswith(
                ("v1", "v2", "v3", "api")
            ):
                note = "svarar HTML på en API-väg"
            if r.url.rstrip("/") != url.rstrip("/"):
                note = (note + "; " if note else "") + f"omdirigerad → {r.url}"
            return (url, r.status, note or ctype.split(";")[0])
    except urllib.error.HTTPError as e:
        return (url, e.code, "HTTP-fel")
    except Exception as e:  # noqa: BLE001 — every network failure is the same finding here
        return (url, "—", f"{type(e).__name__}: {e}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--slow", action="store_true", help="ta med PDF/Excel/nedladdningar")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if not DOC.exists():
        sys.exit(f"hittar inte {DOC}")

    urls, skipped, templates = [], [], []
    for u in dict.fromkeys(URL_RE.findall(DOC.read_text(encoding="utf-8"))):
        u = u.rstrip(".,;")
        if is_template(u):
            templates.append(u)
        elif args.slow or not any(s in u for s in SLOW):
            urls.append(u)
        else:
            skipped.append(u)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check, urls))

    if args.json:
        json.dump([{"url": u, "status": s, "note": n} for u, s, n in results], sys.stdout, ensure_ascii=False, indent=1)
        print()
        return 0

    bad = [r for r in results if not (isinstance(r[1], int) and r[1] < 400)]
    odd = [r for r in results if r not in bad and ("HTML" in r[2] or "omdirigerad" in r[2])]

    for label, rows in (("\x1b[31mSVARAR INTE\x1b[0m", bad), ("\x1b[33mVÄRT ATT TITTA PÅ\x1b[0m", odd)):
        if rows:
            print(f"\n=== {label} ({len(rows)}) ===")
            for u, s, n in rows:
                print(f"  {str(s):>4}  {u}\n        {n}")

    print(f"\n{'=' * 72}")
    print(
        f"  {len(results)} URL:er — {len(bad)} döda, {len(odd)} att titta på, "
        f"{len(skipped)} hoppade över (--slow), {len(templates)} mallar"
    )
    print("=" * 72)
    print("  Det här mäter att länken svarar, inte att tabellen har kvar din kolumn.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
