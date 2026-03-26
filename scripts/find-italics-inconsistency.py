#!/usr/bin/env python3
"""Find Arabic/Islamic terms that are inconsistently italicized across articles.

A term like 'tawakkul' should always appear as *tawakkul* or always without italics.
This script finds terms that appear both ways."""

import re
import sys
from collections import defaultdict
from pathlib import Path

# Known Arabic terms that should typically be italicized
ARABIC_TERMS = {
    "tawakkul", "tawḥīd", "fiṭrah", "firāsah", "taqwā", "dhikr",
    "hawā", "nafs", "qalb", "rūḥ", "ʿilm", "ẓann", "shūrā",
    "ijtihād", "qiblah", "sunnah", "ḥadīth", "fiqh", "sharīʿah",
    "amānah", "khalīfah", "ummah", "jihād", "zakāt", "ṣalāh",
    "ṣawm", "ḥajj", "waqf", "fatwā", "madhhab", "ʿibādah",
    "dunyā", "ākhirah", "jannah", "jahannam", "malakah",
    "ghaflah", "tawbah", "istidrāj", "murāqabah", "iḥsān",
    "waqt", "naẓm", "maṭiyyah", "ʿishq", "maʿrifah",
}


def find_term_usage(paths: list[Path]) -> dict[str, dict[str, list[str]]]:
    """For each Arabic term, track where it appears italicized vs not."""
    usage: dict[str, dict[str, list[str]]] = defaultdict(lambda: {"italic": [], "plain": []})

    for path in paths:
        content = path.read_text(encoding="utf-8")
        lines = content.splitlines()

        in_frontmatter = False
        for line_num, line in enumerate(lines, 1):
            if line.strip() == "---":
                in_frontmatter = not in_frontmatter
                continue
            if in_frontmatter:
                continue
            if line.strip().startswith("[^"):  # footnote
                continue
            if line.strip().startswith("#"):  # heading — no italics expected
                continue

            for term in ARABIC_TERMS:
                # Check for italicized occurrences
                italic_pattern = re.compile(rf"\*{re.escape(term)}\*", re.IGNORECASE)
                plain_pattern = re.compile(
                    rf"(?<!\*)\b{re.escape(term)}\b(?!\*)", re.IGNORECASE
                )

                if italic_pattern.search(line):
                    usage[term]["italic"].append(f"{path.name}:{line_num}")
                if plain_pattern.search(line):
                    usage[term]["plain"].append(f"{path.name}:{line_num}")

    return usage


def main():
    paths = sorted(Path("data/articles").glob("*.md"))
    if not paths:
        print("Inga filer hittade.", file=sys.stderr)
        sys.exit(1)

    usage = find_term_usage(paths)

    inconsistent = []
    for term, locations in sorted(usage.items()):
        if locations["italic"] and locations["plain"]:
            inconsistent.append((term, locations))

    if not inconsistent:
        print("Alla termer är konsekvent formaterade.")
        return

    for term, locations in inconsistent:
        n_italic = len(locations["italic"])
        n_plain = len(locations["plain"])
        dominant = "kursiv" if n_italic >= n_plain else "rak stil"
        minority = locations["plain"] if n_italic >= n_plain else locations["italic"]
        minority_style = "rak stil" if n_italic >= n_plain else "kursiv"

        print(f"\n  «{term}» — oftast {dominant} ({n_italic} kursiv, {n_plain} rak)")
        print(f"  Avvikande ({minority_style}):")
        for loc in minority[:5]:  # show max 5
            print(f"    {loc}")
        if len(minority) > 5:
            print(f"    ... och {len(minority) - 5} till")

    print(f"\n--- {len(inconsistent)} termer med inkonsekvent formatering ---")


if __name__ == "__main__":
    main()
