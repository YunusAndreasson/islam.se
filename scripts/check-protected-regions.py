#!/usr/bin/env python3
"""Bevisa att en språkredigering inte rört det den inte får röra.

Ett språkpass ska bara ändra författarens egen prosa. Citat är verifierad
källtext, fotnoter och rubriker är strukturen, frontmatter bär SEO-lasten på
sidor som redan rankar — och två textmönster driver dessutom recitationsspelaren:

  * essä  — fotnotsdefinitionen "Koranen, <namn> S:A"  (rehype-quran-verse)
  * svar  — källraden under citatet "> — Koranen S:A"  (ankrad i radslutet)

Skriptet jämför arbetskopian mot ett git-läge och rapporterar varje ändring
inne i ett skyddat område. Kör det efter varje redigeringsomgång.

Användning:
    python scripts/check-protected-regions.py data/svar/vad-ar-zakat.md
    python scripts/check-protected-regions.py --base HEAD~1 data/articles/*.md
    python scripts/check-protected-regions.py --json data/svar/*.md

Slutkod 1 om något skyddat område har ändrats.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# Fotnotsdefinition som pekar ut en vers — driver essäernas spelare + citatindex.
ESSAY_VERSE = re.compile(r"\[\^[^\]]+\]:\s*(?:Koranen,\s*|sura\s+)[^0-9\n]*?(\d{1,3}):(\d{1,3})")
# Källrad under ett blockcitat — driver svarssidornas spelare. Ankrad i radslutet.
SVAR_VERSE = re.compile(
    r"[—–-]\s*Koranen\s+(\d{1,3}):(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?(?:\s*\([^)]*\))?[\s.]*$"
)
QUOTE_SPAN = re.compile(r'"[^"\n]{1,400}"|”[^”\n]{1,400}”|«[^»\n]{1,400}»')


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def regions(raw: str) -> dict[str, list[str]]:
    """Plocka ut de skyddade områdena ur en artikeltext."""
    lines = raw.splitlines()

    frontmatter: list[str] = []
    body: list[str] = []
    if lines and lines[0].strip() == "---":
        end = next((i for i, l in enumerate(lines[1:], 1) if l.strip() == "---"), None)
        if end is not None:
            frontmatter = lines[1:end]
            body = lines[end + 1:]
        else:
            body = lines
    else:
        body = lines

    blockquotes, headings, footnote_defs, footnote_refs = [], [], [], []
    verses: list[str] = []
    figures: list[str] = []

    # ⚠️ Figurblocken är skyddade i sin helhet, rad för rad. En ```chart- eller
    # ```table-spec är maskinläst: ett omskrivet tal, en ändrad `source:`-rad eller en
    # ombruten datarad är ett sakfel som inget språkpass har mandat att göra. Prompterna
    # ber om det, men en prompt är en bön och det här är en kontroll.
    in_fence = False
    for line in body:
        stripped = line.strip()
        if not in_fence and re.match(r"^```(chart|table)\b", stripped):
            in_fence = True
            figures.append(norm(stripped))
            continue
        if in_fence:
            figures.append(norm(stripped))
            if stripped == "```":
                in_fence = False
            continue

        if stripped.startswith(">"):
            blockquotes.append(norm(stripped.lstrip("> ")))
            m = SVAR_VERSE.search(stripped)
            if m:
                verses.append(f"{m.group(1)}:{m.group(2)}" + (f"-{m.group(3)}" if m.group(3) else ""))
        elif stripped.startswith("#"):
            headings.append(norm(stripped))
        elif re.match(r"^\[\^[^\]]+\]:", stripped):
            footnote_defs.append(norm(stripped))
            m = ESSAY_VERSE.search(stripped)
            if m:
                verses.append(f"{m.group(1)}:{m.group(2)}")
        footnote_refs.extend(re.findall(r"\[\^([^\]]+)\](?!:)", line))

    body_text = "\n".join(body)
    inline_quotes = [norm(m.group()) for m in QUOTE_SPAN.finditer(body_text)]

    return {
        "frontmatter": [norm(l) for l in frontmatter if l.strip()],
        "blockquote": blockquotes,
        "heading": headings,
        "footnote-def": footnote_defs,
        "footnote-ref": footnote_refs,
        "inline-quote": inline_quotes,
        "quran-player-ref": verses,
        "figure": figures,
    }


LABELS = {
    "frontmatter": "frontmatter (SEO-last på en sida som rankar)",
    "blockquote": "blockcitat (verifierad källtext)",
    "heading": "rubrik (struktur + sökfråga)",
    "footnote-def": "fotnotsdefinition",
    "footnote-ref": "fotnotsmarkör",
    "inline-quote": "citat i löptexten",
    "quran-player-ref": "versreferens som driver recitationsspelaren",
    "figure": "figurblock (```chart/```table — maskinläst spec, inte prosa)",
}


# Områden där ett RENT TILLÄGG är tillåtet, medan en ändring eller strykning inte är det.
#
# ⚠️ Figurblocken hör hit därför att `pnpm produce figures` lägger till ett block med flit —
# och utan undantaget fällde den här kontrollen garanterat den fil kommandot just skrivit.
# Verktyget som skyddar figurer blockerade verktyget som lägger till dem, utan att kunna
# skilja en infogning från en förvanskning. Ett tillägg rapporteras fortfarande, men fäller
# inte: det som ska fällas är att en spec ÄNDRAS eller FÖRSVINNER, för det är då ett tal
# eller en källrad har skrivits om av något som inte har mandat att göra det.
ADDITIVE_OK = {"figure"}


def diff_regions(before: dict, after: dict) -> list[dict]:
    """Ordnad multimängdsjämförelse per område."""
    findings = []
    for key in before:
        old, new = before[key], after[key]
        if old == new:
            continue
        old_pool = list(old)
        removed = []
        for item in old:
            if item in new:
                continue
            removed.append(item)
        added = []
        for item in new:
            if item in old_pool:
                old_pool.remove(item)
                continue
            added.append(item)
        # Oförändrat innehåll men ny ordning är också värt att veta.
        if not removed and not added:
            findings.append({"region": key, "label": LABELS[key], "kind": "omordnad",
                             "removed": [], "added": []})
            continue
        kind = "tillagd" if (not removed and key in ADDITIVE_OK) else "ändrad"
        findings.append({
            "region": key,
            "label": LABELS[key],
            "kind": kind,
            "removed": removed,
            "added": added,
        })
    return findings


def is_violation(finding: dict) -> bool:
    """Ett rent tillägg i ett additivt område är en notering, inte en överträdelse."""
    return finding["kind"] != "tillagd"


def git_show(repo_root: Path, ref: str, rel_path: str) -> str | None:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "show", f"{ref}:{rel_path}"],
        capture_output=True, text=True,
    )
    return result.stdout if result.returncode == 0 else None


def repo_root_of(path: Path) -> Path | None:
    result = subprocess.run(
        ["git", "-C", str(path.parent), "rev-parse", "--show-toplevel"],
        capture_output=True, text=True,
    )
    return Path(result.stdout.strip()) if result.returncode == 0 else None


def check(path: Path, ref: str) -> dict:
    root = repo_root_of(path)
    if root is None:
        return {"file": str(path), "status": "inte-i-git", "findings": []}

    rel = str(path.resolve().relative_to(root))
    baseline = git_show(root, ref, rel)
    if baseline is None:
        return {"file": str(path), "status": f"saknas-i-{ref}", "findings": []}

    current = path.read_text(encoding="utf-8")
    if baseline == current:
        return {"file": str(path), "status": "oförändrad", "findings": []}

    findings = diff_regions(regions(baseline), regions(current))
    violations = [f for f in findings if is_violation(f)]
    return {
        "file": str(path),
        "status": "överträdelse" if violations else "ren",
        "findings": findings,
    }


def print_report(result: dict) -> None:
    name = Path(result["file"]).name
    status = result["status"]
    if status == "ren":
        added = [f for f in result["findings"] if not is_violation(f)]
        if added:
            # Värt att se, inte värt att fälla.
            print(f"  OK   {name}  — prosaändringar; nytt innehåll i skyddat område:")
            for f in added:
                print(f"         + {f['label']} ({len(f['added'])} rader tillagda)")
            return
        print(f"  OK   {name}  — prosaändringar, inga skyddade områden rörda")
        return
    if status != "överträdelse":
        print(f"  --   {name}  ({status})")
        return

    print(f"\nFEL  {name} — skyddade områden har ändrats")
    for f in result["findings"]:
        if not is_violation(f):
            continue
        print(f"       {f['label']}  [{f['kind']}]")
        for item in f["removed"]:
            print(f"         - {item[:150]}")
        for item in f["added"]:
            print(f"         + {item[:150]}")
    print("       → återställ dessa rader; ett språkpass rör bara författarens prosa")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Kontrollera att ett språkpass bara rört författarens prosa"
    )
    parser.add_argument("files", nargs="+", help="Markdownfiler att kontrollera")
    parser.add_argument("--base", default="HEAD", help="Git-läge att jämföra mot (standard: HEAD)")
    parser.add_argument("--json", action="store_true", help="JSON i stället för text")
    args = parser.parse_args()

    results = []
    for filepath in args.files:
        path = Path(filepath)
        if not path.exists():
            print(f"Hittar inte: {filepath}", file=sys.stderr)
            continue
        results.append(check(path, args.base))

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        for result in results:
            print_report(result)
        bad = [r for r in results if r["status"] == "överträdelse"]
        edited = [r for r in results if r["status"] == "ren"]
        print(f"\n{'=' * 60}")
        print(f"  {len(results)} filer — {len(edited)} redigerade och rena, "
              f"{len(bad)} med rörda skyddade områden")
        print(f"{'=' * 60}")

    return 1 if any(r["status"] == "överträdelse" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
