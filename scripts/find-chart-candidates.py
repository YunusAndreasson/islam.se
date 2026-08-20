#!/usr/bin/env python3
"""Find passages where a chart would carry the argument.

Usage: python scripts/find-chart-candidates.py [--min N] [--json] [file...]

Defaults to data/articles/*.md, data/fordjupning/*.md and data/svar/*.md.

This is a DISCOVERY script, not a gate. It never fails a build and it decides
nothing — it hands a human a ranked list of places to look. The judgement it
cannot make is the one that matters, and `article-charts/SKILL.md` states it:
does the chart carry the argument, or does it repeat a sentence?

⚠️ WHY RAW NUMERIC DENSITY IS THE WRONG SIGNAL. The first version of this script
ranked pages by how many numbers they contained, and put `sunni-och-shia.md` on
top with 110. Almost all of them were hijri years, hadith numbers and folio
counts — a corpus about the seventh century is full of integers that no chart
could ever hold. What a chart needs is three or more numbers *of the same kind,
measuring the same thing*, so the filter below is for comparability, not volume.
Measured 2026-08-20: density ranked 103 pages, comparability ranked 13, and the
13 were the ones worth reading.

⛔ THE CATEGORY TRAP IS FLAGGED PER PASSAGE, NOT PER PAGE. A dataset that breaks
muslim congregations down by *inriktning* scores well precisely because it has
several comparable numbers — that is what makes it dangerous. `check-chart-sources.py`
blocks it once a spec exists; this script only marks the passage with ⛔ so the
reader knows before spending an hour on it. Page-level was tried first and fired
on 8 of 9 hits — a warning that is always on is a warning nobody reads. See CLAUDE.md and [[no-shia-content]].
"""

import argparse
import glob
import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_GLOBS = (
    "data/articles/*.md",
    "data/fordjupning/*.md",
    "data/svar/*.md",
)

# Units that make two numbers comparable. A bare integer is not on this list:
# "år 833" and "sura 18" are numbers, not quantities.
UNITS = (
    "procent|%|miljoner|miljarder|tusen|personer|invånare|moskéer|församlingar"
    r"|kronor|kilo|ton|gånger|barn|kvinnor|män|elever|kommuner|länder"
)

QUANTITY = re.compile(
    rf"""(?<![\d:.\-])
      (\d{{1,3}}(?:[   ]\d{{3}})+     # 196 000 (any space)
        |\d+[,.]\d+                              # 12,5
        |\d{{1,4}})                              # 84
      \s*({UNITS})\b
    """,
    re.X | re.I,
)

# A magnitude written with a thousands separator is comparable even unitless —
# "203 663" is always a count of something.
MAGNITUDE = re.compile(r"(?<![\d:.\-])(\d{1,3}(?:[   ]\d{3})+)")

# A decimal is a measurement; nothing in this corpus writes a year or a sura as one.
# Swedish states the unit once and then drops it — "29,3 kilo per person …, före
# fjäderfä med 23,4 och nöt med 22,4" is three comparable numbers wearing one unit,
# and the unit-anchored pattern above sees only the first. Measured 2026-08-20: this
# rule alone surfaced griskott.md's meat-consumption chart, the clearest in the corpus.
DECIMAL = re.compile(r"(?<![\d:.\-])(\d{1,3},\d+)(?!\s*(?:procent|%))")

# House style spells small numbers out, so a paragraph can compare three quantities
# without three digits in it. `vid-samma-bord.md` is the case that forced this rule:
# »omkring 260 000 … till en halv miljon … och 810 000 … en spridning på det
# tredubbla« is the single best chart in the essay corpus, and a digit-only scan
# sees two numbers and skips the page entirely.
WORDNUM = re.compile(
    r"\b(?:en\s+halv|halva|en\s+tredjedel|två\s+tredjedelar|tre\s+fjärdedelar"
    r"|en\s+fjärdedel|en\s+femtedel|vart\s+femte|vartannat"
    r"|(?:en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv|tjugo|trettio"
    r"|fyrtio|femtio|sextio|sjuttio|åttio|nittio|hundra)\s+"
    r"(?:miljon(?:er)?|miljard(?:er)?|tusen|procent))\b",
    re.I,
)

