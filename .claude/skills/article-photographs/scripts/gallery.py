#!/usr/bin/env python3
"""gallery.py <run> — the review page on which the user chooses.

    python3 -I .claude/skills/article-photographs/scripts/gallery.py <run>

Reads <run>/final/forslag.json and the previews prepare.mjs made, and writes
<run>/bildforslag.html: one self-contained page with every proposal beside the paragraph
it would follow, its caption, alt text, credit and source, and Use / Maybe / No on each.
Publish it with the Artifact tool, capabilities {"db": {}}, so the choices reach this
session; the page also shows them as a list to paste.

The words at the top and in the margin are this round's own. Put them in <run>/page.json:

    {"lede": "Seven free pictures for … Nothing has been placed in a text: choose here first.",
     "facts": [["980", "pictures looked at"], ["7", "kept"]],
     "sections": [{"title": "What was cut, and why",
                   "items": [["Graphic photographs.", "The dead in shrouds, …"]]},
                  {"title": "Not found", "items": [["The famine of summer 2025.", "No free …"]]}]}

Say what was cut and what could not be found: that is what lets the user trust the rest.
"""
import base64
import datetime
import html
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
WORK = Path(os.environ.get("BILDER_WORK") or Path.home() / ".cache/islam-se-bilder")
COLLECTION = {"articles": "Essäer", "svar": "Pelare & tro, svar", "fordjupning": "Fördjupningar"}

if len(sys.argv) != 2:
    sys.exit(__doc__)
run = WORK / sys.argv[1]
items = json.load(open(run / "final" / "forslag.json", encoding="utf-8"))
if not items:
    sys.exit("forslag.json is empty")


def title_of(path):
    text = (ROOT / path).read_text(encoding="utf-8")
    m = re.search(r'^title:\s*"?(.*?)"?\s*$', text, re.M)
    if not m:
        sys.exit(f"{path}: no title in the frontmatter")
    return m.group(1)


def collection_of(path):
    return COLLECTION.get(Path(path).parent.name, Path(path).parent.name)


# A handful of texts: one group each. Many: by kind, or the page is a list of headings.
few = len({it["texts"][0]["file"] for it in items}) <= 4
data = []
for it in items:
    first = it["texts"][0]["file"]
    preview = run / "final" / "_preview" / it["file"]
    data.append({
        "id": it["id"], "role": it["role"], "suggest": it["verdict"],
        "group": title_of(first) if few else collection_of(first),
        "w": it["width"], "h": it["height"], "kb": round(it["bytes"] / 1024),
        "places": [{"page": title_of(t["file"]), "file": t["file"], "section": t["section"], "after": t["after"]} for t in it["texts"]],
        "alt": it["alt"], "caption": it["caption"], "credit": it["credit"], "licence": it["licence"],
        "source": it["source"], "note": it["note"], "markdown": it["markdown"],
        "img": "data:image/webp;base64," + base64.b64encode(preview.read_bytes()).decode(),
    })
order = list(dict.fromkeys(d["group"] for d in data)) if few else [g for g in COLLECTION.values() if any(d["group"] == g for d in data)]
data.sort(key=lambda d: (order.index(d["group"]) if d["group"] in order else 99, d["suggest"] != "use"))

page = json.load(open(run / "page.json", encoding="utf-8")) if (run / "page.json").exists() else {}
esc = html.escape
texts = len({p["file"] for d in data for p in d["places"][:1]})
rec = sum(d["suggest"] == "use" for d in data)
lede = page.get("lede") or (
    f"{len(data)} free pictures proposed for {texts} texts. Each has been looked at, its licence read back "
    "from the source, and it has been cropped, resized and encoded for the reading column. "
    "Nothing has been placed in a text: choose here first."
)
facts = page.get("facts") or [[str(len(data)), "proposed"], [str(rec), "recommended"], [str(len(data) - rec), "for your eye"]]
today = datetime.date.today()
date = page.get("date") or f"{today.day} {today.strftime('%B %Y')}"

aside = ""
for sec in page.get("sections", []):
    lis = "".join(f"\t\t\t\t<li><b>{esc(b)}</b> {esc(t)}</li>\n" for b, t in sec["items"])
    aside += f"\t\t<section>\n\t\t\t<h2>{esc(sec['title'])}</h2>\n\t\t\t<ul>\n{lis}\t\t\t</ul>\n\t\t</section>\n"

template = Path(__file__).with_name("gallery.template.html").read_text(encoding="utf-8")
for token in ('"__RUN__"', '"__DATA__"', "<!--LEDE-->", "<!--FACTS-->", "<!--ASIDE-->", "<!--DATE-->"):
    if template.count(token) != 1:
        sys.exit(f"gallery.template.html: expected {token} exactly once")
out = (template
       .replace("<!--DATE-->", esc(date))
       .replace("<!--LEDE-->", "".join(f"<p>{esc(p)}</p>" for p in ([lede] if isinstance(lede, str) else lede)))
       .replace("<!--FACTS-->", " ".join(f"<span><b>{esc(n)}</b> {esc(label)}</span>" for n, label in facts))
       .replace("<!--ASIDE-->", aside)
       .replace('"__RUN__"', json.dumps(sys.argv[1]))
       # A JSON string inside a JS string literal: encoded twice, and never a literal </script>.
       .replace('"__DATA__"', json.dumps(json.dumps(data, ensure_ascii=False), ensure_ascii=False).replace("</", "<\\/")))
target = run / "bildforslag.html"
target.write_text(out, encoding="utf-8")
print(f"{len(data)} proposals → {target} ({target.stat().st_size / 1e6:.2f} MB)")
