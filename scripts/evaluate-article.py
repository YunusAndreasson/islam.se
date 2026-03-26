#!/usr/bin/env python3
"""Evaluate an article's Swedish prose quality.

Runs all quality checks and produces a composite score.
Used as the objective function for pipeline prompt optimization.

Usage:
    python scripts/evaluate-article.py <file.md>
    python scripts/evaluate-article.py data/articles/*.md
    python scripts/evaluate-article.py --json <file.md>
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


# ──────────────────────────────────────────────
# 1. Latinisms — words that have Swedish alternatives
# ──────────────────────────────────────────────
LATINISMS = [
    # Strict: words the manual edits consistently replaced
    (r"\btolerera\w*\b", "tåla/uthärda/stå ut med"),
    (r"\bkontext\w*\b", "sammanhang"),
    (r"\btrivial\w*\b", "obetydlig/enkel/banal"),
    (r"\bkorrigera\w*\b", "rätta/justera"),
    (r"\bproportionell\w*\b", "i samma mån/motsvarande"),
    (r"\bexplicit\w*\b", "uttrycklig/tydlig/öppen"),
    (r"\bimplicit\w*\b", "underförstådd/outtalad"),
    (r"\bdominer\w+\b", "behärska/råda/prägla"),
    (r"\btransformer\w+\b", "omvandla/förvandla/omforma"),
    (r"\bpotentiell\w*\b", "möjlig/tänkbar"),
    (r"\bfundamental\w*\b", "grundläggande"),
    (r"\bkategoriser\w+\b", "sortera/dela in/ordna"),
    (r"\blegitim\w*\b", "berättigad/rättmätig"),
    (r"\bmanifest\w*\b", "uppenbar/tydlig/påtaglig"),
    (r"\bkomplex\w*\b(?!\s+(?:av|system|tal))", "invecklad/sammansatt/svår"),
    (r"\bfenomen\b(?!en\b)", "företeelse"),
    (r"\baspekt\w*\b", "sida/drag/del"),
]

# ──────────────────────────────────────────────
# 2. Anglicisms — English calques in Swedish
# ──────────────────────────────────────────────
ANGLICISMS = [
    (r"\bleveranskedja\w*\b", "försörjningskedja"),
    (r"\badresser\w+ (?:frågan|problemet)", "ta upp/behandla"),
    (r"\bnavig\w+ (?:komplexitet|svårighet)", "hantera/finna sig till rätta i"),
    (r"\bverktyg för\b", "medel för/väg till"),
    (r"\butmana sig själv\b", "pröva sig/sträcka sig"),
    (r"\bta en titt på\b", "se på/granska"),
    (r"\bi slutet av dagen\b", "i slutändan/till syvende och sist"),
    (r"\bgöra en skillnad\b", "spela roll/ha betydelse"),
    (r"\bbaserat på\b", "grundat på/utifrån"),
    (r"\bi termer av\b", "när det gäller/vad gäller"),
    (r"\bdet kan argumenteras\b", "man kan hävda"),
    (r"\bnyckel-\w+\b", "avgörande/central"),
    (r"\bdet är värt att notera\b", "notera att/märk att"),
    (r"\bpå ett djupgående sätt\b", "(stryk adverbet)"),
    (r"\bi grunden handlar det om\b", "(börja om från handlingen)"),
    (r"\blanda\w* in (?:i |)(?:en |)(?:diskussion|debatt|samtal)\b", "delta i/ta del i"),
    (r"\bspecifik\w*\b", "bestämd/viss/särskild"),
    (r"\bfokuser\w+ på\b", "rikta in sig på/inrikta sig på"),
    (r"\bimplika\w+\b", "innebörd/följd/antydan"),
    (r"\binkluder\w+\b", "innefatta/inbegripa/omfatta"),
]

# ──────────────────────────────────────────────
# 3. AI patterns
# ──────────────────────────────────────────────
AI_PATTERNS = {
    "inte_x_utan_y": (r"[Ii]nte\s+(?:för att\s+)?[\wåäö]+[\s,—–-]+utan\s+", 2),
    "insikt": (r"\binsikt\w*\b", 2),
    "diagnos": (r"\bdiagnos\w*\b", 1),
    "rymmer": (r"\brymmer\b", 2),
    "avslöjar": (r"\bavslöjar\b", 2),
    "skarp": (r"\bskarp\w*\b", 1),
    "bortom": (r"\bbortom\b", 2),
    "häri_ligger": (r"\bhäri\s+(?:ligger|bottnar)\b", 1),
    "nådde_samma": (r"\bnådde\s+samma\b", 1),
    "den_som_opener": (r"(?:^|\. )Den som\s+", 2),
    "det_handlar_om": (r"\bDet handlar om\b", 1),
    "frågan_är": (r"\bFrågan är\b", 1),
    "sammanfattningsvis": (r"\b(?:Sammanfattningsvis|Avslutningsvis)\b", 0),
    "destillera": (r"\bdestiller\w+\b", 0),
    "erbjuder": (r"\berbjuder\b", 1),
    "vittnar": (r"\bvittnar\b", 1),
    "blottlägger": (r"\bblottlägger\b", 1),
}

# ──────────────────────────────────────────────
# 4. Vocabulary monotony — overused attribution verbs
# ──────────────────────────────────────────────
ATTRIBUTION_VERBS = [
    r"\bsammanfattade\b",
    r"\bfastslog\b",
    r"\bfångade\b",
]

# ──────────────────────────────────────────────
# 5. Colloquial words (from find-colloquial.py)
# ──────────────────────────────────────────────
COLLOQUIAL = [
    r"\bfattar\b", r"\bkolla\w*\b", r"\bliksom\b", r"\btyp\b(?! av)",
    r"\bjätte", r"\bsnacka\w*\b", r"\bprata\w*\b", r"\bfixar?\b",
    r"\bstrul\w*\b", r"\bjobba\w*\b", r"\bkäka\b", r"\btjej\b",
    r"\bkille\b", r"\basså\b", r"\bba\b", r"\bsåhär\b",
    r"\bnånting\b", r"\bnån\b", r"\bdom\b",
]

# ──────────────────────────────────────────────
# 6. Idiom opportunities (from find-idiom-opportunities.py)
# ──────────────────────────────────────────────
IDIOM_MAP = [
    (r"saknar grund", "hänger i luften"),
    (r"utan (?:fast |solid )?grund", "hänger i luften"),
    (r"(?:går|gick) förlorad", "gått om intet"),
    (r"inte (?:kan |förmår )?dölja", "skiner igenom"),
    (r"börjar om", "vänder blad"),
    (r"(?:helt |fullständigt )?förändra[rds]*", "vänder upp och ner på"),
    (r"(?:kan inte|förmår inte) förklara", "står svarslös inför"),
    (r"(?:försvinner|försvann) (?:ur |från )?minnet", "faller i glömska"),
    (r"(?:tar|tog) itu med", "går till botten med"),
    (r"(?:bryter|bröt) ny (?:mark|väg)", "bryter ny mark"),
    (r"tar (?:på sig )?(?:för mycket|mer än)", "tar sig vatten över huvudet"),
    (r"(?:ger|gav) efter", "ger vika"),
    (r"(?:visar|visade) sig (?:vara )?(?:tom|ihålig|värdelös)", "papperstiger"),
    (r"utan att (?:tveka|darra|vackla)", "utan att blinka"),
    (r"(?:saknar|utan) (?:all )?(?:grund|belägg|stöd)", "bygger på lösan sand"),
]

# ──────────────────────────────────────────────
# 7. Arabic terms for italics consistency
# ──────────────────────────────────────────────
ARABIC_TERMS = {
    "tawakkul", "tawḥīd", "fiṭrah", "firāsah", "taqwā", "dhikr",
    "hawā", "nafs", "qalb", "rūḥ", "ʿilm", "ẓann", "shūrā",
    "ijtihād", "qiblah", "sunnah", "ḥadīth", "fiqh", "sharīʿah",
    "amānah", "khalīfah", "ummah", "jihād", "zakāt", "ṣalāh",
    "ṣawm", "ḥajj", "waqf", "fatwā", "madhhab", "ʿibādah",
    "dunyā", "ākhirah", "jannah", "jahannam", "tawbah", "iḥsān",
}


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def parse_article(path: Path) -> tuple[dict, list[str]]:
    """Parse article into (frontmatter_dict, content_lines)."""
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()
    frontmatter = {}
    body_lines = []

    in_frontmatter = False
    frontmatter_done = False
    for line in lines:
        if line.strip() == "---":
            if not frontmatter_done:
                if in_frontmatter:
                    frontmatter_done = True
                in_frontmatter = not in_frontmatter
                continue
        if in_frontmatter and not frontmatter_done:
            match = re.match(r'^(\w+):\s*"?([^"]*)"?\s*$', line)
            if match:
                frontmatter[match.group(1)] = match.group(2)
            continue
        if frontmatter_done:
            body_lines.append(line)

    return frontmatter, body_lines


def is_prose_line(line: str) -> bool:
    """True if line is author's prose (not blockquote, footnote, heading, empty)."""
    stripped = line.strip()
    if not stripped:
        return False
    if stripped.startswith("[^"):
        return False
    if stripped.startswith("#"):
        return False
    if stripped.startswith(">"):
        return False
    if stripped.startswith("---"):
        return False
    return True


