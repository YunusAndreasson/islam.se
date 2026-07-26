#!/usr/bin/env python3
"""Hitta påståenden som sidan inte kan backa upp.

Systersidan till `check-cross-page-facts.py`. Den kontrollerar att sidorna säger
SAMMA sak om samma sak; den här kontrollerar att de över huvud taget har täckning
för det de säger.

Två defekter, och de är olika allvarliga:

  TÄCKNING   Sidan gör ett anspråk av en viss sort men bär ingen källa av den
             sorten. En sida som daterar Bagdads fall till 1258, räknar Bagdads
             invånare i miljoner och åberopar vetenskapshistoriker, men vars
             hela källista är tre koranverser, kan inte försvara sig. Omvänt:
             en sida som säger "de lärda är eniga" utan en enda fiqh-källa
             lägger ett ijmāʿ-anspråk i knät på läsaren.

  VAGHET     "Vissa menar", "det sägs", "man brukar räkna" — passiva
             tillskrivningar utan bärare. De läser som källhänvisningar men är
             det inte, och de är det billigaste sättet att smuggla in ett
             overifierat påstående i annars välbelagd prosa.

Anspråken delas i två spår eftersom de kräver olika slags belägg:

  sekulärt   Årtal, folkmängder, procent, avstånd, namngivna forskare och
             institutioner, vetenskaps- och historieord. Beläggs med Wikipedia,
             Grokipedia eller forskning — inte med en koranvers.

  islamiskt  Konsensus- och rättsspråk (ijmāʿ, "de lärda är eniga", "alla fyra
             rättsskolor", "obligatoriskt", "förbjudet"). Beläggs med en
             namngiven lärd, ett klassiskt verk eller islamqa.info (Muhammad
             Sālih al-Munajjid) — inte med Wikipedia.

Citat maskeras (blockcitat, kursiverade termer och citattecken) så att en träff
alltid är författarens eget påstående, aldrig något hen citerar.

Användning:
    python3 scripts/check-claim-sourcing.py data/svar/*.md
    python3 scripts/check-claim-sourcing.py --check vaghet data/svar/*.md
    python3 scripts/check-claim-sourcing.py --json data/svar/*.md
    python3 scripts/check-claim-sourcing.py --page vad-ar-sunna data/svar/*.md

Slutkod 1 om någon sida saknar täckning.
"""

import argparse
import json
import re
import sys
from pathlib import Path

# ── Källklassificering ────────────────────────────────────────
# En källa duger bara mot den sortens anspråk den faktiskt kan bära.

SOURCE_KINDS = [
    ("quran", (r"quran\.com", r"^koranen\b")),
    ("hadith", (r"sunnah\.com", r"bukh[āa]r[īi]", r"^sah[īi]h muslim", r"sunan ",
                r"muwatta", r"musnad", r"^al-adab", r"hadith")),
    ("islamqa", (r"islamqa",)),
    ("alibadah", (r"al-ibadah",)),
    ("wikipedia", (r"wikipedia\.org", r"^wikipedia\b")),
    ("grokipedia", (r"grokipedia",)),
]
# Klassiska lärda och verk = fiqh-/aqida-täckning utan URL.
SCHOLAR_PAT = re.compile(
    r"ibn taymiyya|ibn al-qayyim|ibn kath[īi]r|al-qurtub[īi]|al-tabar[īi]|"
    r"al-nawaw[īi]|ibn hajar|ibn b[āa]z|ʿuthaym[īi]n|uthaymin|al-ghaz[āa]l[īi]|"
    r"ibn rushd|ibn hazm|al-sh[āa]fiʿ[īi]|abu han[īi]fa|ahmad ibn hanbal|"
    r"m[āa]lik ibn anas|ibn khald[ūu]n|permanenta kommitt|majm[ūu]ʿ al-fat[āa]w|"
    r"iʿl[āa]m al-muwaqqiʿ[īi]n|fat[āa]w[āa]|al-mughn[īi]|bid[āa]yat al-mujtahid",
    re.IGNORECASE,
)
# Sekulär forskning som varken är Wikipedia eller Grokipedia: en akademisk
# monografi, ett universitet, en forskningsinstitution, en peer-review-databas.
RESEARCH_PAT = re.compile(
    r"university|univers|press\b|journal|pew\b|unicef|who\b|världshälso|"
    r"encyclopa|britannica|nationalencyklopedin|\bne\.se|doi\.org|jstor|"
    r"pubmed|nature\.com|science\.org|sciencedirect|springer|cambridge|oxford|"
    r"routledge|brill\b|scb\.se|statistik|unesco|un\.org|\bfn\b|läkartidning|"
    r"socialstyrelsen|folkhälsomyndighet|stats\.gov\.sa|gastat|tobaccoatlas|"
    r"atlas\b|myndighet|databas|rapport\b|census|worldbank|oecd",
    re.IGNORECASE,
)

