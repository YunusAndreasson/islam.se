#!/usr/bin/env python3
"""Insert a ```chart block safely, with every check run BEFORE the file is written.

    python3 scripts/add-chart.py data/fordjupning/kalifatet.md --after 167 --spec spec.txt
    cat spec.txt | python3 scripts/add-chart.py <fil> --after-match "Slutet kom i två steg"
    ... --add-source "Brå, tabellsamling|https://bra.se/..."     # även in i frontmatter

WHY THIS EXISTS. Written 2026-08-20 after the same four mistakes had each been made more
than once while adding thirteen charts by hand:

  1. ⚠️ FENCE WELDING. Inserting after a *sentence* that its paragraph continues past
     leaves the closing fence with prose on it — ```` ``` Europeiska fatwarådet… ```` —
     which markdown does not treat as a closing fence, so the reader gets the raw spec.
     Hit on ramadan.md and again on doden.md. This script refuses any line that is not
     the end of a paragraph, and names the correct line instead.
  2. ⚠️ GUESSED ANCHORS. `s.replace(anchor, ...)` with a hand-typed string silently
     matched zero times on konvertering.md and manlig-omskarelse-i-islam.md. `--after-match`
     requires exactly one hit and prints the candidates when it does not get one.
  3. ⚠️ SOURCE NOT IN THE APPARATUS. check-chart-sources.py warns »osammanhängande« when
     the chart's source is absent from `sources:`/footnotes. Hit three times, fixed by
     hand each time. Checked here, with `--add-source` to fix it in the same pass.
  4. ⚠️ DEAD sourceUrl. The UNICEF page answers 403 to a script. Found after writing.
     The URL is fetched before anything is written.

Nothing is written unless every check passes. On success it prints the command to run
`pnpm chart:check`, which is still the thing that proves the spec renders.
"""

import argparse
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REQUIRED = ("type", "source", "data")
TYPES = ("bars", "columns", "line", "slope", "stack")
CATEGORY_TRAP = re.compile(
    r"shia|shiit|jaʿfar|jafarit|tolvshi|imamit|sufi|tariqa|tasawwuf"
    r"|hanafit|malikit|shafiit|hanbalit",
    re.I,
)
UA = {"User-Agent": "islam.se chart tooling"}


def die(msg: str) -> None:
    sys.exit(f"✗ {msg}")


def read_spec(path: str | None) -> str:
    raw = sys.stdin.read() if path in (None, "-") else Path(path).read_text(encoding="utf-8")
    body = raw.strip()
    # Accept a spec with or without its fence, so a block can be pasted either way.
    body = re.sub(r"^```chart\s*\n", "", body)
    body = re.sub(r"\n```\s*$", "", body)
    return body


def check_spec(spec: str) -> dict[str, str]:
    scalars: dict[str, str] = {}
    seen_data = False
    for line in spec.split("\n"):
        if not line.strip():
            continue
        if line.startswith((" ", "\t")):
            if not seen_data:
                die("indragen rad före »data:« — skalärer står i vänsterkanten")
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        if key == "data":
            seen_data = True
            continue
        if seen_data:
            die(f"skalären »{key}« står efter data: — flytta upp den")
        if key in scalars:
            die(f"nyckeln »{key}« står två gånger")
        scalars[key] = value.strip()

    for k in REQUIRED:
        if k != "data" and k not in scalars:
            die(f"saknar »{k}:«")
    if not seen_data:
        die("saknar »data:«")
    if scalars["type"] not in TYPES:
        die(f"okänd type »{scalars['type']}« — en av {', '.join(TYPES)}")

    hits = [line for line in spec.split("\n") if CATEGORY_TRAP.search(line)]
    if hits:
        die(
            "⛔ KATEGORIFÄLLA i specen:\n    "
            + "\n    ".join(h.strip() for h in hits)
            + "\n  Aggregera till »muslimska samfund«, eller hoppa över diagrammet. Se CLAUDE.md."
        )
    return scalars


def check_url(url: str) -> None:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            if r.status >= 400:
                die(f"sourceUrl svarar {r.status}: {url}")
    except urllib.error.HTTPError as e:
        die(
            f"sourceUrl svarar {e.code}: {url}\n"
            "  En källa utan länk är korrekt. Ta bort raden och behåll källans namn."
        )
    except Exception as e:  # noqa: BLE001
        die(f"sourceUrl går inte att nå ({type(e).__name__}): {url}")


def paragraph_end(lines: list[str], n: int) -> bool:
    """Is line n (1-indexed) the last line of a paragraph?"""
    return n >= len(lines) or lines[n].strip() == ""