def get_prose_text(body_lines: list[str]) -> str:
    """Get only the author's prose (no blockquotes, footnotes, headings)."""
    return "\n".join(l for l in body_lines if is_prose_line(l))


def count_pattern(text: str, pattern: str, flags=re.IGNORECASE) -> list[str]:
    """Return all matches of pattern in text."""
    return [m.group() for m in re.finditer(pattern, text, flags)]


# ──────────────────────────────────────────────
# Check functions
# ──────────────────────────────────────────────

def check_latinisms(prose: str) -> dict:
    findings = []
    for pattern, suggestion in LATINISMS:
        matches = count_pattern(prose, pattern)
        if matches:
            findings.append({"word": matches[0], "count": len(matches), "suggestion": suggestion})
    return {"count": sum(f["count"] for f in findings), "findings": findings}


def check_anglicisms(prose: str) -> dict:
    findings = []
    for pattern, suggestion in ANGLICISMS:
        matches = count_pattern(prose, pattern)
        if matches:
            findings.append({"phrase": matches[0], "count": len(matches), "suggestion": suggestion})
    return {"count": sum(f["count"] for f in findings), "findings": findings}


def check_ai_patterns(prose: str) -> dict:
    findings = []
    total_over = 0
    for name, (pattern, max_allowed) in AI_PATTERNS.items():
        matches = count_pattern(prose, pattern)
        count = len(matches)
        over = max(0, count - max_allowed)
        if count > 0:
            findings.append({
                "pattern": name,
                "count": count,
                "max": max_allowed,
                "over": over,
            })
        total_over += over
    return {"total_over_limit": total_over, "findings": findings}