# En datering eller ett tal är inte i sig ett sekulärt anspråk. Frågan är vilken
# sorts auktoritet påståendet lutar sig mot. "al-Māwardī på 1000-talet" behöver
# en fiqh-källa, inte Wikipedia; "Lemaître 1927" behöver tvärtom en vetenskaplig.
# Träffar i en mening med islamiskt sakinnehåll flyttas därför över till det
# islamiska spåret i stället för att räknas som otäckt sekulär fakta.
#
# Listan är medvetet SNÄV. "kalif", "profeten" och "Koranen" förekommer lika
# ofta i ren historieprosa ("umayyaderna störtades i Damaskus år 750") som i
# rättsresonemang, och att räkna dem som islamiskt sakinnehåll skulle dölja
# just de historiska anspråk som behöver en sekulär källa. Bara juridisk och
# trosmässig fackvokabulär kvalificerar.
#
# OBS: SCHOLAR_PAT återanvänds INTE här. Den svarar på "namnger den här källan
# en lärd?", vilket är en annan fråga än "är det här ett rättsanspråk?".
# al-Ghazālī och Ibn Khaldūn är lika mycket idéhistoriska gestalter som jurister
# — en mening om att Ibn Khaldūn grundlade sociologin behöver en vetenskaplig
# källa, inte en fatwa. Bara namn som i praktiken bara åberopas för domslut
# räknas som rättskontext.
JURIST_PAT = (r"ibn taymiyya|ibn al-qayyim|ibn b[āa]z|ʿuthaym[īi]n|uthaymin|"
              r"al-nawaw[īi]|al-M[āa]ward[īi]|permanenta kommitt|al-mughn[īi]")
ISLAMIC_CONTEXT = re.compile(
    JURIST_PAT + r"|"
    r"\bzakat|\bnisab|\bsadaqa|rättsskol|rättslärd|de lärda|\bfiqh|madhhab|"
    r"standardsats|fyrtiondel|en tiondel|\bsalat|\bwudu|\bghusl|\bsharia|"
    r"mustahabb|w[āa]jib|\bfard\b|makr[ūu]h|ijm[āa]ʿ",
    re.IGNORECASE,
)


def classify_source(name: str, url: str) -> str:
    blob = f"{name} {url}".lower()
    for kind, pats in SOURCE_KINDS:
        if any(re.search(p, blob) for p in pats):
            return kind
    if SCHOLAR_PAT.search(blob):
        return "scholar"
    if RESEARCH_PAT.search(blob):
        return "research"
    return "other"


# Vad varje spår accepterar som belägg.
SECULAR_COVER = {"wikipedia", "grokipedia", "research"}
ISLAMIC_COVER = {"islamqa", "alibadah", "scholar"}

# ── Anspråksdetektorer ────────────────────────────────────────

DECADE = r"\d{3,4}-talet"
YEAR = r"(?:år\s+)?\b(?:[6-9]\d{2}|1[0-9]{3}|20[0-2]\d)\b"
BIG_UNIT = (r"miljon(?:er)?|miljard(?:er)?|procent|invånare|kilometer|mil\b|"
            r"pilgrimer|anhängare|muslimer|dödsfall|länder|moskéer|"
            r"handskrifter|manuskript|exemplar")
NUM = (r"(?:\d[\d\s  ]*(?:[.,]\d+)?|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|"
       r"tjugo|trettio|fyrtio|femtio|hundra|tusen)")

