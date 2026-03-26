#!/usr/bin/env python3
"""Find colloquial Swedish words that may not fit the essay register."""

import re
import sys
from pathlib import Path

# Words that lean colloquial in formal Swedish prose
# Each entry: (pattern, suggestion, explanation)
COLLOQUIAL = [
    (r"\bfattar\b", "uppfattar/begriper/förstår", "talspråkligt för 'förstår'"),
    (r"\bkolla\b", "granska/undersöka/se", "talspråkligt för 'titta på'"),
    (r"\bkollat\b", "granskat/undersökt", "talspråkligt"),
    (r"\bliksom\b", "så att säga/likväl", "utfyllnadsord"),
    (r"\btyp\b(?! av)", "ungefär/slags", "talspråkligt 'typ'"),
    (r"\bjätте", "mycket/synnerligen", "talspråklig förstärkning"),
    (r"\bsnacka", "tala/samtala", "talspråkligt för 'prata'"),
    (r"\bprata\b", "tala/samtala", "talspråkligt i essäregister"),
    (r"\bpratar\b", "talar", "talspråkligt i essäregister"),
    (r"\bpratade\b", "talade", "talspråkligt i essäregister"),
    (r"\bfixar?\b", "ordna/åtgärda", "talspråkligt"),
    (r"\bstrul", "problem/svårigheter", "talspråkligt"),
    (r"\bjobba", "arbeta/verka", "talspråkligt"),
    (r"\bjobbar\b", "arbetar", "talspråkligt"),
    (r"\bkäka\b", "äta", "talspråkligt"),
    (r"\btjej\b", "flicka/kvinna", "talspråkligt"),
    (r"\bkille\b", "pojke/man", "talspråkligt"),
    (r"\basså\b", "", "utfyllnadsord"),
    (r"\bba\b", "", "talspråklig förkortning av 'bara'"),
    (r"\bsåhär\b", "på detta sätt", "talspråkligt"),
    (r"\bnånting\b", "något", "talspråkligt"),
    (r"\bnån\b", "någon", "talspråkligt"),
    (r"\bdom\b", "de/dem", "talspråkligt pronomen"),
    (r"\bsa det rakt\b", "slog fast/konstaterade", "talspråklig konstruktion"),
    (r"\bskärper det\b", "sätter det på sin spets", "kan låta talspråkligt"),
    (r"\bfett\b(?! och)", "mycket/synnerligen", "slangförstärkning"),
    (r"\blagt märke till\b", "iakttagit/noterat", "talspråkligt i essäregister"),
    (r"\btok\b", "", "talspråkligt (i tok för)"),
]


def check_file(path: Path) -> list[dict]:
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()
    findings = []

    in_frontmatter = False
    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped == "---":
            in_frontmatter = not in_frontmatter
            continue
        if in_frontmatter:
            continue
        if stripped.startswith("[^"):  # footnote
            continue
        if stripped.startswith(">"):  # blockquote
            continue

        for pattern, suggestion, explanation in COLLOQUIAL:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                findings.append({
                    "file": path.name,
                    "line": line_num,
                    "word": match.group(),
                    "suggestion": suggestion,
                    "explanation": explanation,
                    "context": stripped[:150],
                })

    return findings


def main():
    paths = sorted(Path("data/articles").glob("*.md"))
    total = 0
    for path in paths:
        findings = check_file(path)
        if findings:
            print(f"\n{path.name}:")
            for f in findings:
                print(f"  rad {f['line']:>3}  «{f['word']}» → {f['suggestion']}  ({f['explanation']})")
                print(f"         {f['context']}")
            total += len(findings)

    if total == 0:
        print("Inga talspråkliga uttryck hittade.")
    else:
        print(f"\n--- Totalt: {total} träffar ---")


if __name__ == "__main__":
    main()
