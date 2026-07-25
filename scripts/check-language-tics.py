#!/usr/bin/env python3
"""Jaga anglicismer, latinismer och AI-tics i publicerade texter.

evaluate-article.py har smala listor som är stämda mot pipelinens
optimeringsloop — den hittade 7 latinismer och 3 anglicismer i hela korpusen.
Det här skriptet är den breda varianten: hela tabellen ur
prompts/swedish-voice.md (§2 anglicismer, §3 akademisk metaförmättnad,
§10–15 gardering och formler, §17 lexikala AI-mallar, §18 mätbara mönster)
plus de korpusmätta ticsen i prompts/polish.md och de signaturtics
[[essay_ai_tics_language_pass]] noterat i pipelinens egen produktion.

Anglicismer och latinismer rapporteras per förekomst — de är fel oavsett antal.
AI-tics rapporteras mot ett tak per text: konstruktionerna är korrekt svenska,
det är frekvensen som avslöjar maskinen.

Citat räknas aldrig. Blockcitat, fotnotsdefinitioner och text inuti "…" hoppas
över — källan får låta som den låter.

Användning:
    python3 scripts/check-language-tics.py data/svar/vad-ar-zakat.md
    python3 scripts/check-language-tics.py data/articles/*.md
    python3 scripts/check-language-tics.py --json --category anglicism data/svar/*.md
    python3 scripts/check-language-tics.py --corpus data/svar/*.md   # mönster över hela batchen

Slutkod 1 om någon anglicism/latinism hittas eller något tak överskrids.
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

# ──────────────────────────────────────────────
# 1. Anglicismer — direktöversättningar (swedish-voice.md §2, §17)
#    Varje förekomst är ett fel.
# ──────────────────────────────────────────────
ANGLICISMS: list[tuple[str, str]] = [
    (r"\bdet kan argumenteras\b", "man kan hävda / det finns skäl att tro"),
    (r"\bi termer av\b", "när det gäller / vad gäller"),
    (r"\badresser(?:a|ar|ade|at)\b(?=[^.]{0,40}\b(?:fråg|problem|utmaning|behov))",
     "ta upp / behandla"),
    (r"\bbaserat på\b", "grundat på / utifrån"),
    (r"\bnyckel(?:insikt|faktor|roll|komponent|fråga)\w*\b", "avgörande / central"),
    (r"\bimplementer(?:a|ar|ade|at|ing)\w*\b", "genomföra / tillämpa"),
    (r"\bi kontexten av\b", "i sammanhanget / mot bakgrund av"),
    (r"\bresonera kring\b", "resonera om / diskutera"),
    (r"\brelatera till\b", "ha samband med / anknyta till"),
    (r"\bsignifikant\w*\b", "betydande / avsevärd"),
    (r"\bnarrativ(?:et|en|er|erna)?\b", "berättelse / framställning"),
    (r"\bvokabulär\w*\b", "ordförråd"),
    (r"\btransparent\w*\b", "genomskinlig / öppen / tydlig"),
    (r"\bdet är värt att notera\b", "notera att / märk att"),
    (r"\bi slutet av dagen\b", "i slutändan / till syvende och sist"),
    (r"\bgöra en skillnad\b", "spela roll / ha betydelse"),
    (r"\bta en titt på\b", "se på / granska"),
    (r"\bnavig(?:era|erar|erade)\b(?![^.]{0,20}\b(?:sjö|fartyg|stjärn))",
     "hantera / finna sig till rätta i"),
    (r"\bleveranskedj\w*\b", "försörjningskedja"),
    (r"\bpå ett djupgående sätt\b", "(stryk adverbet)"),
    # Prepositioner som lutar engelska (§17)
    (r"\bintresserad i\b", "intresserad av"),
    (r"\bfokusera\s+(?!på)\w+", "fokusera PÅ något"),
    (r"\bfrågan skriver sig själv\b", "frågan ställer sig själv"),
    (r"\bövermäktig bevisning\b", "överväldigande bevisning"),
]

# ──────────────────────────────────────────────
# 2. Latinismer — där svenskan har ett eget ord (evaluate-article.py §1)
# ──────────────────────────────────────────────
LATINISMS: list[tuple[str, str]] = [
    (r"\btolerer\w+\b", "tåla / uthärda / stå ut med"),
    (r"\bkontext\w*\b", "sammanhang"),
    (r"\btrivial\w*\b", "obetydlig / enkel / banal"),
    (r"\bkorriger\w+\b", "rätta / justera"),
    (r"\bproportionell\w*\b", "i samma mån / motsvarande"),
    (r"\bexplicit\w*\b", "uttrycklig / tydlig / öppen"),
    (r"\bimplicit\w*\b", "underförstådd / outtalad"),
    (r"\bdominer\w+\b", "behärska / råda / prägla"),
    (r"\btransformer\w+\b", "omvandla / förvandla / omforma"),
    (r"\bpotentiell\w*\b", "möjlig / tänkbar"),
    (r"\bfundamental\w*\b", "grundläggande"),
    (r"\bkategoriser\w+\b", "sortera / dela in / ordna"),
    (r"\blegitim\w*\b", "berättigad / rättmätig"),
    (r"\bmanifest\w*\b", "uppenbar / tydlig / påtaglig"),
    (r"\bkomplex\w*\b(?!\s+(?:av|system|tal))", "invecklad / sammansatt / svår"),
    (r"\bfenomen\b(?!en\b)", "företeelse"),
    (r"\baspekt\w*\b", "sida / drag / del"),
    (r"\bspecifik\w*\b", "bestämd / viss / särskild"),
    (r"\bimplika\w+\b", "innebörd / följd / antydan"),
    (r"\binkluder\w+\b", "innefatta / inbegripa / omfatta"),
    (r"\bdimension\w*\b", "aspekt / sida (när det inte är bokstavligt)"),
    (r"\bposition\w*\b(?![^.]{0,20}\b(?:geografisk|kartan))", "ståndpunkt / hållning"),
]

# ──────────────────────────────────────────────
# 3. Akademisk metaförmättnad (swedish-voice.md §3) — max 1 per text
# ──────────────────────────────────────────────
ACADEMIC: list[tuple[str, str, int]] = [
    (r"\bontolog\w*\b", "skriv om — vad är det som finns, konkret?", 1),
    (r"\bepistemolog\w*\b", "skriv om — hur vet vi det?", 1),
    (r"\bparadigm\w*\b", "tankesätt / synsätt / omvälvning", 1),
    (r"\bdikotomi\w*\b", "motsatspar / tudelning", 1),
    (r"\bhermeneutisk\w*\b", "tolkande", 1),
    (r"\bdiskurs\w*\b", "samtal / debatt", 1),
    (r"\btaxonomi\w*\b", "indelning (om det inte gäller biologi)", 1),
]

# ──────────────────────────────────────────────
# 4. AI-tics med tak (swedish-voice.md §10–18, polish.md, korpusmätningarna)
#    (namn, mönster, tak, förslag)
# ──────────────────────────────────────────────
AI_TICS: list[tuple[str, str, int, str]] = [
    # Kontrastformlerna — de överlägset vanligaste
    # "utan att" är prepositionen "without", inte kontrastkonjunktionen — undantas.
    ("inte-X-utan-Y", r"\binte\b[^.!?]{1,80}?\butan\b(?!\s+att\b)", 2,
     "vänd ordningen, stryk negationen och säg vad det ÄR, eller dela i två meningar"),
    ("inte-för-att-utan-för-att", r"\binte för att\b[^.!?]{1,80}?\butan för att\b", 1,
     "använd 'eftersom', kasta om satserna, eller påstå rakt"),
    ("inte-bara-utan-också", r"\binte bara\b[^.!?]{1,60}?\butan (?:också|även)\b", 1,
     "'både X och Y' / 'X, men också Y'"),
    ("snarare-än", r"\bsnarare än\b", 2, "istället för / framför / mer än"),
    ("skillnaden-är", r"\b[Ss]killnaden (?:är|ligger|gäller)\b", 1,
     "visa skillnaden i stället för att annonsera den"),
    ("frågan-är-inte", r"\b[Ff]rågan är inte\b", 1, "ställ frågan rakt, eller påstå"),
    ("det-handlar-om", r"\b[Dd]et handlar (?:inte )?om\b", 1,
     "säg vad det är: 'Hjärtats tillstånd är avgörande'"),
    ("paradox", r"\bparadox\w*\b", 1,
     "'spänning' / 'ironi' — eller beskriv motsättningen (många är inga paradoxer)"),
    ("inte-en-metafor", r"\binte (?:en )?metafor\w*\b|\binte metaforiskt\b", 0,
     "stryk — om argumentet bär vet läsaren det"),
    ("det-är-den-som", r"\bDet är (?:den|det|han|hon) som\b", 1,
     "pipelinens signaturtic — gör om till rak sats ('Så reser sig den troende…')"),
    ("det-vore-lätt-att", r"\bDet vore lätt att\b", 1, "börja i påståendet i stället"),
    ("nådde-samma", r"\bnådde samma\b", 1,
     "låt läsaren upptäcka parallellen genom att ställa texterna bredvid varandra"),
    ("den-som-opener", r"(?:^|(?<=[.!?] ))Den som\b", 2,
     "variera öppningen: verbet, objektet, en prepositionsfras"),
    ("skär-djupare", r"\bskär djupare\b", 1, "går längre / når ner till / träffar hårdare"),
    # Gardering (§11) och slutsatsannonsering (§14)
    ("gardering", r"\b(?:kanske|möjligen|på sätt och vis|i viss mening|det kan tänkas)\b", 2,
     "svensk essäistik gör anspråk — stryk garderingen och låt påståendet stå"),
    ("sammanfattningsvis", r"\b(?:Sammanfattningsvis|Avslutningsvis|I slutändan visar)\b", 0,
     "bra prosa avslutar, den proklamerar inte att den avslutar"),
    ("kanske-är-det-slutet", r"\b[Oo]ch kanske är det\b", 1, "stå för slutsatsen"),
    # Ordmonotoni (§18-tabellen)
    ("insikt", r"\binsikt\w*\b", 2, "iakttagelse / slutsats / observation / poäng"),
    ("diagnos", r"\bdiagnos\w*\b", 1, "beskriver / identifierar / pekar ut"),
    ("rymmer", r"\brymmer\b", 2, "bär / visar / döljer / pekar mot"),
    ("avslöjar", r"\bavslöjar\b", 2, "visar / röjer / synliggör"),
    ("blottlägger", r"\bblottlägg\w+\b", 1, "spara det för när något dolt faktiskt avslöjas"),
    ("skarp", r"\bskarp\w*\b", 1, "precis / träffsäker — eller beskriv VAD som gör det skarpt"),
    ("bortom", r"\bbortom\b", 2, "utanför / ovanför / över / bakom"),
    ("häri-ligger", r"\bhäri (?:ligger|bottnar)\b", 1, "stryk övergången, gå rakt på saken"),
    ("alltjämt", r"\balltjämt\b", 1, "fortfarande / ännu / ständigt"),
    ("likväl", r"\blikväl\b", 1, "ändå / trots det"),
    ("förvisso", r"\bförvisso\b", 1, "visserligen"),
    ("djup-abstrakt", r"\bdjup(?:are|t|)\s+(?:förståelse|mening|insikt|plan|rotad|nivå)\b", 1,
     "skarpare förståelse / fast förankrad / i grunden"),
    ("destillera", r"\bdestiller\w+\b", 0, "sammanfattar / kokar ned / spetsar till"),
    ("erbjuder", r"\berbjuder\b", 1, "ger / 'islams svar är'"),
    ("vittnar", r"\bvittnar\b", 1, "pekar på / tyder på (spara det för verkliga vittnesbörd)"),
    ("verktyg-abstrakt", r"\bverktyg för\b", 1, "medel för / väg till"),
    # Attributionsverb (§18)
    ("attribution-sammanfattade", r"\bsammanfattade\b", 2, "skrev / hävdade / menade / invände"),
    ("attribution-fastslog", r"\bfastslog\b", 2, "skrev / hävdade / menade / påpekade"),
    ("attribution-fångade", r"\bfångade\b", 2, "skrev / noterade / satte ord på"),
    # Ämnessubjekt (§18)
    ("koranen-som-subjekt", r"\bKoranen (?:bekräftar|erbjuder|kräver|visar|säger|lär|talar)\b", 3,
     "låt versen tala direkt (kolon + citat), eller använd sura/versreferensen som subjekt"),
    ("moderniteten-som-halmgubbe", r"\bDet moderna (?:samhället|Sverige|västerlandet)\b", 1,
     "namnge institution, lag eller händelse — eller låt moderniteten få sin starkaste form"),
]

# ──────────────────────────────────────────────
# 5. Strukturella tics
# ──────────────────────────────────────────────
TRANSITION_OPENERS = re.compile(
    r"^\s*(?:Dock|Dessutom|Samtidigt|Vidare|Därtill|Det är värt att notera|I denna kontext)\b"
)
DEMONSTRATIVE_OPENERS = re.compile(r"^\s*(?:Denna|Detta|Denne|Dessa)\b")


# ──────────────────────────────────────────────
# Parsning
# ──────────────────────────────────────────────
QUOTE_SPAN = re.compile(r'"[^"\n]{1,400}"|”[^”\n]{1,400}”|«[^»\n]{1,400}»')
FRONTMATTER_PROSE = re.compile(r"^\s*(?:title|description|question|imageCaption|a|q):\s*(.+)$")


def author_lines(path: Path) -> list[tuple[int, str]]:
    """Rader som är författarens egen svenska: brödtext utan citat, plus de
    frontmatterfält som renderas som text på sidan."""
    raw = path.read_text(encoding="utf-8")
    lines = raw.splitlines()

    frontmatter: list[tuple[int, str]] = []
    body: list[tuple[int, str]] = []
    if lines and lines[0].strip() == "---":
        end = next((i for i, l in enumerate(lines[1:], 1) if l.strip() == "---"), None)
        if end is not None:
            frontmatter = [(i + 1, l) for i, l in enumerate(lines[1:end], 1)]
            body = [(i + 1, l) for i, l in enumerate(lines[end + 1:], end + 1)]
        else:
            body = [(i + 1, l) for i, l in enumerate(lines)]
    else:
        body = [(i + 1, l) for i, l in enumerate(lines)]

    out: list[tuple[int, str]] = []
    for n, line in frontmatter:
        m = FRONTMATTER_PROSE.match(line)
        if m:
            out.append((n, m.group(1)))
    for n, line in body:
        s = line.strip()
        if not s or s == "---":
            continue
        if s.startswith(">") or s.startswith("#") or re.match(r"^\[\^[^\]]+\]:", s):
            continue
        out.append((n, line))

    # Citatinnehåll maskeras — källan får låta som den låter.
    return [(n, QUOTE_SPAN.sub(lambda m: " " * len(m.group()), l)) for n, l in out]


def scan(lines: list[tuple[int, str]], pattern: str) -> list[tuple[int, str]]:
    rx = re.compile(pattern)
    hits = []
    for n, line in lines:
        for m in rx.finditer(line):
            start = max(0, m.start() - 45)
            hits.append((n, line[start:m.end() + 45].strip()))
    return hits


def check(path: Path) -> dict:
    lines = author_lines(path)
    words = sum(len(l.split()) for _, l in lines)

    findings: list[dict] = []

    for pattern, fix in ANGLICISMS:
        for n, excerpt in scan(lines, pattern):
            findings.append({"category": "anglicism", "name": pattern, "line": n,
                             "excerpt": excerpt, "count": 1, "cap": 0, "fix": fix})

    for pattern, fix in LATINISMS:
        for n, excerpt in scan(lines, pattern):
            findings.append({"category": "latinism", "name": pattern, "line": n,
                             "excerpt": excerpt, "count": 1, "cap": 0, "fix": fix})

    for pattern, fix, cap in ACADEMIC:
        hits = scan(lines, pattern)
        if len(hits) > cap:
            for n, excerpt in hits[cap:]:
                findings.append({"category": "akademisk", "name": pattern, "line": n,
                                 "excerpt": excerpt, "count": len(hits), "cap": cap, "fix": fix})

    for name, pattern, cap, fix in AI_TICS:
        hits = scan(lines, pattern)
        if len(hits) > cap:
            for n, excerpt in hits[cap:]:
                findings.append({"category": "ai-tic", "name": name, "line": n,
                                 "excerpt": excerpt, "count": len(hits), "cap": cap, "fix": fix})

    # Styckeöppningar: max 2 i rad med övergångsord, max 2 "Denna/Detta" per text
    transitions = [(n, l.strip()[:70]) for n, l in lines if TRANSITION_OPENERS.match(l)]
    if len(transitions) > 2:
        for n, excerpt in transitions[2:]:
            findings.append({"category": "ai-tic", "name": "övergångsord-som-krycka", "line": n,
                             "excerpt": excerpt, "count": len(transitions), "cap": 2,
                             "fix": "stryk övergångsordet — låt innehållet skapa kopplingen"})
    demonstratives = [(n, l.strip()[:70]) for n, l in lines if DEMONSTRATIVE_OPENERS.match(l)]
    if len(demonstratives) > 2:
        for n, excerpt in demonstratives[2:]:
            findings.append({"category": "ai-tic", "name": "denna-som-styckeöppning", "line": n,
                             "excerpt": excerpt, "count": len(demonstratives), "cap": 2,
                             "fix": "börja med substantivet eller verbet i stället"})

    # Semikolon. swedish-voice.md §7 sätter taket till 1 per stycke, men den
    # regeln är skriven mot engelsk semikolonkedja ("utmanar; provocerar; tvingar").
    # I den här korpusen är den balanserade antitesen husets starkaste drag
    # ("Sadaqa är frivillig generositet; zakat är de fattigas rätt"), och en rak
    # tillämpning av taket lintar bort just den. Vi flaggar därför bara det som
    # faktiskt är en tic, och räknar varken källhänvisningar eller listavskiljare.
    for n, line in lines:
        bare = re.sub(r"\([^)]*\)", "", line)  # "(Bukhārī 5729; Muslim 2219)" är ingen prosa-semikolon
        for sentence in re.split(r"(?<=[.!?])\s+", bare):
            segments = sentence.split(";")
            if len(segments) < 3:
                continue
            # Tre eller fler semikolonled där leden själva innehåller komma är en
            # korrekt uppradning ("*tawaf*, sju varv; *say*, sju vandringar; ...").
            if all("," in s for s in segments[:-1]):
                continue
            findings.append({"category": "ai-tic", "name": "semikolonkedja", "line": n,
                             "excerpt": sentence.strip()[:130], "count": len(segments) - 1, "cap": 1,
                             "fix": "semikolonkedja — bryt upp i egna meningar; "
                                    "spara semikolonet till en enda bärande antites"})
        if len(re.findall(r";", bare)) > 3:
            findings.append({"category": "ai-tic", "name": "semikolontäthet", "line": n,
                             "excerpt": line.strip()[:130], "count": len(re.findall(r";", bare)), "cap": 3,
                             "fix": "för många semikolon i samma stycke — de släcker varandras verkan"})

    findings.sort(key=lambda f: (f["category"], f["line"]))
    by_cat = Counter(f["category"] for f in findings)
    return {
        "file": str(path),
        "words": words,
        "totals": {c: by_cat.get(c, 0) for c in ("anglicism", "latinism", "akademisk", "ai-tic")},
        "total": len(findings),
        "findings": findings,
    }


CATEGORY_LABEL = {
    "anglicism": "ANGLICISMER   (varje förekomst är ett fel)",
    "latinism": "LATINISMER    (svenskan har ett eget ord)",
    "akademisk": "AKADEMISKT    (metaförmättnad, tak 1)",
    "ai-tic": "AI-TICS       (korrekt svenska — frekvensen avslöjar maskinen)",
}


def print_report(result: dict) -> None:
    name = Path(result["file"]).name
    if not result["findings"]:
        print(f"  OK   {name}  ({result['words']} ord)")
        return
    t = result["totals"]
    print(f"\n──── {name}  ({result['words']} ord) — "
          f"{t['anglicism']} anglicismer, {t['latinism']} latinismer, "
          f"{t['akademisk']} akademiska, {t['ai-tic']} ai-tics")
    grouped: dict[str, list[dict]] = defaultdict(list)
    for f in result["findings"]:
        grouped[f["category"]].append(f)
    for category in ("anglicism", "latinism", "akademisk", "ai-tic"):
        items = grouped.get(category)
        if not items:
            continue
        print(f"\n  {CATEGORY_LABEL[category]}")
        for f in items:
            over = f" [{f['count']}/{f['cap']}]" if f["cap"] or f["count"] > 1 else ""
            print(f"    rad {f['line']}{over}  …{f['excerpt']}…")
            print(f"              → {f['fix']}")


def print_corpus(results: list[dict]) -> None:
    """Vilka mönster återkommer över hela batchen — det är dem som är värda
    att åtgärda i prompten, inte bara i texten."""
    counter: Counter = Counter()
    files_with: defaultdict = defaultdict(set)
    for r in results:
        for f in r["findings"]:
            key = (f["category"], f["name"])
            counter[key] += 1
            files_with[key].add(Path(r["file"]).name)
    print(f"\n{'=' * 72}")
    print(f"  KORPUSMÖNSTER — {len(results)} filer")
    print(f"{'=' * 72}")
    for (category, name), count in counter.most_common(30):
        label = name if len(name) < 42 else name[:39] + "…"
        print(f"  {category:<10} {label:<44} {count:>4} st i {len(files_with[(category, name)])} filer")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Anglicismer, latinismer och AI-tics i publicerade texter"
    )
    parser.add_argument("files", nargs="+", help="Markdownfiler att kontrollera")
    parser.add_argument("--json", action="store_true", help="JSON i stället för text")
    parser.add_argument("--category", choices=["anglicism", "latinism", "akademisk", "ai-tic"],
                        help="Rapportera bara en kategori")
    parser.add_argument("--corpus", action="store_true",
                        help="Sammanställ återkommande mönster över hela batchen")
    args = parser.parse_args()

    results = []
    for filepath in args.files:
        path = Path(filepath)
        if not path.exists():
            print(f"Hittar inte: {filepath}", file=sys.stderr)
            continue
        result = check(path)
        if args.category:
            result["findings"] = [f for f in result["findings"] if f["category"] == args.category]
            result["total"] = len(result["findings"])
        results.append(result)

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return 1 if any(r["total"] for r in results) else 0

    for result in results:
        print_report(result)

    if args.corpus:
        print_corpus(results)

    if len(results) > 1:
        tot = Counter()
        for r in results:
            tot.update(r["totals"])
        clean = sum(1 for r in results if not r["total"])
        print(f"\n{'=' * 72}")
        print(f"  {len(results)} filer — {clean} rena. "
              f"{tot['anglicism']} anglicismer, {tot['latinism']} latinismer, "
              f"{tot['akademisk']} akademiska, {tot['ai-tic']} ai-tics")
        print(f"{'=' * 72}")

    return 1 if any(r["total"] for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
