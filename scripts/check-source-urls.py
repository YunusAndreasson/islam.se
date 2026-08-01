#!/usr/bin/env python3
"""Kontrollera att varje käll-URL i frontmatter pekar dit den utger sig för att peka.

Den här kontrollen finns därför att fyra av fem klassiska fiqh-länkar på de första
fördjupningssidorna var falska. Två gav 404. Två svarade 200 — på FEL BOK:
`shamela.ws/book/23653` är *ʿUyūn al-athar* av Ibn Sayyid al-Nās, inte Mughniyya,
och `book/1157` är al-Shaybānīs *al-Jāmiʿ al-kabīr*, inte Ibn Taymiyya. Producentens
grind fanns hela tiden, men den granskade forskningsstegets lista — inte den lista
som faktiskt hamnar i filen. Sidorna passerade med omdömet »publish«.

Tre defekter, olika allvarliga:

  DÖD          URL:en svarar inte (404, DNS-fel). Entydigt fel: läsaren klickar och
               får ingenting, och citatet kan inte kontrolleras.

  OVERIFIERBAR Djuplänk till ett arabiskt boksystem (shamela.ws/book/<id>,
               islamweb.net/library/). Titeln på sidan är arabisk medan citatet är
               en latinsk translitterering, så det finns ingen textöverlappning att
               matcha på — varken maskin eller granskare kan billigt avgöra om
               länken går till rätt verk. Två av fyra gjorde det inte.
               ⚠️ Ett 200-svar är alltså INGET belägg för den här klassen.

  MISSTÄNKT    URL:en svarar med en spärrsida (403/429/503 bakom Cloudflare) eller
               en omdirigering till en rot. Ofta ofarligt, men kan inte bekräftas
               automatiskt — listas för hand­kontroll, fäller inte bygget.

Rätt åtgärd för DÖD och OVERIFIERBAR är att ta bort `url:`-raden och behålla
`name:`. En källa utan länk är korrekt vetenskaplig praxis; en påhittad länk är en
förfalskning, och det senare är oändligt mycket värre än det förra.

Användning:
    python3 scripts/check-source-urls.py data/fordjupning/*.md
    python3 scripts/check-source-urls.py data/svar/*.md --fix   # tar bort döda url:
"""

from __future__ import annotations

import argparse
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Boksystem vars djuplänkar inte går att verifiera automatiskt (se modul-docstring).
UNVERIFIABLE = re.compile(
    r"^https?://(www\.)?(shamela\.ws|islamweb\.net)/(book|library)/", re.I
)

# `- name: "..."` följt av `url: "..."` i frontmatter. url är valfri och ska så förbli.
SOURCE = re.compile(
    r'-\s+name:\s*"([^"]+)"\s*\n(?:\s+url:\s*"([^"]+)"\s*\n)?', re.M
)

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

DEAD, UNVERIFIED, SUSPECT, OK = "DÖD", "OVERIFIERBAR", "MISSTÄNKT", "OK"


# Koder som betyder »roboten stoppades«, inte »sidan finns inte«. 454 är Cloudflares
# webbläsarkontroll (islamiskaforbundet.se), 999 LinkedIns motsvarighet.
SOFT_BLOCK = {403, 429, 503, 999, 454}


def probe(url: str, timeout: float = 25.0, _retry: bool = True) -> tuple[str, int | None]:
    """GET (inte HEAD) — en HEAD-kontroll missar mjuka 404:or helt.

    ⚠️ En 429 betyder nästan alltid att KONTROLLEN gick för fort, inte att källan är
    trasig: första svepet flaggade 76 »misstänkta«, varav de flesta var sunnah.com som
    svarade på tolv parallella anrop från oss själva. Ett skript som ropar varg 76
    gånger slutar man läsa, så vi backar av en gång innan vi rapporterar.
    """
    if UNVERIFIABLE.match(url):
        return UNVERIFIED, None
    req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return (OK, r.status)
    except urllib.error.HTTPError as e:
        if e.code == 429 and _retry:
            time.sleep(5.0)
            return probe(url, timeout, _retry=False)
        if e.code in SOFT_BLOCK:
            return SUSPECT, e.code
        return DEAD, e.code
    except Exception:
        return DEAD, None


