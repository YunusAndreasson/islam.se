#!/usr/bin/env python3
"""commons.py — find free pictures on Wikimedia Commons by script, then look at them.

    python3 -I commons.py cats    <keyword> …                    which categories exist, and how big
    python3 -I commons.py harvest <run> [target …]               query, filter, download thumbs
    python3 -I commons.py sheets  <run> <target> … [--cell 200]  numbered contact sheets to Read
    python3 -I commons.py list    <run> <target> [n | a-b] …     what each number is
    python3 -I commons.py look    <run> <name> <target:n> …      finalists at 960 px, three a row
    python3 -I commons.py exif    <run> <target:n> …             date, coordinates, camera

A run is a directory under $BILDER_WORK (default ~/.cache/islam-se-bilder): it holds
targets.json, and everything fetched lands beside it. Nothing here is ever committed.
Run with `python3 -I`: the directory holds downloaded files.

targets.json is a list. Each target names ONE thing a text names:

    {"id": "ord-sjukhus", "what": "al-Shifa, Nassersjukhuset",
     "sources": [{"cat": "Al-Shifa Medical Complex", "depth": 1, "skipcat": "Football"},
                 {"q": "Shifa hospital Gaza destroyed", "limit": 50},
                 {"user": "Hla.bashbash"}],
     "since": "2023-10-07",          upload date, when the subject is an event
     "minLong": 1400, "minShort": 900, "cap": 60,
     "must": "regex", "mustnot": "regex",   on title + description + categories
     "exclude": "regex",             on artist + credit + categories: whose pictures we do not print
     "landscape": 1.3, "sort": "newest"}

A `cat` source with depth walks subcategories. Keep it to a category that IS the subject:
a broad parent (»Humanitarian crises of …«) drags in a thousand files about something else.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia asks for a descriptive agent. The site's address, never a person's.
UA = "islam.se-bildsok/1.0 (https://islam.se)"
WORK = os.environ.get("BILDER_WORK") or os.path.expanduser("~/.cache/islam-se-bilder")
# Commons serves thumbnails at fixed widths; an odd width is refused or rate-limited.
THUMB, LOOK = 330, 960

FREE = re.compile(r"^(cc0|cc[ -]by(-sa)?[ -]\d|public domain|pdm|no restrictions|cc-zero)", re.I)
NOT_FREE = re.compile(r"\b(nc|nd)\b", re.I)
AI = re.compile(r"ai[- ]generat|generative|midjourney|dall-?e|stable diffusion|grok|imagen", re.I)
NOT_A_PHOTO = re.compile(r"\b(map|logo|flag|chart|diagram|graph|icon|screenshot|infographic|poster|coat of arms)\b", re.I)
# Marked, not dropped: Iranian state agencies. Their frames carry a burnt-in logo and their
# name does not go in a credit line on this site. Look, and leave them.
FLAGGED = re.compile(r"tasnim|fars ?news|mehr ?news|irna|khamenei|mizan|isna|yjc|hamshahri|defapress|iqna|shabestan|abna", re.I)


def api(**params):
    url = API + "?" + urllib.parse.urlencode({"format": "json", "formatversion": "2", **params})
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # 429 and 5xx: wait and ask again
            last = e
            time.sleep(3 * (attempt + 1))
    raise last


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def run_dir(run):
    d = os.path.join(WORK, run)
    if not os.path.isdir(d):
        sys.exit(f"no run at {d} — create it and write targets.json there")
    return d


def items_of(run, target):
    path = os.path.join(run_dir(run), "data", target, "items.json")
    if not os.path.exists(path):
        sys.exit(f"{target}: not harvested yet ({path})")
    return json.load(open(path, encoding="utf-8"))


def pick(run, spec):
    target, n = spec.rsplit(":", 1)
    for item in items_of(run, target):
        if item["n"] == int(n):
            return target, item
    sys.exit(f"{spec}: no such number")


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 500:
        return True
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            return True
        except Exception:
            time.sleep(2 * (attempt + 1))
    return False


# ── cats ─────────────────────────────────────────────────────────────────────────────

def cmd_cats(keywords):
    for kw in keywords:
        print(f"## {kw}")
        d = api(action="query", list="search", srsearch=kw, srnamespace="14", srlimit="12")
        titles = [h["title"] for h in d.get("query", {}).get("search", [])]
        if not titles:
            print("   (none)")
            continue
        info = api(action="query", prop="categoryinfo", titles="|".join(titles))
        by_title = {p["title"]: p.get("categoryinfo", {}) for p in info["query"]["pages"]}
        for t in titles:
            ci = by_title.get(t, {})
            print(f"   {ci.get('files', 0):5d} files {ci.get('subcats', 0):3d} sub  {t}")


# ── harvest ──────────────────────────────────────────────────────────────────────────

def imageinfo():
    return dict(prop="imageinfo", iiprop="url|size|mime|extmetadata|user|timestamp", iiurlwidth=str(THUMB),
                iiextmetadatafilter="LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|DateTimeOriginal|Categories|Assessments")


def pages(generator):
    cont = {}
    while True:
        d = api(action="query", **generator, **imageinfo(), **cont)
        yield from d.get("query", {}).get("pages", [])
        if "continue" not in d:
            return
        cont = d["continue"]


def subcats(cat, depth, seen):
    if cat in seen:
        return
    seen.add(cat)
    yield cat
    if depth <= 0:
        return
    cont = {}
    while True:
        d = api(action="query", list="categorymembers", cmtitle=cat, cmtype="subcat", cmlimit="500", **cont)
        for m in d["query"]["categorymembers"]:
            yield from subcats(m["title"], depth - 1, seen)
        if "continue" not in d:
            return
        cont = d["continue"]


def from_source(src):
    if "cat" in src:
        skip = re.compile(src["skipcat"], re.I) if src.get("skipcat") else None
        for cat in subcats("Category:" + src["cat"], src.get("depth", 0), set()):
            if skip and skip.search(cat):
                continue
            for p in pages(dict(generator="categorymembers", gcmtitle=cat, gcmtype="file", gcmlimit="200")):
                yield p, cat
    elif "q" in src:
        found = sorted(pages(dict(generator="search", gsrsearch=src["q"] + " filetype:bitmap", gsrnamespace="6", gsrlimit="50")),
                       key=lambda p: p.get("index", 0))
        for p in found[: src.get("limit", 50)]:
            yield p, "q:" + src["q"]
    elif "user" in src:
        for p in pages(dict(generator="allimages", gaisort="timestamp", gaidir="descending", gaiuser=src["user"], gailimit="200")):
            yield p, "user:" + src["user"]
    else:
        sys.exit(f"a source needs cat, q or user: {src}")


def record(p, via, t):
    """The file as one row, or the reason it is dropped."""
    ii = p["imageinfo"][0]
    m = {k: strip(v.get("value", "")) if isinstance(v.get("value"), str) else "" for k, v in (ii.get("extmetadata") or {}).items()}
    licence, title = m.get("LicenseShortName", ""), p["title"]
    desc, cats = m.get("ImageDescription", ""), m.get("Categories", "")
    who = f'{m.get("Artist", "")} {m.get("Credit", "")}'
    w, h = ii.get("width", 0), ii.get("height", 0)
    if ii.get("mime") not in ("image/jpeg", "image/png", "image/tiff", "image/webp"):
        return None, "not a bitmap"
    if max(w, h) < t.get("minLong", 1400) or min(w, h) < t.get("minShort", 900):
        return None, "too small"
    if not FREE.search(licence) or NOT_FREE.search(licence):
        return None, "licence"
    if AI.search(cats) or AI.search(title) or AI.search(desc):
        return None, "AI"
    if t.get("exclude") and re.search(t["exclude"], f"{who} {cats}", re.I):
        return None, "excluded credit"
    if NOT_A_PHOTO.search(title):
        return None, "not a photograph"
    if t.get("since") and ii.get("timestamp", "") < t["since"]:
        return None, "before the date"
    if t.get("landscape") and w < h * t["landscape"]:
        return None, "upright"
    text = f"{title} {desc} {cats}"
    if t.get("must") and not re.search(t["must"], text, re.I):
        return None, "no match"
    if t.get("mustnot") and re.search(t["mustnot"], text, re.I):
        return None, "matched mustnot"
    return {
        "title": title, "page": ii.get("descriptionurl"), "thumburl": ii.get("thumburl"), "w": w, "h": h,
        "licence": licence, "licenceUrl": m.get("LicenseUrl", ""), "artist": m.get("Artist", "")[:120],
        "credit": m.get("Credit", "")[:120], "date": m.get("DateTimeOriginal", "")[:40],
        "uploaded": ii.get("timestamp", "")[:10], "uploader": ii.get("user", ""), "desc": desc[:400],
        "assess": m.get("Assessments", ""), "via": via, "flag": bool(FLAGGED.search(who) or FLAGGED.search(cats)),
    }, None


def cmd_harvest(run, only):
    root = run_dir(run)
    targets = json.load(open(os.path.join(root, "targets.json"), encoding="utf-8"))
    unknown = set(only) - {t["id"] for t in targets}
    if unknown:
        sys.exit(f"not in targets.json: {', '.join(sorted(unknown))}")
    for t in targets:
        if only and t["id"] not in only:
            continue
        seen, items, dropped = set(), [], {}
        for src in t["sources"]:
            try:
                for p, via in from_source(src):
                    # A generator batch can list a page before its imageinfo has arrived;
                    # the same page comes back complete in a later batch.
                    if p["title"] in seen or not p.get("imageinfo"):
                        continue
                    seen.add(p["title"])
                    row, why = record(p, via, t)
                    if row:
                        items.append(row)
                    else:
                        dropped[why] = dropped.get(why, 0) + 1
            except Exception as e:
                print(f"  ! {t['id']} {src}: {e}", file=sys.stderr)
        if t.get("sort") == "newest":
            items.sort(key=lambda r: r["uploaded"], reverse=True)
        items = items[: t.get("cap", 60)]
        d = os.path.join(root, "data", t["id"])
        os.makedirs(os.path.join(d, "thumbs"), exist_ok=True)
        for i, r in enumerate(items, 1):
            r["n"] = i
            r["thumb"] = os.path.join(d, "thumbs", f"{i:04d}.jpg")
        with ThreadPoolExecutor(3) as pool:
            ok = list(pool.map(lambda r: fetch(r["thumburl"], r["thumb"]), items))
        json.dump(items, open(os.path.join(d, "items.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{t['id']:<18} read {len(seen):5d}  kept {len(items):4d}  thumbs {sum(ok):4d}  dropped {dropped}")


# ── sheets, list, look, exif ─────────────────────────────────────────────────────────

def cell(src, dst, size, label, pointsize):
    w, h = size
    subprocess.run(["magick", src, "-auto-orient", "-resize", f"{w}x{h}", "-background", "#1c1c1c", "-gravity", "center",
                    "-extent", f"{w}x{h}", "-gravity", "northwest", "-fill", "white", "-undercolor", "#000000cc",
                    "-pointsize", str(pointsize), "-annotate", "+3+2", f" {label} ", dst], check=True, stderr=subprocess.DEVNULL)


def cmd_sheets(run, targets, cols, rows, size):
    out = os.path.join(run_dir(run), "sheets")
    for target in targets:
        cells_dir = os.path.join(out, "cells", target)
        os.makedirs(cells_dir, exist_ok=True)
        cells = []
        for item in items_of(run, target):
            if not os.path.exists(item["thumb"]) or os.path.getsize(item["thumb"]) < 500:
                continue
            dst = os.path.join(cells_dir, f"{item['n']:04d}.jpg")
            if not os.path.exists(dst):
                cell(item["thumb"], dst, (size, size * 3 // 4), ("! " if item.get("flag") else "") + str(item["n"]), 17)
            cells.append(dst)
        per = cols * rows
        for k in range(0, len(cells), per):
            sheet = os.path.join(out, f"{target}-{k // per + 1}.jpg")
            subprocess.run(["magick", "montage", *cells[k:k + per], "-tile", f"{cols}x", "-geometry", "+2+2",
                            "-background", "#111", "-quality", "80", sheet], check=True)
            print(sheet)


def describe(item, lead):
    flag = "[flagged agency] " if item.get("flag") else ""
    print(f'{lead} {item["w"]}x{item["h"]} {item["licence"]} | {item["artist"][:50]} | {item["date"][:19] or "no date"}'
          f' (up {item["uploaded"]}) | {flag}{item["title"][5:90]}\n       {item["desc"][:260]}')


def cmd_list(run, target, specs):
    want = set()
    for a in specs:
        lo, _, hi = a.partition("-")
        want |= set(range(int(lo), int(hi or lo) + 1))
    for item in items_of(run, target):
        if not want or item["n"] in want:
            describe(item, f'{item["n"]:4d}')


def cmd_look(run, name, specs, width):
    out = os.path.join(run_dir(run), "look")
    os.makedirs(os.path.join(out, "big"), exist_ok=True)
    cells = []
    for spec in specs:
        target, item = pick(run, spec)
        d = api(action="query", prop="imageinfo", iiprop="url", iiurlwidth=str(width), titles=item["title"])
        big = os.path.join(out, "big", f"{target}-{item['n']:04d}-{width}.jpg")
        if not fetch(d["query"]["pages"][0]["imageinfo"][0]["thumburl"], big):
            sys.exit(f"{spec}: download failed")
        dst = big.replace(".jpg", ".cell.jpg")
        cell(big, dst, (540, 405), spec, 20)
        cells.append(dst)
        describe(item, spec)
    sheet = os.path.join(out, f"{name}.jpg")
    subprocess.run(["magick", "montage", *cells, "-tile", "3x", "-geometry", "+3+3", "-background", "#111", "-quality", "84", sheet], check=True)
    print(sheet)
    print(f"full frames for cropping and for reading text: {os.path.join(out, 'big')}")


def cmd_exif(run, specs):
    keep = ("DateTimeOriginal", "DateTime", "GPSLatitude", "GPSLongitude", "Make", "Model")
    for spec in specs:
        _, item = pick(run, spec)
        d = api(action="query", prop="imageinfo", iiprop="metadata", titles=item["title"])
        md = {m["name"]: m["value"] for m in (d["query"]["pages"][0]["imageinfo"][0].get("metadata") or [])
              if isinstance(m.get("value"), (str, int, float))}
        found = {k: md[k] for k in keep if k in md}
        print(f'{spec}  {item["title"]}\n     {found or "no EXIF: the date and the place rest on the description alone"}')


def flag(args, name, default):
    if name in args:
        i = args.index(name)
        value = int(args[i + 1])
        del args[i:i + 2]
        return value
    return default


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        sys.exit(__doc__)
    cmd, rest = args[0], args[1:]
    if cmd == "cats" and rest:
        cmd_cats(rest)
    elif cmd == "harvest" and rest:
        cmd_harvest(rest[0], rest[1:])
    elif cmd == "sheets" and len(rest) >= 2:
        cols, rows, size = flag(rest, "--cols", 8), flag(rest, "--rows", 6), flag(rest, "--cell", 200)
        cmd_sheets(rest[0], rest[1:], cols, rows, size)
    elif cmd == "list" and len(rest) >= 2:
        cmd_list(rest[0], rest[1], rest[2:])
    elif cmd == "look" and len(rest) >= 3:
        width = flag(rest, "--width", LOOK)
        cmd_look(rest[0], rest[1], rest[2:], width)
    elif cmd == "exif" and len(rest) >= 2:
        cmd_exif(rest[0], rest[1:])
    else:
        sys.exit(__doc__)


main()
