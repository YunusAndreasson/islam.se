#!/usr/bin/env python3
"""Kontrollera att varje ```chart-block bär en källa som går att kontrollera.

Ett diagram är den mest auktoritativa form en siffra kan anta på en sida. Läsaren
läser en stapel som ett faktum — den har inga hedges, ingen »omkring«, ingen
brasklapp. Därför gäller samma krav som för en fotnot i prosan, och lite till.

Fem kontroller:

  SAKNAD KÄLLA    Blocket saknar `source:`. Blockerande. Parsern vägrar redan ett
                  sådant block, så det här fångar det innan bygget ens startar.

  DÖD URL         `sourceUrl:` svarar inte (404, DNS-fel). Rätt åtgärd är att ta
                  bort url-raden och behålla källans namn.
                  ⚠️ En källa utan länk är korrekt; en påhittad länk är en
                  förfalskning. Samma regel som scripts/check-source-urls.py.

  OSAMMANHÄNGANDE Diagrammets källa finns inte i sidans egen apparat. På en
                  fördjupning eller ett svar ska den ligga i `sources:` i
                  frontmatter, i en essä i en fotnot. Annars ser läsaren källan
                  bara i bildtexten, och check-source-urls.py granskar den aldrig.

  KATEGORIFÄLLA   En etikett, serie eller enhet nämner shia, sufism eller en
                  rättsskola som en egen kategori. ⛔ Blockerande. Se CLAUDE.md:
                  en »varav«-uppdelning av samfundsstatistik behöver inte posten
                  för att vara korrekt, så den ska utelämnas. Aggregera till
                  `muslimska samfund`, eller låt diagrammet vara.

  ODATERAD        Källan nämner inget år. En siffra utan årtal åldras utan att
                  synas, och den här webbplatsen står kvar i tio år.

Användning:
    python3 scripts/check-chart-sources.py data/fordjupning/*.md
    python3 scripts/check-chart-sources.py data/articles/*.md --offline

Slutkod 1 om någon blockerande defekt hittas.
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

FENCE = re.compile(r"^```chart[ \t]*\n(.*?)^```[ \t]*$", re.M | re.S)
# ⚠️ Historical sources carry historical years. This pattern matched only 1800–2099 and
# so flagged »Årtalen som de anges i artikeln, 632–661« as undated. Accept any 3–4 digit
# year, but not one welded to letters, so a table id like TAB6658 is not read as a date.
YEAR = re.compile(r"(?<![A-Za-z0-9])\d{3,4}(?![0-9])")

# Samma mönster som CLAUDE.md föreskriver att man grepar varje utkast med.
CATEGORY_TRAP = re.compile(
    r"shia|shiit|ja[ʿ'`]?far|jafarit|tolvshi|imamit|sufi|tariqa|tasawwuf|"
    r"hanafit|malikit|shafiit|hanbalit",
    re.I,
)

ERROR, WARN = "error", "warn"


def blocks(text: str) -> list[tuple[int, str]]:
    """Varje chart-block med den rad det börjar på."""
    out = []
    for m in FENCE.finditer(text):
        out.append((text[: m.start()].count("\n") + 1, m.group(1)))
    return out


def scalar(body: str, key: str) -> str | None:
    m = re.search(rf"^{key}:[ \t]*(.+)$", body, re.M)
    return m.group(1).strip() if m else None


def labels(body: str) -> list[str]:
    """Etiketterna under `data:` plus serienamnen och enheten."""
    out: list[str] = []
    in_data = False
    for line in body.split("\n"):
        if line.strip() == "data:":
            in_data = True
            continue
        if in_data and line.startswith((" ", "\t")) and ":" in line:
            out.append(line.split(":", 1)[0].strip())
    for key in ("series", "unit", "caption", "note"):
        value = scalar(body, key)
        if value:
            out.extend(p.strip() for p in value.split("|"))
    return out


def url_status(url: str, timeout: float) -> int | None:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "islam.se-linkcheck"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def check(path: Path, offline: bool, timeout: float) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    frontmatter = text.split("---", 2)[1] if text.startswith("---") else ""
    body_after = text.split("---", 2)[2] if text.startswith("---") else text
    hits: list[dict] = []

    for line, body in blocks(text):
        source = scalar(body, "source")
        if not source:
            hits.append({"sev": ERROR, "line": line, "rule": "saknad källa",
                         "msg": "blocket saknar source:"})
            continue

        if not YEAR.search(source):
            hits.append({"sev": WARN, "line": line, "rule": "odaterad",
                         "msg": f"källan nämner inget årtal: {source[:70]}"})

        trap = CATEGORY_TRAP.search(" | ".join(labels(body)))
        if trap:
            hits.append({"sev": ERROR, "line": line, "rule": "kategorifällan",
                         "msg": f"»{trap.group(0)}« används som kategori — aggregera "
                                f"eller stryk diagrammet (CLAUDE.md)"})

        # Källan ska också stå i sidans egen apparat, inte bara i bildtexten.
        stem = re.split(r"[,(]", source)[0].strip()
        if stem and stem not in frontmatter and stem not in body_after.replace(body, ""):
            hits.append({"sev": WARN, "line": line, "rule": "osammanhängande",
                         "msg": f"»{stem[:50]}« finns inte i sidans sources: eller fotnoter"})

        url = scalar(body, "sourceUrl")
        if url and not offline:
            code = url_status(url, timeout)
            if code is None or code >= 400:
                hits.append({"sev": ERROR, "line": line, "rule": "död url",
                             "msg": f"{url} [{code or 'ingen respons'}] — ta bort raden, "
                                    f"behåll källans namn"})

    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--offline", action="store_true", help="hoppa över URL-kontrollen")
    ap.add_argument("--timeout", type=float, default=8.0)
    args = ap.parse_args()

    total_blocks = 0
    errors = 0
    warnings = 0

    for path in args.files:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        found = blocks(text)
        total_blocks += len(found)
        hits = check(path, args.offline, args.timeout)
        errors += sum(1 for h in hits if h["sev"] == ERROR)
        warnings += sum(1 for h in hits if h["sev"] == WARN)
        if hits:
            print(f"\n  {path.name}")
            for h in sorted(hits, key=lambda x: (x["sev"] != ERROR, x["line"])):
                mark = "✗" if h["sev"] == ERROR else "!"
                print(f"     {mark} {h['rule']:<18} rad {h['line']}")
                print(f"       {h['msg']}")

    print("\n" + "=" * 72)
    print(f"  {len(args.files)} filer, {total_blocks} diagram — {errors} fel, {warnings} varningar")
    print("=" * 72)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
