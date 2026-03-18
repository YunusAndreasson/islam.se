#!/usr/bin/env python3
"""Renumber footnotes in markdown files to be sequential based on order of first appearance in body text."""

import re
import sys
from pathlib import Path


def renumber_footnotes(filepath: str) -> tuple[bool, str]:
    """Renumber footnotes in a file. Returns (changed, message)."""
    content = Path(filepath).read_text(encoding="utf-8")

    # Split into body and footnote definitions
    # Footnote definitions start with [^N]: at the beginning of a line
    lines = content.split("\n")

    # Find where footnote definitions begin (after the last ---)
    body_lines = []
    footnote_lines = []
    in_footnotes = False

    for line in lines:
        if re.match(r'^\[\^\d+\]:', line):
            in_footnotes = True
        if in_footnotes:
            footnote_lines.append(line)
        else:
            body_lines.append(line)

    body_text = "\n".join(body_lines)
    footnote_text = "\n".join(footnote_lines)

    # Find all footnote references in body text, in order of first appearance
    body_refs = re.findall(r'\[\^(\d+)\](?!:)', body_text)

    # Get unique references in order of first appearance
    seen = set()
    ordered_refs = []
    for ref in body_refs:
        if ref not in seen:
            seen.add(ref)
            ordered_refs.append(ref)

    # Parse footnote definitions
    footnote_defs = {}
    current_num = None
    current_lines = []

    for line in footnote_lines:
        match = re.match(r'^\[\^(\d+)\]:\s*(.*)', line)
        if match:
            if current_num is not None:
                footnote_defs[current_num] = "\n".join(current_lines)
            current_num = match.group(1)
            current_lines = [match.group(2)]
        elif current_num is not None and line.strip():
            current_lines.append(line)

    if current_num is not None:
        footnote_defs[current_num] = "\n".join(current_lines)

    # Check if already sequential
    already_sequential = True
    for i, ref in enumerate(ordered_refs, 1):
        if ref != str(i):
            already_sequential = False
            break

    # Also check for orphan definitions (defined but not in body)
    defined_nums = set(footnote_defs.keys())
    referenced_nums = set(ordered_refs)
    orphan_defs = defined_nums - referenced_nums
    missing_defs = referenced_nums - defined_nums

    if already_sequential and not orphan_defs:
        return False, f"{filepath}: already sequential ({len(ordered_refs)} footnotes)"

    # Build mapping: old_number -> new_number
    mapping = {}
    for new_num, old_num in enumerate(ordered_refs, 1):
        mapping[old_num] = str(new_num)

    # Replace in body text: [^old] -> [^new]
    # We need to do this carefully to avoid partial replacements
    # First replace with temporary placeholders
    new_body = body_text
    for old_num in sorted(mapping.keys(), key=lambda x: -int(x)):  # largest first
        new_body = re.sub(
            r'\[\^' + old_num + r'\](?!:)',
            f'[^__TEMP_{mapping[old_num]}__]',
            new_body
        )

    # Then replace placeholders with final numbers
    for new_num in range(1, len(ordered_refs) + 1):
        new_body = new_body.replace(f'[^__TEMP_{new_num}__]', f'[^{new_num}]')

    # Build new footnote section in order
    new_footnote_lines = []
    for new_num_int, old_num in enumerate(ordered_refs, 1):
        new_num = str(new_num_int)
        if old_num in footnote_defs:
            def_text = footnote_defs[old_num]
            new_footnote_lines.append(f"[^{new_num}]: {def_text}")
        else:
            new_footnote_lines.append(f"[^{new_num}]: [MISSING DEFINITION - was [^{old_num}]]")

    # Reconstruct file
    new_content = new_body + "\n" + "\n".join(new_footnote_lines) + "\n"

    Path(filepath).write_text(new_content, encoding="utf-8")

    changes = []
    for old_num, new_num in sorted(mapping.items(), key=lambda x: int(x[1])):
        if old_num != new_num:
            changes.append(f"  [^{old_num}] -> [^{new_num}]")

    if orphan_defs:
        changes.append(f"  Removed orphan definitions: {', '.join(sorted(orphan_defs, key=int))}")

    return True, f"{filepath}: renumbered {len(ordered_refs)} footnotes\n" + "\n".join(changes)


def main():
    if len(sys.argv) < 2:
        # Process all articles
        article_dir = Path("data/articles")
        files = sorted(article_dir.glob("*.md"))
    else:
        files = [Path(f) for f in sys.argv[1:]]

    changed_count = 0
    for f in files:
        changed, msg = renumber_footnotes(str(f))
        if changed:
            changed_count += 1
            print(msg)
        else:
            print(msg)

    print(f"\n{changed_count}/{len(files)} files modified")


if __name__ == "__main__":
    main()
