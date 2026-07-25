#!/usr/bin/env python3
"""Hitta sidor som säger olika saker om samma sak.

Det här är den enda defektklass som blir VÄRRE av handredigering: den som läser
en sida kan strukturellt inte se de andra 115. Juli-passet standardiserade
uttryckligen ummans storlek till "omkring två miljarder" — och korpusen innehöll
ändå "2 miljarder" och "1,9 miljarder" efteråt. En läsare som jämför två sidor,
eller en AI-sammanfattning som citerar båda, ser motsägelsen direkt.

Tre kontroller:

  siffra   Samma substantivfras med olika tal i olika filer ("miljoner pilgrimer"
           = två på en sida, 1,8 på en annan). Svenska räkneord normaliseras, så
           "två miljarder" och "2 miljarder" räknas som samma uppgift.

  källa    Samma källhänvisning med olika citattext ("Sahīh al-Bukhārī 8" ska
           återges ordagrant lika överallt — huset beslutade det 2026-07-09).

  dubblett Två citat som är nästan men inte riktigt identiska, oavsett källa.
           Fångar samma vers eller hadith översatt på två sätt i systertexter,
           även i essäerna där källan sitter i en fotnot.

Användning:
    python3 scripts/check-cross-page-facts.py data/svar/*.md data/articles/*.md
    python3 scripts/check-cross-page-facts.py --check siffra data/svar/*.md
    python3 scripts/check-cross-page-facts.py --json data/svar/*.md

Slutkod 1 om någon motsägelse hittas.
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

NUMBER_WORDS = {
    "en": 1, "ett": 1, "två": 2, "tre": 3, "fyra": 4, "fem": 5, "sex": 6,
    "sju": 7, "åtta": 8, "nio": 9, "tio": 10, "elva": 11, "tolv": 12,
    "tretton": 13, "fjorton": 14, "femton": 15, "sexton": 16, "sjutton": 17,
    "arton": 18, "nitton": 19, "tjugo": 20, "trettio": 30, "fyrtio": 40,
    "femtio": 50, "sextio": 60, "sjuttio": 70, "åttio": 80, "nittio": 90,
    "hundra": 100, "tusen": 1000,
}
QUALIFIERS = r"(?:omkring|cirka|ca\.?|drygt|knappt|närmare|över|runt|ungefär|minst)"
NUM = r"(?:\d[\d\s  ]*(?:[.,]\d+)?|" + "|".join(NUMBER_WORDS) + r")"
# tal + upp till två efterföljande ord = uppgiftens ämne ("miljarder muslimer")
QUANTITY = re.compile(
    rf"\b(?:{QUALIFIERS}\s+)?({NUM})\s+([a-zåäö]+(?:\s+[a-zåäö]+)?)\b", re.IGNORECASE
)
# Ämnen som är grammatik snarare än fakta
SUBJECT_STOPLIST = {
    "och", "eller", "som", "att", "av", "för", "till", "med", "den", "det",
    "har", "är", "kan", "ska", "skall", "blir", "andra", "första", "ting",
}
# Rena måttord. "hundra år" och "cirka 23 år" handlar inte om samma sak bara för
# att båda slutar på "år" — ett ämne som ENBART består av måttord kastas.
UNIT_ONLY = {
    "år", "ord", "procent", "gram", "dag", "dagar", "dygn", "timmar", "minuter",
    "månad", "månader", "veckor", "gång", "gånger", "meter", "kilo", "delar",
    "del", "led", "steg", "slag", "typer", "former", "punkter", "saker",
    "sidan", "sidor", "rader", "sätt", "grader", "tal", "antal", "procentenheter",
}

# ── Faktaregistret ────────────────────────────────────────────
# Husets beslutade uppgifter. Generisk sifferextraktion visade sig vara fel
# verktyg — ett substantiv är ingen stabil faktaidentitet ("fem villkor" och
# "fyra villkor" räknar olika saker). Det som fungerar är ett kuraterat register:
# noll brus, och det gör husbesluten maskinläsbara i stället för muntliga.
# Lägg till en post varje gång en uppgift avgörs. `--check upptäck` letar
# kandidater att lägga till.
CANONICAL_FACTS = [
    {
        "id": "ummans-storlek",
        "find": r"(?:omkring |cirka |drygt |närmare )?([\d,]+|en|två|tre)\s+miljard\w*\s+(?:muslimer|människor)",
        "ok": r"omkring två miljarder",
        "canonical": "omkring två miljarder",
        "note": "husbeslut 2026-07-09; Pew 2025 anger 2,0 md",
    },
    {
        "id": "hajj-pilgrimer",
        "find": r"(?:omkring |cirka |drygt |närmare )?([\d,]+|en|två|tre)\s+miljon\w*\s+pilgrimer",
        "ok": r"drygt 1,8 miljoner",
        "canonical": "drygt 1,8 miljoner (GASTAT 2024)",
        "note": "vad-ar-hajj har den källbelagda siffran — övriga sidor ska följa den",
    },
    {
        "id": "nisab-guld",
        "find": r"(\d[\d ]*)\s*gram guld",
        "ok": r"85\s*gram guld",
        "canonical": "85 gram guld",
    },
    {
        "id": "nisab-silver",
        "find": r"(\d[\d ]*)\s*gram silver",
        "ok": r"595\s*gram silver",
        "canonical": "595 gram silver",
    },
    {
        "id": "zakat-sats",
        "find": r"([\d,]+)\s*procent(?=[^.]{0,60}(?:zakat|allmos))|zakat[^.]{0,60}?([\d,]+)\s*procent",
        "ok": r"2,5\s*procent",
        "canonical": "2,5 procent",
    },
    {
        "id": "koranens-suror",
        "find": r"(\d[\d ]*)\s*suror",
        "ok": r"114\s*suror",
        "canonical": "114 suror",
    },
    {
        "id": "uppenbarelsens-langd",
        "find": r"(?:cirka |omkring |ungefär |under )?([\d]+)\s*år(?=[^.]{0,40}(?:uppenbarel|nedsänd|förmedla))"
                r"|(?:uppenbarel|nedsänd)[^.]{0,60}?(?:cirka |omkring |ungefär )?([\d]+)\s*år",
        "ok": r"23\s*år",
        "canonical": "23 år",
    },
    {
        "id": "obligatoriska-rakaat",
        "find": r"(sjutton|17)\s*(?:obligatoriska\s*)?rakaʿāt",
        "ok": r"sjutton",
        "canonical": "sjutton rakaʿāt",
    },
]

QUOTE_ID = re.compile(
    r"(Koranen\s+\d{1,3}:\d{1,3}(?:[–—-]\d{1,3})?"
    r"|Sah[īi]h\s+(?:al-)?(?:Bukh[āa]r[īi]|Muslim)\s+\d+"
    r"|Sunan\s+[\w'ʿāīū-]+\s+\d+"
    r"|J[āa]mi[ʿ']\s+at-Tirmidh[īi]\s+\d+)",
    re.IGNORECASE,
)


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def norm_number(raw: str) -> str:
    """"två" och "2" är samma uppgift; "1,8" och "2" är det inte."""
    key = raw.strip().lower().replace(" ", " ").replace(" ", " ")
    if key in NUMBER_WORDS:
        return str(NUMBER_WORDS[key])
    key = key.replace(" ", "").replace(",", ".")
    try:
        value = float(key)
        return str(int(value)) if value.is_integer() else str(value)
    except ValueError:
        return key


def norm_id(raw: str) -> str:
    s = norm(raw).lower()
    s = s.replace("ī", "i").replace("ā", "a").replace("ū", "u").replace("ʿ", "").replace("'", "")
    s = re.sub(r"\bal-", "", s)
    return re.sub(r"\s+", " ", s)


def parse(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    lines = raw.splitlines()
    body_start = 0
    if lines and lines[0].strip() == "---":
        end = next((i for i, l in enumerate(lines[1:], 1) if l.strip() == "---"), None)
        if end is not None:
            body_start = end + 1

    prose: list[tuple[int, str]] = []
    quotes: list[tuple[int, str, str | None]] = []  # (rad, text, källa)

    block: list[str] = []
    block_line = 0
    for i in range(body_start, len(lines)):
        line = lines[i]
        s = line.strip()
        if s.startswith(">"):
            if not block:
                block_line = i + 1
            block.append(s.lstrip("> ").strip())
            continue
        if block:
            quotes.append(flush(block, block_line))
            block = []
        if s and not s.startswith("#") and not re.match(r"^\[\^", s) and s != "---":
            prose.append((i + 1, line))
    if block:
        quotes.append(flush(block, block_line))

    return {"prose": prose, "quotes": quotes, "raw": raw}


def flush(block: list[str], line: int) -> tuple[int, str, str | None]:
    source = None
    body = list(block)
    if body and re.match(r"^[—–-]\s*\S", body[-1]):
        source_line = body.pop()
        m = QUOTE_ID.search(source_line)
        source = norm_id(m.group()) if m else norm_id(source_line.lstrip("—–- "))
    return (line, norm(" ".join(body)), source)


def jaccard(a: str, b: str) -> float:
    ta = set(re.findall(r"\w+", a.lower()))
    tb = set(re.findall(r"\w+", b.lower()))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def analyse(paths: list[Path]) -> dict:
    docs = {p: parse(p) for p in paths}

    # ── fakta (registret) ────────────────────────────────────
    fact_hits: list[dict] = []
    for fact in CANONICAL_FACTS:
        find = re.compile(fact["find"], re.IGNORECASE)
        ok = re.compile(fact["ok"], re.IGNORECASE)
        deviations, conforming = [], 0
        for path, doc in docs.items():
            for line_no, line in doc["prose"]:
                text = re.sub(r"[*_`\[\]]", "", line)
                for m in find.finditer(text):
                    window = text[max(0, m.start() - 30):m.end() + 10]
                    if ok.search(window):
                        conforming += 1
                    else:
                        deviations.append({
                            "where": f"{path.name}:{line_no}",
                            "found": norm(m.group()),
                        })
        if deviations:
            fact_hits.append({
                "id": fact["id"],
                "canonical": fact["canonical"],
                "note": fact.get("note", ""),
                "conforming": conforming,
                "deviations": deviations,
            })

    # ── upptäck (generisk, brusig med avsikt) ────────────────
    quantities: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for path, doc in docs.items():
        for line_no, line in doc["prose"]:
            text = re.sub(r"[*_`\[\]]", "", line)
            for m in QUANTITY.finditer(text):
                raw_num, subject = m.group(1), norm(m.group(2)).lower()
                words = subject.split()
                if words[-1] in SUBJECT_STOPLIST or words[0] in SUBJECT_STOPLIST:
                    continue
                if all(w in UNIT_ONLY for w in words):
                    continue
                if re.fullmatch(r"\d{3,4}", raw_num.strip()):  # årtal
                    continue
                quantities[subject][norm_number(raw_num)].append(
                    f"{path.name}:{line_no}  \"{norm(m.group())}\""
                )

    number_conflicts = []
    for subject, values in quantities.items():
        if len(values) < 2:
            continue
        files = {c.split(":")[0] for occ in values.values() for c in occ}
        if len(files) < 2:
            continue
        number_conflicts.append({
            "subject": subject,
            "values": {v: occ for v, occ in sorted(values.items())},
        })
    number_conflicts.sort(key=lambda c: -sum(len(o) for o in c["values"].values()))

    # ── källa ────────────────────────────────────────────────
    by_source: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for path, doc in docs.items():
        for line_no, text, source in doc["quotes"]:
            if source and text:
                by_source[source][text].append(f"{path.name}:{line_no}")

    source_conflicts = []
    for source, texts in by_source.items():
        if len(texts) < 2:
            continue
        files = {c.split(":")[0] for occ in texts.values() for c in occ}
        if len(files) < 2:
            continue
        source_conflicts.append({"source": source, "texts": texts})

    # ── dubblett ─────────────────────────────────────────────
    flat = [
        (path.name, line_no, text)
        for path, doc in docs.items()
        for line_no, text, _ in doc["quotes"]
        if len(text) > 60
    ]
    seen: set[tuple[str, str]] = set()
    near_duplicates = []
    for i, (fa, la, ta) in enumerate(flat):
        for fb, lb, tb in flat[i + 1:]:
            if fa == fb or ta == tb:
                continue
            score = jaccard(ta, tb)
            if not 0.55 <= score < 1.0:
                continue
            key = tuple(sorted([ta[:60], tb[:60]]))
            if key in seen:
                continue
            seen.add(key)
            near_duplicates.append({
                "score": round(score, 2),
                "a": f"{fa}:{la}", "text_a": ta,
                "b": f"{fb}:{lb}", "text_b": tb,
            })
    near_duplicates.sort(key=lambda d: -d["score"])

    return {
        "fakta": fact_hits,
        "upptäck": number_conflicts,
        "källa": source_conflicts,
        "dubblett": near_duplicates,
    }


def report(result: dict, checks: list[str]) -> None:
    if "fakta" in checks:
        items = result["fakta"]
        print(f"\n{'=' * 72}\n  FAKTA — avvikelser från husets beslutade uppgifter ({len(items)})\n{'=' * 72}")
        for f in items:
            print(f"\n  {f['id']} — kanoniskt: {f['canonical']}")
            if f["note"]:
                print(f"    ({f['note']})")
            print(f"    {f['conforming']} förekomster följer, {len(f['deviations'])} avviker:")
            for d in f["deviations"]:
                print(f"        {d['where']:<44} \"{d['found']}\"")

    if "upptäck" in checks:
        items = result["upptäck"]
        print(f"\n{'=' * 72}\n  UPPTÄCK — kandidater till registret, brusigt ({len(items)})\n{'=' * 72}")
        for c in items:
            print(f"\n  \"{c['subject']}\"")
            for value, occurrences in c["values"].items():
                print(f"    {value}:")
                for o in occurrences[:4]:
                    print(f"        {o}")

    if "källa" in checks:
        items = result["källa"]
        print(f"\n{'=' * 72}\n  KÄLLA — samma hänvisning, olika citattext ({len(items)})\n{'=' * 72}")
        for c in items:
            print(f"\n  {c['source']}")
            for text, occurrences in c["texts"].items():
                print(f"    {', '.join(occurrences)}")
                print(f"        {text[:150]}")

    if "dubblett" in checks:
        items = result["dubblett"]
        print(f"\n{'=' * 72}\n  DUBBLETT — nästan identiska citat ({len(items)})\n{'=' * 72}")
        for d in items:
            print(f"\n  likhet {d['score']}  {d['a']}  vs  {d['b']}")
            print(f"    A: {d['text_a'][:150]}")
            print(f"    B: {d['text_b'][:150]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Motsägelser mellan islam.se-sidor")
    parser.add_argument("files", nargs="+")
    parser.add_argument("--check", choices=["fakta", "källa", "dubblett", "upptäck"],
                        action="append",
                        help="standard: fakta, källa, dubblett (upptäck är brusig och körs bara på begäran)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    paths = [Path(f) for f in args.files if Path(f).exists()]
    result = analyse(paths)
    checks = args.check or ["fakta", "källa", "dubblett"]

    if args.json:
        print(json.dumps({k: result[k] for k in checks}, indent=2, ensure_ascii=False))
    else:
        report(result, checks)
        total = sum(len(result[k]) for k in checks)
        print(f"\n{'=' * 72}")
        print(f"  {len(paths)} filer — {total} motsägelser att ta ställning till")
        print(f"{'=' * 72}")

    return 1 if any(result[k] for k in checks) else 0


if __name__ == "__main__":
    sys.exit(main())