QURAN_REF = re.compile(r"\d+:\d+")
LAW_REF = re.compile(r"\d{4}:\d+")
FOOTNOTE_DEF = re.compile(r"^\[\^")

# Phrases that mark a number as load-bearing — the author is already comparing.
SIGNAL = re.compile(
    r"\bspänner från|\bmot\b|\bmedan\b|\bjämfört\b|\bföre\b|\befter\b|\bstiger\b"
    r"|\bsjunker\b|\bandelen\b|\bspridning|\bmäter olika|\bvet ingen|\bfördel",
    re.I,
)

# Reader questions with quantitative intent, read out of the page's own frontmatter.
# `keywords:` and `faq:` are not decoration — they are a transcript of what the reader
# typed into a search box. A pillar page whose own keyword asks »hur många moskéer finns
# i Sverige« and answers it only in prose has a chart-shaped hole in it, and no scan of
# the body will ever find that hole, because the body is what is missing.
QUANT_QUESTION = re.compile(
    r"hur många|hur stor|hur vanlig|hur ofta|\bantal\b|\bandel\b|statistik|procent|finns det",
    re.I,
)
FM_ENTRY = re.compile(r'^  - (?:q: )?"([^"]+)"', re.M)

CATEGORY_TRAP = re.compile(
    r"shia|shiit|jaʿfar|jafarit|tolvshi|imamit|sufi|tariqa|tasawwuf"
    r"|hanafit|malikit|shafiit|hanbalit",
    re.I,
)


def strip_frontmatter(text: str) -> tuple[str, int]:
    """Return (body, line offset) so reported line numbers match the file."""
    if not text.startswith("---"):
        return text, 0
    end = text.find("\n---", 3)
    if end == -1:
        return text, 0
    head = text[: end + 4]
    return text[end + 4 :], head.count("\n")


def paragraphs(body: str, offset: int):
    line = offset + 1
    for block in body.split("\n\n"):
        stripped = block.strip()
        if stripped and not stripped.startswith(("#", "|", "```", ">")) and not FOOTNOTE_DEF.match(stripped):
            yield line, re.sub(r"\s+", " ", stripped)
        line += block.count("\n") + 2


def quantities(text: str):
    masked = LAW_REF.sub(" ", QURAN_REF.sub(" ", text))
    for m in QUANTITY.finditer(masked):
        unit = m.group(2).lower()
        yield m.group(1), ("procent" if unit == "%" else unit)
    for m in MAGNITUDE.finditer(masked):
        yield m.group(1), "antal"
    for m in DECIMAL.finditer(masked):
        yield m.group(1), "mått"
    # Spelled-out quantities join the "antal" bucket, since that is where their
    # digit-written siblings land ("810 000" beside "en halv miljon").
    for m in WORDNUM.finditer(masked):
        word = re.sub(r"\s+", " ", m.group(0).lower())
        yield word, ("procent" if word.endswith("procent") else "antal")