def check_em_dashes(body_lines: list[str]) -> dict:
    total = 0
    paragraphs_over = 0
    for line in body_lines:
        if not is_prose_line(line):
            continue
        dashes = len(re.findall(r"[—–]", line))
        total += dashes
        if dashes > 2:
            paragraphs_over += 1
    return {"total": total, "paragraphs_over_2": paragraphs_over}


def check_colloquial(prose: str) -> dict:
    count = 0
    words = []
    for pattern in COLLOQUIAL:
        matches = count_pattern(prose, pattern)
        if matches:
            count += len(matches)
            words.append(matches[0])
    return {"count": count, "words": words}


def check_idiom_opportunities(prose: str) -> dict:
    findings = []
    for pattern, idiom in IDIOM_MAP:
        matches = count_pattern(prose, pattern)
        if matches:
            findings.append({"phrase": matches[0], "idiom": idiom})
    return {"count": len(findings), "findings": findings}


def check_repetitions(body_lines: list[str], window: int = 8, min_len: int = 4) -> dict:
    """Find repeated content words within a sliding window."""
    stop_words = {
        "och", "i", "att", "en", "ett", "det", "den", "de", "som", "är", "var",
        "för", "på", "med", "av", "till", "om", "har", "hade", "han", "hon",
        "inte", "från", "eller", "men", "vi", "kan", "ska", "sig", "sin",
        "sitt", "sina", "alla", "allt", "utan", "när", "där", "här", "hur",
        "vad", "vars", "dem", "dig", "mig", "oss", "er", "du", "jag", "ni",
        "så", "då", "än", "ju", "nog", "bara", "också", "genom", "under",
        "över", "efter", "vid", "mot", "ur", "mellan", "hos", "denna",
        "denne", "detta", "dessa", "andra", "annat", "egen", "eget", "egna",
        "varje", "någon", "något", "några", "ingen", "inget", "inga",
        "samma", "själv", "själva", "mycket", "mer", "mest", "många",
        "blir", "blev", "varit", "vara", "bli", "ha", "dess", "hans",
        "hennes", "deras", "vår", "vårt", "våra",
    }

    total = 0
    # Process paragraph by paragraph
    para_lines = []
    for line in body_lines:
        if is_prose_line(line):
            para_lines.append(line)
        else:
            if para_lines:
                text = " ".join(para_lines)
                text = re.sub(r"\*+", "", text)
                text = re.sub(r"\[\^[^\]]*\]", "", text)
                tokens = [(t, t.lower()) for t in re.findall(r"[A-Za-zÀ-öø-ÿ]+", text)]
                seen = {}
                for i, (orig, norm) in enumerate(tokens):
                    if len(norm) < min_len or norm in stop_words:
                        continue
                    if norm in seen and (i - seen[norm]) <= window:
                        total += 1
                    seen[norm] = i
            para_lines = []

    # Last paragraph
    if para_lines:
        text = " ".join(para_lines)
        text = re.sub(r"\*+", "", text)
        text = re.sub(r"\[\^[^\]]*\]", "", text)
        tokens = [(t, t.lower()) for t in re.findall(r"[A-Za-zÀ-öø-ÿ]+", text)]
        seen = {}
        for i, (orig, norm) in enumerate(tokens):
            if len(norm) < min_len or norm in stop_words:
                continue
            if norm in seen and (i - seen[norm]) <= window:
                total += 1
            seen[norm] = i

    return {"count": total}