SECULAR_CLAIM = [
    ("årtal", re.compile(rf"(?<![\d:–-]){YEAR}(?![\d:–-])")),
    ("århundrade", re.compile(DECADE)),
    ("storhet", re.compile(rf"\b{NUM}\s+(?:{BIG_UNIT})\b", re.IGNORECASE)),
    ("forskning", re.compile(
        r"\bforskare|forskning|historiker|vetenskapshistorik|arkeolog|"
        r"filolog|studier visar|undersökningar|statistik|enligt Pew|"
        r"lingvist|demograf|epidemiolog|medicinsk|läkarvetenskap|"
        r"universitet|akademiker|källkritik", re.IGNORECASE)),
    ("antik", re.compile(
        r"\bGalenos|Aristoteles|Hippokrates|Euklides|Ptolemaios|Platon|"
        r"antikens|senantik|grekisk[at]?\s+(?:medicin|filosofi|vetenskap)",
        re.IGNORECASE)),
]

ISLAMIC_CLAIM = [
    ("konsensus", re.compile(
        r"de lärda är eniga|råder (?:full )?enighet|samstämmig|enighet bland|"
        # "obestritt"/"oomtvistat" satt här tidigare men är vanlig svenska, inte
        # fiqh-språk: de träffade historieprosa ("stadens storlek är oomtvistad")
        # och krävde en fatwa för ett arkeologiskt påstående.
        r"ijm[āa]ʿ|alla (?:fyra )?rättsskolor|de fyra rättsskolorna är|"
        r"samtliga rättsskolor", re.IGNORECASE)),
    ("majoritet", re.compile(
        r"majoriteten av de lärda|de flesta lärda|flertalet lärda|"
        r"den rådande uppfattningen|den starkaste åsikten|de lärdas mening",
        re.IGNORECASE)),
    ("rättsregel", re.compile(
        r"\bär förbjudet|är obligatorisk|är påbjudet|är tillåtet|"
        r"\bhar[āa]m\b|\bhal[āa]l\b(?!s)|\bw[āa]jib\b|\bfard\b|makr[ūu]h|mustahabb",
        re.IGNORECASE)),
]

VAGUE = re.compile(
    r"\bvissa (?:menar|hävdar|anser|räknar)|somliga (?:menar|hävdar|anser)|"
    r"det sägs\b|man brukar (?:räkna|säga|anta)|brukar räknas|"
    r"enligt uppgift|det påstås|man menar\b|har hävdats|sägs ha\b|"
    r"enligt samtida vittnen|traditionen (?:säger|förtäljer)|"
    r"enligt vissa|ofta (?:sagts|hävdats)|man uppskattar|uppskattningsvis",
    re.IGNORECASE,
)


def split_frontmatter(text: str):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        return "", text
    return m.group(1), m.group(2)


def parse_sources(fm: str):
    block = re.search(r"^sources:\n((?:[ \t]+.*\n)*)", fm, re.M)
    if not block:
        return []
    out, cur = [], None
    for line in block.group(1).splitlines():
        n = re.match(r"\s*-\s*name:\s*\"?(.*?)\"?\s*$", line)
        u = re.match(r"\s*url:\s*\"?(.*?)\"?\s*$", line)
        if n:
            cur = {"name": n.group(1), "url": ""}
            out.append(cur)
        elif u and cur is not None:
            cur["url"] = u.group(1)
    return out


def mask_quotes(body: str) -> str:
    """Nolla allt författaren citerar — bara hens egen svenska ska kunna träffa."""
    lines = []
    for line in body.split("\n"):
        if line.lstrip().startswith(">"):
            lines.append("")
            continue
        line = re.sub(r"\"[^\"]{4,}\"", '""', line)      # citattecken
        line = re.sub(r"\*[^*]+\*", "", line)             # kursiverade termer
        line = re.sub(r"\([^)]*\d[^)]*\)", "", line)      # (Koranen 5:48)
        lines.append(line)
    return "\n".join(lines)


def sentences(text: str):
    for para in text.split("\n"):
        para = para.strip()
        if not para or para.startswith("#"):
            continue
        for s in re.split(r"(?<=[.!?])\s+(?=[A-ZÅÄÖ*])", para):
            s = s.strip()
            if s:
                yield s


