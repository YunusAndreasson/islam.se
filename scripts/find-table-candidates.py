#!/usr/bin/env python3
"""Hitta stycken som redan jämför parallella ståndpunkter — en tabell utan tabell.

Usage: python scripts/find-table-candidates.py [--min N] [--json] [--top N] [file...]

Syskon till find-chart-candidates.py, och byggd för att den inte räcker: den söker
JÄMFÖRBARA TAL, och en tabell handlar oftast inte om tal alls. De tabeller den här
webbplatsen faktiskt behöver jämför ståndpunkter — vad de fyra rättsskolorna håller i en
fråga, hur tre läsningar av en vers skiljer sig, vad som gäller före och efter en gräns.
Sådant har korpusen gott om, och find-chart-candidates.py ser ingenting av det:
data/articles gav en enda kandidat i 57 filer vid vilken tröskel som helst.

⭐ Det här är ett SPANINGSSKRIPT, inte en grind. Det fäller aldrig ett bygge och avgör
ingenting. Det pekar på stycken där en människa — eller figursteget — ska titta.

Vad som räknas som en kandidat: ett stycke där MINST TRE parallella medlemmar bär var sin
ståndpunkt, eller minst två plus ett uttalat kontrastord. »Parallell« betyder att de fyller
samma roll i meningen: fyra rättsskolor, tre läsningar, två tidpunkter.

⚠️ Kategorifällan flaggas PER STYCKE och inte per sida — samma skäl som
find-chart-candidates.py anger: på sidnivå slog den på 8 av 9 träffar, och »en varning som
alltid är på är en varning ingen läser«. Notera att fällan här bara är en flagga: en tabell
FÅR jämföra de fyra rättsskolorna, det är just den formen CLAUDE.md föreskriver. Det är
shia och sufism som aldrig får bli en rad. check-chart-sources.py håller den skillnaden.
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

# Rättsskolorna, substantiv och adjektiv. Prefix räcker: »hanafi« täcker »hanafitisk«.
#
# ⚠️ Matchas mot fold()-ad text. Utan det missade skriptet »shafi'i« i aktenskap.md — alltså
# just det skrivsätt korpusen faktiskt använder — och rapporterade tre rättsskolor där det
# fanns fyra. Samma vikning som scripts/check-chart-sources.py gör, av samma skäl.
_APOSTROPHES = dict.fromkeys(map(ord, "’'`ʿʾ‘´-"), None)


def fold(text: str) -> str:
    """Vik bort diakriter, apostrofer och bindestreck. Ḥanafī → hanafi."""
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return stripped.translate(_APOSTROPHES).lower()


MADHHABS = ("hanafi", "maliki", "shafii", "hanbali")

# Aldrig en rad i en tabell på den här webbplatsen.
TRAP = re.compile(r"shia|shiit|jafar|tolvshi|imamit|sufi|tariqa|tasawwuf")

# Skribenten jämför redan i prosan. Det är signalen att formen finns men inte syns.
CONTRAST = re.compile(
    r"\b(medan|däremot|till skillnad från|i motsats till|andra menar|andra håller|"
    r"är oense|oenigheten|skiljer sig|delade|tvärtom|säger något annat|"
    r"medan andra|somliga|vissa menar|å ena sidan|å andra sidan|både .{1,20} och)\b",
    re.I,
)

# Uppräkning med ordningstal: »Den första gäller… Den andra gäller…«
ORDINAL = re.compile(
    r"\bden\s+(första|andra|tredje|fjärde|femte|sjätte|sjunde)\b", re.I
)

# Parallella domar — orden en fiqh-jämförelse faktiskt använder.
VERDICT = re.compile(
    r"\b(tillåtet|tillåter|förbjudet|förbjuder|ogillat|ogillar|rekommenderat|"
    r"rekommenderas|obligatoriskt|villkor|sunna|giltig|ogiltig|räcker inte|"
    r"godtar|underkänner|krävs|krävs inte)\b",
    re.I,
)

# Maskeras bort först: vers- och lagreferenser är inte uppräkningar.
# ⚠️ Ett mönster, inte två. `\d+:\d+` täcker redan `\d{4}:\d+`, så en separat LAW_REF som
# kördes efteråt kunde aldrig matcha någonting — den läste som ett skydd som inte fanns.
REF = re.compile(r"\d+:\d+")


def strip_frontmatter(text: str) -> tuple[str, int]:
    """(brödtext, radnummer där den börjar)."""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            return parts[2], parts[0].count("\n") + parts[1].count("\n") + 2
    return text, 1


def paragraphs(body: str, offset: int) -> list[tuple[int, str]]:
    out, line = [], offset
    for block in body.split("\n\n"):
        stripped = block.strip()
        # Rubriker, citat, fotnoter och figurblock är inte kandidatstycken.
        if stripped and not stripped.startswith(("#", ">", "[^", "```", "|", "-", "*")):
            out.append((line, stripped))
        line += block.count("\n") + 2
    return out


def members(text: str) -> tuple[str, list[str]]:
    """(sorts-etikett, de parallella medlemmarna) — den starkaste formen vinner."""
    folded = fold(text)
    found = [m for m in MADHHABS if m in folded]
    if len(found) >= 2:
        return "rättsskolor", found

    ordinals = [m.group(1).lower() for m in ORDINAL.finditer(text)]
    if len(set(ordinals)) >= 2:
        return "uppräkning", sorted(set(ordinals))

    verdicts = [m.group(1).lower() for m in VERDICT.finditer(text)]
    if len(set(verdicts)) >= 3:
        return "domar", sorted(set(verdicts))

    return "", []


def scan(path: Path) -> dict | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    body, offset = strip_frontmatter(text)
    body = REF.sub(" ", body)

    passages = []
    for line, para in paragraphs(body, offset):
        kind, found = members(para)
        if not found:
            continue
        signal = bool(CONTRAST.search(para))
        if len(found) < 3 and not signal:
            continue
        passages.append({
            "line": line,
            "kind": kind,
            "members": found,
            "signal": signal,
            "text": para[:240],
            "trap": bool(TRAP.search(fold(para))),
        })

    if not passages:
        return None
    score = sum(len(p["members"]) * (2.0 if p["signal"] else 1.0) for p in passages)
    return {
        "path": str(path),
        "score": round(score, 1),
        "trap": any(p["trap"] for p in passages),
        "passages": passages,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--min", type=float, default=3.0, help="lägsta poäng att visa")
    ap.add_argument("--top", type=int, default=0, help="visa bara de N främsta")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    paths = args.files or sorted(
        p for d in ("data/articles", "data/svar", "data/fordjupning")
        for p in Path(d).glob("*.md")
    )
    rows = [r for r in (scan(p) for p in paths) if r and r["score"] >= args.min]
    rows.sort(key=lambda r: -r["score"])
    if args.top:
        rows = rows[: args.top]

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0

    if not rows:
        print("Inga tabellkandidater.")
        return 0
    for r in rows:
        print(f"\n\033[1m{r['path']}\033[0m  {r['score']}")
        for p in r["passages"]:
            marks = ("⭐" if p["signal"] else "  ") + ("⛔" if p["trap"] else "  ")
            print(f"  {marks} rad {p['line']:<5} {p['kind']}: {', '.join(p['members'])}")
            print(f"        {p['text'][:150]}…")
    print(f"\n{len(rows)} sidor med kandidater. Spaning, inte grind — en människa avgör.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