def check_footnotes(content: str) -> dict:
    refs = set(re.findall(r"\[\^(\d+)\](?!:)", content))
    defs = set(re.findall(r"\[\^(\d+)\]:", content))
    orphan_refs = refs - defs
    orphan_defs = defs - refs
    gaps = set()
    if defs:
        max_num = max(int(d) for d in defs)
        expected = set(str(i) for i in range(1, max_num + 1))
        gaps = expected - defs - refs
    return {
        "orphan_refs": len(orphan_refs),
        "orphan_defs": len(orphan_defs),
        "numbering_gaps": len(gaps),
        "total_issues": len(orphan_refs) + len(orphan_defs) + len(gaps),
    }


def check_italics_consistency(body_lines: list[str]) -> dict:
    """Check if Arabic terms are consistently italicized."""
    text = "\n".join(body_lines)
    inconsistent = []
    for term in ARABIC_TERMS:
        italic_count = len(re.findall(rf"\*{re.escape(term)}\*", text, re.IGNORECASE))
        plain_count = len(re.findall(rf"(?<!\*)\b{re.escape(term)}\b(?!\*)", text, re.IGNORECASE))
        if italic_count > 0 and plain_count > 0:
            inconsistent.append({"term": term, "italic": italic_count, "plain": plain_count})
    return {"count": len(inconsistent), "terms": inconsistent}


def check_attribution_verbs(prose: str) -> dict:
    """Check if same attribution verb is overused."""
    overused = []
    for pattern in ATTRIBUTION_VERBS:
        matches = count_pattern(prose, pattern)
        if len(matches) > 2:
            overused.append({"verb": matches[0], "count": len(matches)})
    return {"overused_count": len(overused), "verbs": overused}


# ──────────────────────────────────────────────
# Main evaluation
# ──────────────────────────────────────────────