def audit(path: Path):
    raw = path.read_text(encoding="utf-8")
    fm, body = split_frontmatter(raw)
    srcs = parse_sources(fm)
    kinds = {classify_source(s["name"], s["url"]) for s in srcs}
    prose = mask_quotes(body)

    hits = {"sekulärt": [], "islamiskt": [], "vaghet": []}
    for s in sentences(prose):
        for label, pat in SECULAR_CLAIM:
            m = pat.search(s)
            if m:
                # Dateringar och tal inne i ett islamiskt resonemang beläggs av
                # en lärd, inte av Wikipedia. Undantag: namngiven antik auktoritet
                # och uttryckligt forskningsspråk är sekulära även i sådan prosa.
                track = "sekulärt"
                if label in ("årtal", "århundrade", "storhet") and ISLAMIC_CONTEXT.search(s):
                    track = "islamiskt"
                hits[track].append((label, m.group(0).strip(), s))
                break
        for label, pat in ISLAMIC_CLAIM:
            m = pat.search(s)
            if m:
                hits["islamiskt"].append((label, m.group(0).strip(), s))
                break
        m = VAGUE.search(s)
        if m:
            hits["vaghet"].append(("vag", m.group(0).strip(), s))

    return {
        "page": path.stem,
        "path": str(path),
        "n_sources": len(srcs),
        "kinds": sorted(kinds),
        "secular_claims": len(hits["sekulärt"]),
        "islamic_claims": len(hits["islamiskt"]),
        "secular_covered": bool(kinds & SECULAR_COVER),
        "islamic_covered": bool(kinds & ISLAMIC_COVER),
        "hits": hits,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Otäckta påståenden på islam.se-sidor")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--check", choices=["täckning", "vaghet", "allt"], default="allt")
    ap.add_argument("--page", help="visa alla träffar för en enda sida")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    reports = [audit(Path(f)) for f in sorted(args.files)]

    if args.json:
        print(json.dumps(reports, ensure_ascii=False, indent=2))
        return 0

    if args.page:
        r = next((x for x in reports if x["page"] == args.page), None)
        if not r:
            print(f"okänd sida: {args.page}", file=sys.stderr)
            return 2
        print(f"\n{r['page']}  —  {r['n_sources']} källor {r['kinds']}\n")
        for track, rows in r["hits"].items():
            if not rows:
                continue
            print(f"  ── {track} ({len(rows)})")
            for label, frag, sent in rows:
                print(f"     [{label}] {frag}")
                print(f"        {sent[:190]}")
            print()
        return 0

    problems = []
    for r in reports:
        why = []
        if r["n_sources"] == 0:
            why.append("INGA KÄLLOR ALLS")
        if r["secular_claims"] and not r["secular_covered"]:
            why.append(f"{r['secular_claims']} sekulära anspråk, 0 sekulära källor")
        if r["islamic_claims"] and not r["islamic_covered"]:
            why.append(f"{r['islamic_claims']} rättsanspråk, 0 fiqh-källor")
        if why:
            problems.append((r, why))

    vague = [(r, r["hits"]["vaghet"]) for r in reports if r["hits"]["vaghet"]]

    if args.check in ("täckning", "allt"):
        print("\n" + "=" * 72)
        print(f"  TÄCKNING — sidor utan källa av rätt sort ({len(problems)})")
        print("=" * 72)
        for r, why in problems:
            print(f"\n  {r['page']}  ({r['n_sources']} källor: {', '.join(r['kinds']) or '–'})")
            for w in why:
                print(f"     ✗ {w}")
            for label, frag, sent in r["hits"]["sekulärt"][:3]:
                print(f"       · {sent[:150]}")

    if args.check in ("vaghet", "allt"):
        n = sum(len(v) for _, v in vague)
        print("\n" + "=" * 72)
        print(f"  VAGHET — tillskrivning utan bärare ({n} i {len(vague)} filer)")
        print("=" * 72)
        for r, rows in vague:
            print(f"\n  {r['page']}")
            for label, frag, sent in rows:
                print(f"     · «{frag}»  {sent[:150]}")

    print("\n" + "=" * 72)
    tot_s = sum(r["secular_claims"] for r in reports)
    tot_i = sum(r["islamic_claims"] for r in reports)
    print(f"  {len(reports)} filer — {tot_s} sekulära anspråk, {tot_i} rättsanspråk, "
          f"{len(problems)} sidor utan täckning")
    print("=" * 72)

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