def resolve_line(lines: list[str], args) -> int:
    if args.after:
        return args.after
    hits = [i + 1 for i, line in enumerate(lines) if args.after_match in line]
    if len(hits) != 1:
        die(
            f"»{args.after_match}« matchar {len(hits)} rader"
            + ("" if not hits else ": " + ", ".join(map(str, hits)))
        )
    return hits[0]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--after", type=int, metavar="RAD", help="infoga efter den här raden")
    g.add_argument("--after-match", metavar="TEXT", help="infoga efter raden som innehåller TEXT")
    ap.add_argument("--spec", help="fil med specen, eller - för stdin")
    ap.add_argument("--add-source", metavar="NAMN|URL", help="lägg också in källan i frontmatter sources:")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        die(f"finns inte: {path}")
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")

    spec = read_spec(args.spec)
    scalars = check_spec(spec)

    n = resolve_line(lines, args)
    if not 1 <= n <= len(lines):
        die(f"rad {n} finns inte (filen har {len(lines)} rader)")
    if lines[n - 1].strip() == "":
        die(f"rad {n} är tom — peka på sista raden i ett stycke")
    if not paragraph_end(lines, n):
        # Find the real end of this paragraph so the message is actionable.
        end = n
        while end < len(lines) and lines[end].strip() != "":
            end += 1
        die(
            f"rad {n} är inte slutet på ett stycke — stycket slutar på rad {end}.\n"
            f"  Att infoga mitt i ett stycke svetsar prosa på den stängande fencen.\n"
            f"  Kör om med --after {end}"
        )

    # ⚠️ check-chart-sources.py warns »odaterad« when the source names no year, and that
    # warning had to be fixed after the fact three times in one session. A source without a
    # year cannot be re-checked by anyone: »Världsbanken, WDI« could be any vintage.
    # ⚠️ Historical sources are dated too. The first version matched only 1800–2099 and
    # rejected »Årtalen som de anges i artikeln, 632–661« on the rightly-guided caliphs.
    # Accept any 3–4 digit year, but not one welded to letters, so a table id like
    # TAB6658 does not count as a date.
    if not re.search(r"(?<![A-Za-z0-9])\d{3,4}(?![0-9])", scalars["source"]):
        die(
            f"källan nämner inget årtal: »{scalars['source']}«\n"
            "  Sätt ut mätåret, utgivningsåret eller »hämtad ÅÅÅÅ«. Utan årtal går uppgiften\n"
            "  inte att kontrollera i efterhand, och check-chart-sources.py varnar ändå."
        )

    if "sourceUrl" in scalars:
        check_url(scalars["sourceUrl"])

    # The source must reach the reader through the page's own apparatus too.
    head = text.split("\n---\n", 1)[0]
    stem = re.split(r"[,–—(]", scalars["source"])[0].strip()
    in_apparatus = stem and (stem in head or re.search(rf"^\[\^.+?\]:.*{re.escape(stem)}", text, re.M))
    # ⚠️ --add-source used to skip this check entirely, which let a mismatched source
    # through on abort.md: the flag added a Socialstyrelsen entry while the spec's source
    # string began »Bygdeman och Ahlenius…«, so check-chart-sources.py still warned
    # »osammanhängande«. A flag that silences a check instead of satisfying it is worse
    # than no flag. The added name must itself contain the stem.
    if not in_apparatus:
        added = args.add_source.partition("|")[0] if args.add_source else ""
        if not (added and stem.lower() in added.lower()):
            die(
                f"»{stem}« finns inte i sidans sources: eller fotnoter.\n"
                + (
                    f"  --add-source lägger in »{added}«, som inte innehåller den strängen — "
                    "då kvarstår varningen.\n"
                    if added
                    else ""
                )
                + "  Citera källan precis som sidan redan citerar den, eller lägg till "
                "en post vars namn börjar likadant."
            )

    block = "```chart\n" + spec + "\n```"
    lines[n:n] = ["", block]

    if args.add_source:
        name, _, url = args.add_source.partition("|")
        if url:
            check_url(url)
        entry = f'  - name: "{name}"' + (f'\n    url: "{url}"' if url else "")
        out = "\n".join(lines)
        if "\nsources:\n" not in out:
            die(
                "sidan har ingen sources:-lista i frontmatter.\n"
                "  Essäer (data/articles) har ingen — de citerar med GFM-fotnoter. Gör så här\n"
                "  i stället, och citera källan med samma namn som fotnoten använder:\n"
                "    1. sätt [^99] sist i den mening som lämnar över till diagrammet\n"
                "    2. lägg definitionen »[^99]: …« sist i filen\n"
                "    3. python3 scripts/renumber-footnotes.py <fil>   ← ger den rätt nummer\n"
                "    4. kör add-chart.py igen, utan --add-source\n"
                "  ⚠️ Fäst inte fotnoten på en mening som redan slutar med en fotnot."
            )
        out = out.replace("\nsources:\n", f"\nsources:\n{entry}\n", 1)
        lines = out.split("\n")

    if args.dry_run:
        print(f"✓ alla kontroller passerar — skulle infoga efter rad {n} i {path}")
        return 0

    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"✓ {path} — diagram infogat efter rad {n}")
    print(f"  nästa: pnpm chart:check {path} && python3 scripts/check-chart-sources.py {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
