#!/usr/bin/env python3
"""Find repeated content words within a short span in article markdown files.

Usage: python scripts/find-repetitions.py [--window N] [--min-len N] [file...]

Defaults to all files in data/articles/*.md.
"""

import argparse
import re
import sys
from pathlib import Path

# Swedish stop words — words too common to flag
STOP_WORDS = {
    # articles, pronouns, prepositions, conjunctions, common verbs
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
    "blir", "blev", "varit", "vara", "bli", "bli", "ha", "inte",
    "dess", "hans", "hennes", "deras", "vår", "vårt", "våra",
    "the", "and", "of", "in", "to", "is", "that", "it",  # English stop words
}

# Skip footnote lines, frontmatter, headings, blockquotes
def is_content_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if stripped.startswith("[^"):  # footnote
        return False
    if stripped.startswith("#"):  # heading
        return False
    if stripped.startswith(">"):  # blockquote (quoted source, not author's words)
        return False
    if stripped.startswith("---"):  # frontmatter delimiter
        return False
    if re.match(r"^\w+:", stripped):  # frontmatter field
        return False
    return True


def tokenize(text: str) -> list[tuple[str, str]]:
    """Return list of (original_token, normalized_form) pairs."""
    # Remove markdown formatting but keep words
    text = re.sub(r"\*+", "", text)  # bold/italic
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # links
    text = re.sub(r"\[\^[^\]]*\]", "", text)  # footnote refs
    tokens = re.findall(r"[A-Za-zÀ-öø-ÿ\u0600-\u06FF]+", text)
    return [(t, t.lower()) for t in tokens]


def is_parallelism(tokens: list[tuple[str, str]], pos1: int, pos2: int) -> bool:
    """Detect deliberate parallel structures like 'X kräver A. Y kräver B'."""
    # Check if the words surrounding both occurrences form a parallel pattern
    # Look at the word immediately before each occurrence
    if pos1 > 0 and pos2 > 0:
        _, prev1 = tokens[pos1 - 1] if pos1 > 0 else ("", "")
        _, prev2 = tokens[pos2 - 1] if pos2 > 0 else ("", "")
        # Different subject + same verb = parallelism
        if prev1 != prev2 and len(prev1) >= 3 and len(prev2) >= 3:
            # Check if word after each occurrence also differs (parallel objects)
            max_i = len(tokens) - 1
            _, next1 = tokens[pos1 + 1] if pos1 < max_i else ("", "")
            _, next2 = tokens[pos2 + 1] if pos2 < max_i else ("", "")
            if next1 != next2:
                return True
    return False


def find_repetitions(text: str, window: int, min_len: int) -> list[tuple[str, int, int]]:
    """Find repeated words within a sliding window.

    Returns list of (word, position1, position2).
    """
    tokens = tokenize(text)
    results = []
    seen: dict[str, int] = {}

    for i, (original, normalized) in enumerate(tokens):
        if len(normalized) < min_len:
            continue
        if normalized in STOP_WORDS:
            continue

        if normalized in seen:
            prev_pos = seen[normalized]
            distance = i - prev_pos
            if distance <= window:
                if not is_parallelism(tokens, prev_pos, i):
                    results.append((original, prev_pos, i))

        seen[normalized] = i

    return results


def extract_context(text: str, word: str) -> str:
    """Highlight repeated word in the text."""
    # Bold the repeated word for visibility
    pattern = re.compile(re.escape(word), re.IGNORECASE)
    return pattern.sub(f">>>{word}<<<", text)


def process_file(path: Path, window: int, min_len: int) -> list[dict]:
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()
    findings = []

    # Process content lines, joining into paragraphs
    in_frontmatter = False
    para_lines: list[tuple[int, str]] = []

    for line_num, line in enumerate(lines, 1):
        if line.strip() == "---":
            in_frontmatter = not in_frontmatter
            continue
        if in_frontmatter:
            continue

        if is_content_line(line):
            para_lines.append((line_num, line))
        else:
            # Process accumulated paragraph
            if para_lines:
                para_text = " ".join(l for _, l in para_lines)
                first_line = para_lines[0][0]
                reps = find_repetitions(para_text, window, min_len)
                for word, pos1, pos2 in reps:
                    findings.append({
                        "file": path.name,
                        "line": first_line,
                        "word": word,
                        "distance": pos2 - pos1,
                        "context": para_text[:200],
                    })
            para_lines = []

    # Don't forget last paragraph
    if para_lines:
        para_text = " ".join(l for _, l in para_lines)
        first_line = para_lines[0][0]
        reps = find_repetitions(para_text, window, min_len)
        for word, pos1, pos2 in reps:
            findings.append({
                "file": path.name,
                "line": first_line,
                "word": word,
                "distance": pos2 - pos1,
                "context": para_text[:200],
            })

    return findings


def main():
    parser = argparse.ArgumentParser(description="Find repeated words in articles")
    parser.add_argument("files", nargs="*", help="Files to check (default: data/articles/*.md)")
    parser.add_argument("--window", type=int, default=8,
                        help="Max distance in words between repetitions (default: 8)")
    parser.add_argument("--min-len", type=int, default=4,
                        help="Minimum word length to consider (default: 4)")
    parser.add_argument("--min-dist", type=int, default=1,
                        help="Minimum distance to report (default: 1, use 2+ to skip deliberate repeats)")
    args = parser.parse_args()

    if args.files:
        paths = [Path(f) for f in args.files]
    else:
        paths = sorted(Path("data/articles").glob("*.md"))

    if not paths:
        print("No files found.", file=sys.stderr)
        sys.exit(1)

    all_findings = []
    for path in paths:
        all_findings.extend(process_file(path, args.window, args.min_len))

    # Filter by minimum distance
    all_findings = [f for f in all_findings if f["distance"] >= args.min_dist]

    if not all_findings:
        print("Inga upprepningar hittades.")
        return

    # Sort by distance (closest = most noticeable)
    all_findings.sort(key=lambda f: f["distance"])

    current_file = None
    for f in all_findings:
        if f["file"] != current_file:
            current_file = f["file"]
            print(f"\n{'='*60}")
            print(f"  {current_file}")
            print(f"{'='*60}")
        print(f"\n  rad {f['line']:>3}  «{f['word']}» (avstånd: {f['distance']} ord)")
        print(f"  {f['context']}")

    print(f"\n--- Totalt: {len(all_findings)} upprepningar i {len(paths)} filer ---")


if __name__ == "__main__":
    main()
