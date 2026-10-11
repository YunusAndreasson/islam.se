#!/usr/bin/env python3
"""check.py <distDir> <path> … — what a BUILT page does with its photographs.

    cd apps/web && BONETIDER_SAMPLE=12 pnpm exec astro build --outDir dist-bild
    python3 -I ../../.claude/skills/article-photographs/scripts/check.py dist-bild /om-dessa-ord-nar-er/ /svar/vad-ar-hajj/

Against a build, never the dev server: a running dev server keeps the rehype plugins it
started with, so it can show a page the build will not make. Build to a directory of
your own (never `dist`, never another session's), read this, then remove the directory.

For every page it holds each figure in the text to five things, and exits 1 on a miss:

  - it has a caption, a srcset and sizes (one 1400 px file for every phone is a miss);
  - a picture with an entry in src/data/image-credits.json has its ImageObject with a
    licence in the page's structured data;
  - it is listed in sitemap-images.xml;
  - no pull quote stands directly against it (a display line and a photograph need prose
    between them);
  - no repository path (`apps/web/src/…`) leaks into the HTML or the page's Markdown twin.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if len(sys.argv) < 3:
    sys.exit(__doc__)
dist = Path(sys.argv[1])
registry = json.load(open(ROOT / "apps/web/src/data/image-credits.json", encoding="utf-8"))
sitemap = (dist / "sitemap-images.xml").read_text(encoding="utf-8")
failed = False


def miss(page, what):
    global failed
    failed = True
    print(f"  ✗ {page}: {what}")


for arg in sys.argv[2:]:
    path = "/" + arg.strip("/") + "/"
    file = dist / path.strip("/") / "index.html"
    if not file.exists():
        miss(path, f"no such page in the build ({file})")
        continue
    h = file.read_text(encoding="utf-8")
    figures = re.findall(r'<figure class="prose-figure"[^>]*>(.*?)</figure>', h, re.S)
    names = []
    for f in figures:
        # Astro names a rendition <file>.<hash>_<transform>.webp; the file name is ours.
        m = re.search(r'src="[^"]*/([a-z0-9-]+)\.[A-Za-z0-9_-]+\.webp"', f)
        name = m.group(1) if m else "?"
        names.append(name)
        if "srcset=" not in f or "sizes=" not in f:
            miss(path, f"{name} has no srcset: every reader gets the full-size file")
        if "<figcaption" not in f:
            miss(path, f"{name} has no caption")
        if name not in sitemap:
            miss(path, f"{name} is not in sitemap-images.xml")

    licensed = 0
    for block in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(block)
        except ValueError:
            continue
        for o in d if isinstance(d, list) else d.get("@graph", [d]):
            if isinstance(o, dict) and o.get("@type") == "ImageObject" and o.get("license"):
                licensed += 1
    expected = sum(f"inline/{n}" in registry for n in names)
    if licensed < expected:
        miss(path, f"{expected} pictures have a registry entry but only {licensed} ImageObject blocks carry a licence")

    order = []
    for m in re.finditer(r'<(aside class="pull-quote"|figure class="prose-figure"|h2|blockquote|p)[ >]', h):
        order.append("quote" if m.group(1).startswith("aside") else "figure" if m.group(1).startswith("figure") else m.group(1))
    flat, skip = [], False
    for t in order:  # the pull quote's own inner <p> is not a paragraph of the text
        if not skip:
            flat.append(t)
        skip = t == "quote" and not skip
    if any({flat[k], flat[k + 1]} == {"quote", "figure"} for k in range(len(flat) - 1)):
        miss(path, "a pull quote stands directly against a photograph")

    twin = dist / (path.strip("/") + ".md")
    leaks = h.count("apps/web/src") + (twin.read_text(encoding="utf-8").count("apps/web/src") if twin.exists() else 0)
    if leaks:
        miss(path, f"{leaks} repository paths leak into the HTML or the Markdown twin")
    print(f"{path}: {len(figures)} figures in the text ({', '.join(names) or 'none'}), {licensed} with licence data")

sys.exit(1 if failed else 0)