def evaluate(path: Path) -> dict:
    content = path.read_text(encoding="utf-8")
    frontmatter, body_lines = parse_article(path)
    prose = get_prose_text(body_lines)
    word_count = len(prose.split())

    results = {
        "file": path.name,
        "title": frontmatter.get("title", "?"),
        "word_count": word_count,
        "checks": {
            "latinisms": check_latinisms(prose),
            "anglicisms": check_anglicisms(prose),
            "ai_patterns": check_ai_patterns(prose),
            "em_dashes": check_em_dashes(body_lines),
            "colloquial": check_colloquial(prose),
            "idiom_opportunities": check_idiom_opportunities(prose),
            "repetitions": check_repetitions(body_lines),
            "footnotes": check_footnotes(content),
            "italics_consistency": check_italics_consistency(body_lines),
            "attribution_verbs": check_attribution_verbs(prose),
        },
    }

    # Composite score: lower is better (count of issues)
    c = results["checks"]
    results["total_issues"] = (
        c["latinisms"]["count"]
        + c["anglicisms"]["count"]
        + c["ai_patterns"]["total_over_limit"]
        + c["em_dashes"]["paragraphs_over_2"]
        + c["colloquial"]["count"]
        + c["idiom_opportunities"]["count"]
        + c["repetitions"]["count"]
        + c["footnotes"]["total_issues"]
        + c["italics_consistency"]["count"]
        + c["attribution_verbs"]["overused_count"]
    )

    return results


def print_report(results: dict) -> None:
    c = results["checks"]
    title = results["title"]
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"  {results['file']} ({results['word_count']} ord)")
    print(f"{'=' * 60}")

    def section(name: str, count: int, details: str = ""):
        status = "OK" if count == 0 else f"{count} problem"
        icon = "  " if count == 0 else "! "
        line = f"  {icon}{name:<30} {status}"
        if details and count > 0:
            line += f"  ({details})"
        print(line)

    section("Latinismer", c["latinisms"]["count"],
            ", ".join(f["word"] for f in c["latinisms"]["findings"][:5]))
    section("Anglicismer", c["anglicisms"]["count"],
            ", ".join(f["phrase"] for f in c["anglicisms"]["findings"][:5]))
    section("AI-mönster (över gräns)", c["ai_patterns"]["total_over_limit"],
            ", ".join(f"{f['pattern']}={f['count']}/{f['max']}"
                      for f in c["ai_patterns"]["findings"] if f["over"] > 0))
    section("Tankstreck", c["em_dashes"]["paragraphs_over_2"],
            f"totalt {c['em_dashes']['total']}, {c['em_dashes']['paragraphs_over_2']} stycken med >2")
    section("Talspråk", c["colloquial"]["count"],
            ", ".join(c["colloquial"]["words"][:5]))
    section("Idiom-tillfällen", c["idiom_opportunities"]["count"],
            ", ".join(f"{f['phrase']}={f['idiom']}" for f in c["idiom_opportunities"]["findings"][:3]))
    section("Upprepningar", c["repetitions"]["count"])
    section("Fotnoter", c["footnotes"]["total_issues"])
    section("Kursivering (arabiska)", c["italics_consistency"]["count"],
            ", ".join(t["term"] for t in c["italics_consistency"]["terms"][:5]))
    section("Attributionsverb", c["attribution_verbs"]["overused_count"],
            ", ".join(f"{v['verb']}={v['count']}" for v in c["attribution_verbs"]["verbs"]))

    print(f"\n  TOTALT: {results['total_issues']} problem")
    print()


def main():
    parser = argparse.ArgumentParser(description="Evaluate article Swedish prose quality")
    parser.add_argument("files", nargs="+", help="Article markdown files to evaluate")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of human-readable")
    args = parser.parse_args()

    all_results = []
    for filepath in args.files:
        path = Path(filepath)
        if not path.exists():
            print(f"File not found: {filepath}", file=sys.stderr)
            continue
        result = evaluate(path)
        all_results.append(result)

    if args.json:
        print(json.dumps(all_results, indent=2, ensure_ascii=False))
    else:
        for result in all_results:
            print_report(result)

        if len(all_results) > 1:
            total = sum(r["total_issues"] for r in all_results)
            avg = total / len(all_results)
            print(f"{'=' * 60}")
            print(f"  SAMMANFATTNING: {len(all_results)} artiklar, {total} problem totalt, {avg:.1f} snitt")
            print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
