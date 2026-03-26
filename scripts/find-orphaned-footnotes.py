#!/usr/bin/env python3
"""Find orphaned footnotes: references without definitions or definitions without references."""

import re
import sys
from pathlib import Path


def check_file(path: Path) -> list[str]:
    content = path.read_text(encoding="utf-8")
    issues = []

    # Find all footnote references in text: [^N]
    refs = set(re.findall(r"\[\^(\d+)\](?!:)", content))

    # Find all footnote definitions: [^N]:
    defs = set(re.findall(r"\[\^(\d+)\]:", content))

    for ref in sorted(refs, key=int):
        if ref not in defs:
            issues.append(f"  [^{ref}] refereras men saknar definition")

    for d in sorted(defs, key=int):
        if d not in refs:
            issues.append(f"  [^{d}] definieras men refereras aldrig")

    # Check for gaps in numbering
    if defs:
        max_num = max(int(d) for d in defs)
        expected = set(str(i) for i in range(1, max_num + 1))
        missing = expected - defs
        for m in sorted(missing, key=int):
            if m not in refs:  # already reported above
                issues.append(f"  [^{m}] saknas i numreringssekvensen")

    return issues


def main():
    paths = sorted(Path("data/articles").glob("*.md"))
    if not paths:
        print("Inga filer hittade.", file=sys.stderr)
        sys.exit(1)

    total = 0
    for path in paths:
        issues = check_file(path)
        if issues:
            print(f"\n{path.name}:")
            for issue in issues:
                print(issue)
            total += len(issues)

    if total == 0:
        print("Inga problem hittade.")
    else:
        print(f"\n--- Totalt: {total} problem i {len(paths)} filer ---")


if __name__ == "__main__":
    main()