def probe_host_serially(urls: list[str]) -> list[tuple[str, int | None]]:
    """En värd i taget, med paus emellan. Parallellism sker MELLAN värdar, aldrig inom
    en — annars bygger kontrollen sina egna 429:or."""
    out = []
    for i, u in enumerate(urls):
        if i:
            time.sleep(0.7)
        out.append(probe(u))
    return out


def frontmatter_of(text: str) -> str:
    """Klipp frontmatter på RADANKRAD `---`, aldrig på delsträngen.

    ⚠️ `text.split("---", 2)[1]` ser ut att fungera och gör det för de flesta filer,
    men en URL som råkar innehålla tre bindestreck avslutar blocket i förtid:
    `.../elevers-kladsel-inom-skolvasendet---juridisk-vagledning` kapade hijab.md
    vid källa 12 av 19, och kontrollen rapporterade tyst att resten var granskad.
    En kontroll som hoppar över rader utan att säga det är värre än ingen kontroll.
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return ""
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "\n".join(lines[1:i])
    return ""


def sources_of(path: Path) -> list[tuple[str, str | None]]:
    fm = frontmatter_of(path.read_text(encoding="utf-8"))
    return [(m.group(1), m.group(2)) for m in SOURCE.finditer(fm)] if fm else []


def strip_url(path: Path, url: str) -> None:
    """Ta bort `url:`-raden men behåll källan. Aldrig tvärtom."""
    text = path.read_text(encoding="utf-8")
    path.write_text(
        re.sub(rf'\n\s+url:\s*"{re.escape(url)}"(?=\n)', "", text, count=1),
        encoding="utf-8",
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument(
        "--fix",
        action="store_true",
        help="ta bort url: för DÖD och OVERIFIERBAR (källan står kvar utan länk)",
    )
    args = ap.parse_args()

    jobs: list[tuple[Path, str, str]] = []
    for f in args.files:
        for name, url in sources_of(f):
            if url:
                jobs.append((f, name, url))

    if not jobs:
        print("Inga käll-URL:er hittade.")
        return 0

    by_host: dict[str, list[int]] = {}
    for i, (_f, _n, url) in enumerate(jobs):
        by_host.setdefault(urllib.parse.urlsplit(url).netloc.lower(), []).append(i)

    verdicts: list[tuple[str, int | None]] = [(OK, None)] * len(jobs)
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = pool.map(
            lambda idxs: probe_host_serially([jobs[i][2] for i in idxs]), by_host.values()
        )
        for idxs, res in zip(by_host.values(), results):
            for i, v in zip(idxs, res):
                verdicts[i] = v

    buckets: dict[str, list[tuple[Path, str, str, int | None]]] = {
        DEAD: [], UNVERIFIED: [], SUSPECT: []
    }
    for (f, name, url), (verdict, code) in zip(jobs, verdicts):
        if verdict in buckets:
            buckets[verdict].append((f, name, url, code))

    for label, blurb in (
        (DEAD, "URL:en svarar inte — ta bort url:, behåll name:"),
        (UNVERIFIED, "djuplänk som varken maskin eller granskare kan bekräfta"),
        (SUSPECT, "spärrsida — kontrollera för hand, fäller inte"),
    ):
        rows = buckets[label]
        if not rows:
            continue
        print("\n" + "=" * 72)
        print(f"  {label} ({len(rows)}) — {blurb}")
        print("=" * 72)
        for f, name, url, code in rows:
            print(f"\n  {f}")
            print(f"     ✗ {name[:64]}")
            note = "ej kontrollerad" if label == UNVERIFIED else (code or "ingen respons")
            print(f"       {url}  [{note}]")

    fatal = buckets[DEAD] + buckets[UNVERIFIED]
    if args.fix and fatal:
        for f, _name, url, _code in fatal:
            strip_url(f, url)
        print(f"\n  → tog bort {len(fatal)} url:-rader; källorna står kvar utan länk")

    print("\n" + "=" * 72)
    print(
        f"  {len(args.files)} filer, {len(jobs)} URL:er — "
        f"{len(buckets[DEAD])} döda, {len(buckets[UNVERIFIED])} overifierbara, "
        f"{len(buckets[SUSPECT])} misstänkta"
    )
    print("=" * 72)

    return 1 if (fatal and not args.fix) else 0


if __name__ == "__main__":
    sys.exit(main())