def scan(path: str) -> dict | None:
    raw = open(path, encoding="utf-8").read()
    body, offset = strip_frontmatter(raw)

    found = []
    for line, para in paragraphs(body, offset):
        by_unit = defaultdict(list)
        for value, unit in quantities(para):
            by_unit[unit].append(value)
        # Three comparable numbers in ONE paragraph is the strongest shape:
        # the author has already done the comparison in prose.
        for unit, values in by_unit.items():
            # Three DISTINCT values. The hadith about the thirds of the stomach —
            # "en tredjedel för mat, en tredjedel för dryck, en tredjedel för
            # andning" — is three quantities and no chart at all.
            if len(values) >= 3 and len(set(values)) >= 2:
                found.append(
                    {
                        "line": line,
                        "unit": unit,
                        "values": values,
                        "signal": bool(SIGNAL.search(para)),
                        "text": para[:260],
                    }
                )

    if not found:
        return None

    for f in found:
        f["trap"] = bool(CATEGORY_TRAP.search(f["text"]))

    found.sort(key=lambda f: (-f["signal"], -len(f["values"])))
    score = sum(len(f["values"]) * (2.0 if f["signal"] else 1.0) for f in found)
    return {
        "path": os.path.relpath(path, ROOT),
        "score": round(score, 1),
        "trap": any(f["trap"] for f in found),
        "passages": found,
    }


def gaps(paths: list[str]) -> None:
    """What the page's own readers ask, that the page answers only in words."""
    print("\n" + "=" * 74)
    print("  LÄSARFRÅGOR MED SIFFERSVAR — ur sidans egna keywords: och faq:")
    print("=" * 74)
    for path in paths:
        raw = open(path, encoding="utf-8").read()
        head = raw.split("\n---\n", 1)[0]
        hits = [q for q in FM_ENTRY.findall(head) if QUANT_QUESTION.search(q)]
        if not hits:
            continue
        rel = os.path.relpath(path, ROOT)
        print(f"\n  {rel}")
        for q in hits:
            mark = "⛔" if CATEGORY_TRAP.search(q) else "  "
            print(f"   {mark} {q}")
    print("\n  ⛔ = frågan i sig är kategorifällan. Hög sökvolym, och den ska inte besvaras")
    print("       med ett diagram. Se CLAUDE.md.")
    print("  Rangordna resten på: finns en verifierad källa · kullkastar den läsarens")
    print("       antagande · står siffran inte redan på nio andra sidor.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--min", type=float, default=3.0, help="lägsta poäng att visa")
    ap.add_argument("--json", action="store_true", help="maskinläsbar utdata")
    ap.add_argument("--top", type=int, default=0, help="visa bara de N främsta")
    ap.add_argument("--gaps", action="store_true", help="läsarfrågor som saknar siffersvar")
    ap.add_argument("files", nargs="*")
    args = ap.parse_args()

    paths = args.files or [
        p for g in DEFAULT_GLOBS for p in sorted(glob.glob(os.path.join(ROOT, g)))
    ]

    if args.gaps:
        gaps(paths)
        return 0

    rows = [r for r in (scan(p) for p in paths) if r and r["score"] >= args.min]
    rows.sort(key=lambda r: -r["score"])
    if args.top:
        rows = rows[: args.top]

    if args.json:
        json.dump(rows, sys.stdout, ensure_ascii=False, indent=1)
        print()
        return 0

    for r in rows:
        print(f"\n{'=' * 74}")
        flag = "  ⛔ KATEGORIFÄLLA" if r["trap"] else ""
        print(f"  {r['path']}   ({r['score']:.0f}p){flag}")
        print("=" * 74)
        for p in r["passages"][:3]:
            mark = "⛔" if p["trap"] else ("⭐" if p["signal"] else "  ")
            print(f"\n {mark} rad {p['line']:>4}  {len(p['values'])}× {p['unit']}: {', '.join(p['values'][:6])}")
            print(f"      {p['text']}")

    starred = sum(1 for r in rows for p in r["passages"] if p["signal"])
    print(f"\n--- {len(rows)} sidor, {starred} stycken där texten redan jämför ---")
    print("⭐ = författaren jämför redan i prosan; där bär ett diagram argumentet.")
    print("⛔ = stycket nämner inriktning — aggregera till »muslimska samfund«, eller hoppa över.")
    print("Nästa steg: skill:article-charts. Ett omdöme per sida — men ett enda bygge på slutet.")
    print("Snabbgrind under arbetet: pnpm chart:check <fil>  (0,6 s mot pnpm verify 2 m 40 s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
