#!/usr/bin/env python3
"""Find opportunities to replace flat phrases with Swedish idioms.

Maps established idioms to the flat verb/phrase patterns they could replace,
then searches articles for matches."""

import re
import sys
from pathlib import Path

# (flat_pattern_regex, idiom, explanation)
# Each flat pattern is a regex matching the discursive phrase
IDIOM_MAP = [
    # --- Already implemented (skip these) ---
    # "sätter fingret på", "funnit sig till rätta", "ta steget fullt ut",
    # "glidit ur händerna", "lyser med sin frånvaro", "bär fröet till",
    # "slår rot", "kastar ljus över", "kommer till korta", "vinner terräng",
    # "står i skuld till"

    # --- Candidate mappings ---
    (r"saknar grund", "hänger i luften", "utan förankring"),
    (r"utan (?:fast |solid )?grund", "hänger i luften", "utan förankring"),
    (r"(?:går|gick) förlorad", "gått om intet", "försvunnit utan resultat"),
    (r"inte (?:kan |förmår )?dölja", "skiner igenom", "syns trots försök att dölja"),
    (r"avslöjar (?:sig|det)", "visar sitt rätta ansikte", "det verkliga framträder"),
    (r"börjar om", "vänder blad", "ny start"),
    (r"(?:helt |fullständigt )?förändra[rds]*", "vänder upp och ner på", "total omvälvning"),
    (r"(?:står|stod) ensam", "står på egna ben", "klarar sig utan stöd"),
    (r"(?:går|gick) för långt", "skjuter över målet", "överdriver"),
    (r"ger (?:inte )?resultat", "bär frukt", "leder till resultat"),
    (r"(?:kan inte|förmår inte) förklara", "står svarslös inför", "saknar förklaring"),
    (r"öppet (?:visa|erkänna|säga)", "lägga korten på bordet", "vara öppen"),
    (r"(?:tar|tog) itu med", "går till botten med", "utreder grundligt"),
    (r"(?:försvinner|försvann) (?:ur |från )?minnet", "faller i glömska", "glöms bort"),
    (r"(?:undviker|undvek) (?:att |)(?:svara|frågan|kärnan)", "går som katten kring het gröt", "undviker kärnfrågan"),
    (r"förlorar (?:sin )?(?:grund|fäste|fotfäste)", "mister fotfästet", "tappar grunden"),
    (r"(?:bryter|bröt) ny (?:mark|väg)", "bryter ny mark", "gör något för första gången"),
    (r"tar (?:på sig )?(?:för mycket|mer än)", "tar sig vatten över huvudet", "åtar sig för mycket"),
    (r"(?:är |blir )(?:tvungen|nödd) att erkänna", "biter i det sura äpplet", "accepterar motvilligt"),
    (r"(?:anpassar|anpassade) sig (?:efter|till) (?:omständighet|läge|vind)", "vänder kappan efter vinden", "opportunism"),
    (r"(?:sätter|ställer) (?:saken|frågan|det) på sin spets", "ställer på sin spets", "redan idiom!"),
    (r"(?:hindrar|förhindrar|motarbetar)", "sätter käppar i hjulet", "saboterar/försvårar"),
    (r"(?:ger|gav) efter", "ger vika", "kapitulerar"),
    (r"(?:ökar|växer) (?:i |)(?:styrka|inflytande|betydelse)", "vinner mark", "expanderar"),
    (r"(?:uppstår|uppstod) (?:en )?(?:konflikt|strid|kamp) mellan", "står i strid med", "konflikerar"),
    (r"(?:döljer|dolde) (?:det )?(?:verkliga|sanna)", "drar ett finger över", "hmm not standard"),
    (r"(?:tvingar|tvingade) (?:fram )?(?:ett )?(?:svar|erkännande|beslut)", "ställer mot väggen", "tvingar till ställningstagande"),
    (r"(?:överlevt|bestått|klarat) (?:tidens )?(?:tand|prövning)", "stått sig genom tiderna", "bestått tidens prövning"),
    (r"inte (?:kan |)(?:mäta sig|jämföras) med", "kommer inte i närheten av", "når inte upp till"),
    (r"(?:riskerar|hotar) att (?:förstöra|rasera|underminera)", "sågar av grenen man sitter på", "underminerar sig själv"),
    (r"(?:visar|visade) sig (?:vara )?(?:tom|ihålig|värdelös)", "visar sig vara en papperstiger", "maktlöst hot"),
    (r"(?:tar|tog) det (?:första|avgörande) steget", "bryter isen", "tar initiativet"),
    (r"(?:talar|talade) (?:öppet|rakt|ärligt)", "tar bladet från munnen", "talar utan omsvep"),
    (r"utan att (?:tveka|darra|vackla)", "utan att blinka", "utan tvekan"),
    (r"(?:saknar|utan) (?:all )?(?:grund|belägg|stöd)", "bygger på lösan sand", "saknar grund"),
]


def search_articles(paths: list[Path]) -> list[dict]:
    findings = []

    for path in paths:
        content = path.read_text(encoding="utf-8")
        lines = content.splitlines()

        in_frontmatter = False
        for line_num, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped == "---":
                in_frontmatter = not in_frontmatter
                continue
            if in_frontmatter:
                continue
            if stripped.startswith("[^"):
                continue
            if stripped.startswith(">"):
                continue

            for pattern, idiom, explanation in IDIOM_MAP:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    findings.append({
                        "file": path.name,
                        "line": line_num,
                        "matched": match.group(),
                        "idiom": idiom,
                        "explanation": explanation,
                        "context": stripped[:180],
                    })

    return findings


def main():
    paths = sorted(Path("data/articles").glob("*.md"))
    if not paths:
        print("Inga filer hittade.", file=sys.stderr)
        sys.exit(1)

    findings = search_articles(paths)

    if not findings:
        print("Inga matchningar hittade.")
        return

    current_file = None
    for f in findings:
        if f["file"] != current_file:
            current_file = f["file"]
            print(f"\n{'='*60}")
            print(f"  {current_file}")
            print(f"{'='*60}")
        print(f"\n  rad {f['line']:>3}  «{f['matched']}» → {f['idiom']}")
        print(f"  {f['context']}")

    print(f"\n--- Totalt: {len(findings)} möjligheter i {len(paths)} filer ---")


if __name__ == "__main__":
    main()
