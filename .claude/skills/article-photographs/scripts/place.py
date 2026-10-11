#!/usr/bin/env python3
"""place.py <run> [--dry-run] <id> … — put the pictures the user chose into the texts.

    python3 -I .claude/skills/article-photographs/scripts/place.py <run> --dry-run <id> <id>
    python3 -I .claude/skills/article-photographs/scripts/place.py <run> <id> <id>

For each id in <run>/final/forslag.json it

  1. copies the file to apps/web/src/assets/images/inline/ (a card picture goes to
     images/fakta/<slug>.webp, which is all a Pelare & tro card needs),
  2. sets the figure line on a line of its own after the paragraph that ends with the
     anchor (`texts[0].after`),
  3. adds the licence to apps/web/src/data/image-credits.json, which the page's
     structured data and src/lib/image-credits.test.ts read.

It does NOT write the reader's credit. That is prose in the page's own apparatus — an
essay's note, a `sources:` entry on a svar or a fördjupning — and it is written by hand
from the facts this prints.

It stops rather than guess: an anchor that matches no paragraph or two, a paragraph not
followed by a blank line, a picture already placed. It prints the paragraph the figure
will stand BEFORE, because that is the one nobody reads: a figure that splits »Kanske …«
from »I så fall …« has to move.
"""
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
WORK = Path(os.environ.get("BILDER_WORK") or Path.home() / ".cache/islam-se-bilder")
IMAGES = ROOT / "apps/web/src/assets/images"
REGISTRY = ROOT / "apps/web/src/data/image-credits.json"

args = [a for a in sys.argv[1:] if a != "--dry-run"]
dry = "--dry-run" in sys.argv
if len(args) < 2:
    sys.exit(__doc__)
run = WORK / args[0]
proposals = {it["id"]: it for it in json.load(open(run / "final" / "forslag.json", encoding="utf-8"))}
missing = [i for i in args[1:] if i not in proposals]
if missing:
    sys.exit(f"not in forslag.json: {', '.join(missing)}")

texts, copies, credits = {}, [], {}
registry = json.load(open(REGISTRY, encoding="utf-8"))
was_sorted = list(registry) == sorted(registry)


def lines_of(rel):
    if rel not in texts:
        texts[rel] = (ROOT / rel).read_text(encoding="utf-8").split("\n")
    return texts[rel]


def prose_between(lines, a, b):
    """How many paragraphs of prose stand between two line numbers."""
    return sum(1 for l in lines[a:b] if l.strip() and not l.startswith(("#", "![", ">", "```", "[^")))


for pid in args[1:]:
    it = proposals[pid]
    place = it["texts"][0]
    rel = place["file"]
    entry = {"kind": it["kind"], "by": it["author"], "licence": it["licence"], "licenceUrl": it["licenceUrl"], "source": it["source"]}
    if it["changed"]:
        entry["changed"] = it["changed"]

    if it["role"] == "card":
        slug = Path(rel).stem
        copies.append((run / "final" / it["file"], IMAGES / "fakta" / f"{slug}.webp"))
        registry[f"fakta/{slug}"] = entry
        print(f"{pid}\n  card and hero of {rel}: no line in the text")
    else:
        lines = lines_of(rel)
        if any(f"/{pid}.webp" in l for l in lines):
            sys.exit(f"{pid}: already placed in {rel}")
        hits = [n for n, l in enumerate(lines) if place["after"] in l and not l.startswith(("[^", "!["))]
        if len(hits) != 1:
            sys.exit(f"{pid}: the anchor »{place['after']}« matches {len(hits)} paragraphs in {rel}; it must match one")
        n = hits[0]
        while lines[n].startswith(">") and n + 1 < len(lines) and lines[n + 1].startswith(">"):
            n += 1  # a quotation over several lines: the figure stands after all of it
        if lines[n + 1] != "":
            sys.exit(f"{pid}: line {n + 2} of {rel} is not blank; the anchor is not the end of a paragraph")
        after = next((k for k in range(n + 2, len(lines)) if lines[k].strip()), None)
        # The nearest figure or fence on either side, and the prose in between.
        above = next((k for k in range(n - 1, -1, -1) if lines[k].startswith(("![", "```"))), None)
        below = next((k for k in range(n + 2, len(lines)) if lines[k].startswith(("![", "```"))), None)
        print(f"{pid}\n  {rel}:{n + 1}  after  …{lines[n][-90:]}")
        print(f"  stands before  {(lines[after][:150] + ' …') if after is not None else '(the end of the text)'}")
        if after is not None and lines[after].startswith("#"):
            print("  · closes its section: the next line is a heading")
        if above is not None and prose_between(lines, above + 1, n + 1) < 2:
            print(f"  ⚠ only one paragraph below the figure or fence on line {above + 1}: too close")
        if below is not None and prose_between(lines, n + 2, below) < 2:
            print(f"  ⚠ only one paragraph above the figure or fence on line {below + 1}: too close")
        lines[n + 1:n + 1] = ["", it["markdown"]]
        copies.append((run / "final" / it["file"], IMAGES / "inline" / it["file"]))
        registry[f"inline/{pid}"] = entry
    credits.setdefault(rel, []).append(it)

print("\nCredit to write by hand, in the page's own apparatus:")
for rel, its in credits.items():
    where = "the note that already credits pictures, else note 1" if "/articles/" in rel else "a `sources:` entry »Bild: …« with the Commons page as url"
    print(f"  {rel}  ({where})")
    for it in its:
        print(f"    {it['author']} · {it['licence']} ({it['licenceUrl']}){' · ' + it['changed'] if it['changed'] else ''}\n      {it['source']}")

if dry:
    print("\ndry run: nothing written")
    sys.exit(0)
for src, dst in copies:
    shutil.copyfile(src, dst)
for rel, lines in texts.items():
    (ROOT / rel).write_text("\n".join(lines), encoding="utf-8")
if was_sorted:
    registry = dict(sorted(registry.items()))
REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent="\t") + "\n", encoding="utf-8")
print(f"\nplaced {len(copies)} pictures in {len(texts)} texts; the registry has {len(registry)} entries")
