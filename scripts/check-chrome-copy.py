#!/usr/bin/env python3
"""Jaga AI-tics och husstilsfel i sajtens CHROME — inte i texterna.

check-language-tics.py och check-house-style.py läser data/*.md: essäer, svar och
fördjupningar. Ingen av dem har någonsin sett apps/web/src. Följden gick att mäta
2026-08: rubriker, menyunderrubriker, tomtillstånd och knappetiketter bar tics som
inte hade överlevt en enda rad brödtext — "Frågan är inte X, utan Y" på /moskeer/,
"bortom rubrikerna" i kategoriingressen, em dash i prosa på fem ställen, och
fjorton av sjutton avsnittsunderrubriker byggda på EN mall.

Det här skriptet stänger det hålet. Det återanvänder AI_TICS ur
check-language-tics.py, lägger till husets em dash-regel, och äger en regel som
bara går att se i chrome: MALLTÄTHET. En tankstrecksapposition är stil när den
står en gång och maskin när sju syskonrader delar den.

    python3 scripts/check-chrome-copy.py
    python3 scripts/check-chrome-copy.py --self-test

Slutkod 1 om något hittas.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps/web/src"

_spec = importlib.util.spec_from_file_location(
    "_tics", ROOT / "scripts/check-language-tics.py"
)
_tics = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_tics)

# Ett segment räknas som svensk copy först när det bär ett svenskt funktionsord.
# Utan det spärren fastnar CSS ("background: transparent", "position: cover") och
# engelska designkommentarer i varenda körning.
SWEDISH = re.compile(
    r"(?<![\w-])(och|är|för|som|att|det|den|på|av|med|till|inte|från|här|vad|hur|"
    r"men|eller|varje|finns|sidan|när|där)(?![\w-])",
    re.I,
)
# Nycklar vars värden renderas som synlig copy i ett syskonsammanhang (en array).
COPY_KEYS = ("framing", "intro", "sub", "menuSub", "blurb", "lead", "label", "name")

STRIP = [
    (re.compile(r"<style[^>]*>.*?</style[^>]*>", re.S | re.I), " "),
    (re.compile(r"<script[^>]*>.*?</script[^>]*>", re.S | re.I), " "),
    (re.compile(r"\{/\*.*?\*/\}", re.S), " "),
    (re.compile(r"/\*.*?\*/", re.S), " "),
    (re.compile(r"<!--.*?-->", re.S), " "),
    (re.compile(r"^[ \t]*//.*$", re.M), " "),
]

STRING_LIT = re.compile(r'"([^"\n]{8,400})"|`([^`\n]{8,400})`')
TEXT_NODE = re.compile(r">([^<>{}\n][^<>{}]{7,400})<")


# lib/chart, lib/table och lib/figure är byggtidsvalidatorer. Deras svenska
# strängar är felmeddelanden till den som skriver ett diagramblock — de når
# aldrig en läsare, och husets prosaregler gäller dem inte.
SKIP_DIRS = ("lib/chart/", "lib/table/", "lib/figure/")


def copy_files() -> list[Path]:
    out = [p for p in WEB.rglob("*.astro")]
    for p in list((WEB / "lib").rglob("*.ts")) + list((WEB / "pages").rglob("*.ts")):
        if not p.name.endswith((".test.ts", ".d.ts")):
            out.append(p)
    # p.is_file(): rglob("*.astro") matchar även KATALOGEN src/.astro — Astros
    # genererade typkatalog, vars namn slutar i .astro. Den finns så fort dev-servern
    # eller astro sync har kört, och read_text() på den fäller hela pnpm verify.
    return sorted(p for p in out if p.is_file() and not any(d in p.as_posix() for d in SKIP_DIRS))


def segments(text: str) -> list[str]:
    """Svenska copy-strängar ur en chrome-fil, kod och kommentarer bortskalade."""
    for pat, rep in STRIP:
        text = pat.sub(rep, text)
    found: list[str] = []
    for m in STRING_LIT.finditer(text):
        found.append(m.group(1) or m.group(2))
    for m in TEXT_NODE.finditer(text):
        found.append(m.group(1))
    keep = []
    for s in found:
        s = re.sub(r"\s+", " ", s).strip()
        if len(s.split()) < 3 or not SWEDISH.search(s):
            continue
        if re.search(r"[{};]|\bvar\(|https?://|@media|::", s):
            continue
        keep.append(s)
    return keep


# Em dash är husets titelseparator ("Bönetider i Malmö — islam.se", "islam.se —
# kunskap om islam"). Bara ett tankstreck som INTE står intill märket är prosa.
BRAND_ADJACENT = re.compile(r"—\s*islam\.se|islam\.se\s*—")


def is_title(seg: str) -> bool:
    """En <title>/märkesrad, inte prosa.

    Två former, båda husets: tankstrecket står intill märket ("Vad är islam? —
    islam.se"), eller raden slutar i märket med ett enda tankstreck och ingen
    mening ("Podd — andliga essäer från islam.se"). Poddens egen beskrivning —
    som slutar i "via RSS." — faller på båda och granskas som prosan den är.
    """
    if BRAND_ADJACENT.search(seg):
        return True
    return (
        seg.rstrip().endswith("islam.se")
        and seg.count("—") == 1
        and "." not in seg.replace("islam.se", "")
    )


def check_tics(files: list[Path]) -> list[str]:
    hits = []
    for p in files:
        rel = p.relative_to(ROOT)
        segs = segments(p.read_text(encoding="utf-8"))
        # Caps halveras. AI_TICS-taken är stämda mot en essä eller en svarssida;
        # chrome-copyn i en fil är en bråkdel av den längden, så samma tak släpper
        # igenom allt. Ett tak på 1 blir 0 — en enda "Frågan är inte X, utan Y" i
        # en avsnittsingress ÄR ticet. Ett tak på 3 blir 1, vilket låter "Vad
        # Koranen säger" stå kvar som den vanliga svenska den är.
        counts: dict[str, list[str]] = {}
        for seg in segs:
            for name, pattern, _cap, _fix in _tics.AI_TICS:
                if re.search(pattern, seg):
                    counts.setdefault(name, []).append(seg)
        for name, pattern, cap, fix in _tics.AI_TICS:
            found = counts.get(name, [])
            if len(found) > cap // 2:
                hits.append(f"{rel}: [{name}] «{found[0][:90]}»\n    → {fix}")
        for seg in segs:
            if "—" in seg and not is_title(seg) and not seg.startswith("—"):
                hits.append(
                    f"{rel}: [em-dash] «{seg[:90]}»\n"
                    '    → byt "—" mot spatierat " – " (check-house-style.py rule_em_dash)'
                )
    return hits


def check_template_density(files: list[Path]) -> list[str]:
    """En tankstrecksapposition är stil en gång och mall sju gånger.

    Sju ämnesramar och sju kategoriingresser stod alla i formen «NP – gloss».
    Ingen av dem var fel för sig. Tillsammans var de en maskin som skrev.
    """
    hits = []
    for p in files:
        if p.suffix != ".ts":
            continue
        text = p.read_text(encoding="utf-8")
        for pat, _rep in STRIP:
            text = pat.sub(" ", text)
        for key in COPY_KEYS:
            vals = [
                re.sub(r"\s+", " ", v).strip()
                for v in re.findall(rf'\b{key}:\s*\n?\s*"([^"]{{12,}})"', text)
            ]
            vals = [v for v in vals if SWEDISH.search(v)]
            if len(vals) < 5:
                continue
            shaped = [v for v in vals if re.search(r"\S – \S", v)]
            if len(shaped) / len(vals) > 0.5:
                hits.append(
                    f"{p.relative_to(ROOT)}: [mall] {len(shaped)} av {len(vals)} "
                    f"«{key}» delar formen «X – Y»\n"
                    "    → variera syntaxen: gör några till egen mening, kolon eller komma"
                )
    return hits


SELF_TEST = [
    ("Frågan är inte om islam hör hemma, utan hur länge", "frågan-är-inte", True),
    ("Korta svar på det som frågas — tron och reglerna", "em-dash", True),
    ("Karta över moskéer i hela Sverige, län för län.", None, False),
    ("background: transparent; position: cover", None, False),
]


def self_test() -> int:
    bad = 0
    for seg, want, should in SELF_TEST:
        kept = segments(f'"{seg}"')
        if not should and not kept:
            continue
        found = set()
        for s in kept:
            for name, pattern, _c, _f in _tics.AI_TICS:
                if re.search(pattern, s):
                    found.add(name)
            if "—" in s:
                found.add("em-dash")
        ok = (want in found) if should else not found
        if not ok:
            bad += 1
            print(f"SELF-TEST FEL: «{seg}» → {found or '{}'} (väntade {want!r})")
    print("check-chrome-copy: self-test OK" if not bad else f"{bad} fel")
    return 1 if bad else 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    files = copy_files()
    hits = check_tics(files) + check_template_density(files)
    if not hits:
        print(f"check-chrome-copy: {len(files)} filer, inga tics i chrome-copyn.")
        return 0
    print(f"AI-TICS OCH HUSSTIL I CHROME-COPY ({len(hits)})\n")
    for h in hits:
        print(f"  {h}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
