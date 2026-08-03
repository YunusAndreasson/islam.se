#!/usr/bin/env python3
"""Kontrollera att varje korancitat är Knut Bernströms text ORDAGRANT.

Den här kontrollen finns därför att granskningssteget skrev om Koranen. På
griskött (2026-08-03) ändrades öppningen av 2:173 från Bernströms

    »Vad Han har förbjudit er är kött av självdöda djur …«

till

    »Han har förbjudit er kött av självdöda djur …«

med motiveringen att ett versaliserat *Han* mitt i en mening bröt mot husregeln om
gemena gudspronomen — och med tillägget att den nya lydelsen låg »närmare Bernströms
faktiska öppning«. Den låg inte det. Husregeln gäller artikelns egen prosa; innanför
ett citat är versalerna översättarens. Husstilskontrollen hade aldrig invänt mot
originalet, så ändringen löste ingenting och gjorde sidan motstridig mot halal.md,
som citerar samma vers rätt.

Varför en kontroll och inte bara en promptregel: samma felklass (påhittade käll-URL:er)
åtgärdades tre gånger i prompt utan verkan och försvann först när den flyttades till kod.
En omskriven vers är dessutom osynlig för alla andra grindar — den är inte en död länk,
inte ett påhittat id, och prosan blir *snyggare*, inte sämre.

Tre utfall:

  ORDAGRANT   citatet är identiskt med Bernström (bortsett från streck- och
              blanktecknormalisering).

  FÖRKORTAT   citatet är ett troget prefix av versen, eller en följd av trogna
              stycken avdelade med […]. Tillåtet: långa verser får kortas vid en
              meningsgräns.

  OMSKRIVET   citatet avviker i ordalydelse. ⛔ Detta får aldrig passera.

Anropas som `check-quran-quotes.py <fil> [<fil> …]`; utan argument granskas
data/fordjupning, data/svar och data/articles. Exitkod 1 om något är OMSKRIVET.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "node_modules" / ".cache" / "bernstrom-verses.json"
API = "https://api.quran.com/api/v4/quran/translations/48?verse_key={}"
BERNSTROM = 48

# Fotnotsdefinition eller attributionsrad som namnger versen: "Koranen, al-Baqara 2:173."
CITATION = re.compile(r"(?:Koranen|sura)[^\d\n]{0,40}?(\d{1,3}):(\d{1,3})")
FOOTNOTE_REF = re.compile(r"\[\^([^\]]+)\]")


def normalise(text: str) -> str:
    """Jämför på ORDALYDELSE, inte på typografi.

    Alla citattecken faller ihop till ett enda tecken. Sidorna växlar mellan '…',
    "…" och »…« för Bernströms inre anföring, smartypants skriver ändå om dem vid
    rendering, och en sådan växling är inte en omskrivning. Det kontrollen ska
    fånga är ändrade ORD.
    """
    for dash in "–—−":
        text = text.replace(dash, "-")
    for quote in "”“»«„‘’'":
        text = text.replace(quote, '"')
    return " ".join(text.split())


def load_cache() -> dict[str, str]:
    try:
        return json.loads(CACHE.read_text("utf8"))
    except (OSError, ValueError):
        return {}


def save_cache(cache: dict[str, str]) -> None:
    try:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), "utf8")
    except OSError:
        pass


def fetch_verse(key: str, cache: dict[str, str]) -> str | None:
    if key in cache:
        return cache[key]
    req = urllib.request.Request(API.format(key), headers={"User-Agent": "islam.se-checker"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.load(resp)
    except (urllib.error.URLError, ValueError, TimeoutError):
        return None
    try:
        raw = payload["translations"][0]["text"]
    except (KeyError, IndexError):
        return None
    raw = re.sub(r"<sup[^>]*>.*?</sup>", "", raw, flags=re.S)
    raw = re.sub(r"<[^>]+>", "", raw)
    for entity, char in (("&quot;", '"'), ("&amp;", "&"), ("&#39;", "'"), ("&nbsp;", " ")):
        raw = raw.replace(entity, char)
    cache[key] = normalise(raw)
    return cache[key]


def build_haystack(key: str, quote_length: int, cache: dict[str, str], span: int = 6) -> str | None:
    """Versen, förlängd med de följande så länge citatet är längre än så här långt.

    Ett blockcitat löper ofta över flera på varandra följande verser medan fotnoten
    bara namnger den första (23:12 för 23:12–14, 81:8 för 81:8–9). Det är normal
    praxis och ska inte läsas som en omskrivning.
    """
    first = fetch_verse(key, cache)
    if first is None:
        return None
    sura, ayah = (int(part) for part in key.split(":"))
    combined = first
    # ⚠️ Alltid minst ett par verser framåt, ALDRIG bara "tills vi har nog med ord".
    # Fotnoten namnger ibland versen före den som faktiskt citeras (döden.md anger
    # 23:99 för ett citat som börjar i 23:100), och då räcker det inte att den
    # namngivna versen råkar vara längre än citatet.
    always = 2
    for step in range(1, span + 1):
        if step > always and len(words(combined)) >= quote_length:
            break
        nxt = fetch_verse(f"{sura}:{ayah + step}", cache)
        if not nxt:
            break
        combined = f"{combined} {nxt}"
    return combined


def footnote_targets(source: str) -> dict[str, str]:
    """Fotnotsetikett -> versnyckel, för de noter som namnger en koranvers."""
    targets: dict[str, str] = {}
    for match in re.finditer(r"^\[\^([^\]]+)\]:\s*(.+)$", source, re.M):
        label, body = match.group(1), match.group(2)
        cite = CITATION.search(body)
        if cite:
            targets[label] = f"{int(cite.group(1))}:{int(cite.group(2))}"
    return targets


def blockquotes(source: str) -> list[tuple[int, str]]:
    """Sammanhängande `>`-block, med radnummer för första raden."""
    out: list[tuple[int, str]] = []
    current: list[str] = []
    start = 0
    for number, line in enumerate(source.split("\n"), 1):
        if line.startswith(">"):
            if not current:
                start = number
            current.append(line.lstrip(">").strip())
        elif current:
            out.append((start, " ".join(current)))
            current = []
    if current:
        out.append((start, " ".join(current)))
    return out


# Attributionsrad under ett blockcitat: "— Koranen 21:107" / "- Koranen, al-Anbiyā 21:107".
# Svarssidorna attribuerar så i stället för med fotnot, och raden är INTE en del av versen.
ATTRIBUTION = re.compile(r"\s*[-–—]\s*(?:Koranen|sura)[^\n]{0,60}?\d{1,3}:\d{1,3}\.?\s*$")
# Citattecken runt hela citatet är typografi, inte ordalydelse.
WRAPPING_QUOTES = '"\'"«»„“”‘’ '


def strip_apparatus(quote: str) -> str:
    body = FOOTNOTE_REF.sub("", quote)
    body = ATTRIBUTION.sub("", body.strip())
    body = body.strip().strip(WRAPPING_QUOTES).strip()
    # Utelämningstecken i början eller slutet säger bara att citatet är ett utdrag.
    body = re.sub(r"^\s*(?:\[?\s*(?:…|\.\.\.)\s*\]?)\s*", "", body)
    body = re.sub(r"\s*(?:\[?\s*(?:…|\.\.\.)\s*\]?)\s*$", "", body)
    return body.strip().strip(WRAPPING_QUOTES).strip()


def words(text: str) -> list[str]:
    """Ordskelettet: vad som SÄGS, utan skiljetecken.

    Ett utdrag klipps nästan alltid mitt i en mening och avslutas med punkt där
    Bernström har tankstreck eller komma. Det är en klippgräns, inte en ändrad
    lydelse. Kontrollen ska fånga ÄNDRADE ORD, så jämförelsen görs på orden.
    """
    return re.findall(r"[0-9a-zà-öø-ÿ]+", normalise(text).lower())


def contains_sequence(haystack: list[str], needle: list[str], start: int = 0) -> int:
    """Index efter en sammanhängande förekomst av `needle`, annars -1."""
    if not needle:
        return start
    for i in range(start, len(haystack) - len(needle) + 1):
        if haystack[i : i + len(needle)] == needle:
            return i + len(needle)
    return -1


def classify(quote: str, verse: str) -> tuple[str, str]:
    quoted, real = normalise(quote), normalise(verse)
    if quoted == real:
        return "ORDAGRANT", ""
    quoted_words, real_words = words(quote), words(verse)
    if quoted_words == real_words:
        return "ORDAGRANT", ""
    if contains_sequence(real_words, quoted_words) >= 0:
        # Ett troget utdrag ur versen — inte nödvändigtvis från början.
        return "FÖRKORTAT", ""
    segments = [
        words(s)
        for s in re.split(r"\[\s*(?:…|\.\.\.)\s*\]|\s+(?:…|\.\.\.)\s+", quoted)
        if words(s)
    ]
    cursor, ok = 0, True
    for segment in segments:
        cursor = contains_sequence(real_words, segment, cursor)
        if cursor < 0:
            ok = False
            break
    if ok and len(segments) > 1:
        return "FÖRKORTAT", ""
    for index, (a, b) in enumerate(zip(quoted_words, real_words)):
        if a != b:
            near = " ".join(quoted_words[max(0, index - 7) : index + 6])
            real_near = " ".join(real_words[max(0, index - 7) : index + 6])
            return "OMSKRIVET", f"citat   : …{near}…\n      Bernström: …{real_near}…"
    return "OMSKRIVET", (
        f"citat   : {' '.join(quoted_words[:14])}…\n"
        f"      Bernström: {' '.join(real_words[:14])}…"
    )


def check(path: Path, cache: dict[str, str]) -> tuple[int, int, int]:
    source = path.read_text("utf8")
    targets = footnote_targets(source)
    verbatim = shortened = rewritten = 0
    for line_number, quote in blockquotes(source):
        keys = [targets[label] for label in FOOTNOTE_REF.findall(quote) if label in targets]
        if not keys:
            cite = CITATION.search(quote)
            if cite:
                keys = [f"{int(cite.group(1))}:{int(cite.group(2))}"]
        if not keys:
            continue
        key = keys[0]
        body = strip_apparatus(quote)
        if not body:
            continue
        single = fetch_verse(key, cache)
        if single is None:
            print(f"  ?   {path.name}:{line_number}  {key} — kunde inte hämtas, hoppas över")
            continue
        # Exakt träff mot den namngivna versen ensam rapporteras som ORDAGRANT; först
        # därefter jämförs mot de följande verserna, för citat som löper vidare.
        verdict, detail = classify(body, single)
        if verdict != "ORDAGRANT":
            verse = build_haystack(key, len(words(body)), cache)
            verdict, detail = classify(body, verse or single)
        if verdict == "ORDAGRANT":
            verbatim += 1
        elif verdict == "FÖRKORTAT":
            shortened += 1
            print(f"  ~   {path.name}:{line_number}  {key} förkortat (troget)")
        else:
            rewritten += 1
            print(f"  ⛔  {path.name}:{line_number}  {key} OMSKRIVET\n      {detail}")
    return verbatim, shortened, rewritten


BERNSTROM_2_173 = (
    "Vad Han har förbjudit er är kött av självdöda djur, blod och svinkött och sådant "
    "som offrats åt en annan än Gud. Men den som [av hunger] tvingas [att äta sådant] - "
    "inte den som av trots överträder [förbuden] eller som går längre [än hungern driver "
    "honom] - begår ingen synd. Gud är ständigt förlåtande, barmhärtig."
)

# (citat, förväntat utfall, vad fallet bevakar). Varje FÖRKORTAT-rad är en
# falsklarmsklass som en tidigare version av kontrollen felaktigt fällde; hade de
# stått kvar hade kontrollen larmat om 222 oskyldiga citat och blivit ignorerad.
SELF_TEST_CASES = [
    (BERNSTROM_2_173, "ORDAGRANT", "oförändrad vers"),
    (BERNSTROM_2_173 + "[^2]", "ORDAGRANT", "fotnotsmarkör ska strippas"),
    (
        "Han har förbjudit er kött av självdöda djur, blod och svinkött och sådant "
        "som offrats åt en annan än Gud.",
        "OMSKRIVET",
        "⭐ DEN VERKLIGA DEFEKTEN: granskaren strök »Vad« och »är« (griskött 2026-08-03)",
    ),
    (
        "Vad Han har förbjudit er är kött av självdöda djur, blod och svinkött och "
        "sådant som offrats åt en annan än Gud.",
        "FÖRKORTAT",
        "troget prefix",
    ),
    ("Gud är ständigt förlåtande, barmhärtig.", "FÖRKORTAT", "utdrag mitt i versen"),
    (
        "»Vad Han har förbjudit er är kött av självdöda djur, blod och svinkött.«",
        "FÖRKORTAT",
        "citattecken runt om + klipp som slutar med punkt",
    ),
    (
        "Vad Han har förbjudit er är kött av självdöda djur, blod och svinkött …",
        "FÖRKORTAT",
        "avslutande utelämningstecken",
    ),
    (
        "Gud är ständigt förlåtande, barmhärtig. — Koranen 2:173",
        "FÖRKORTAT",
        "attributionsrad under blockcitatet",
    ),
    (
        "Vad Han har förbjudit er är kött av självdöda djur, blod och svinkött - det "
        "är orent.",
        "OMSKRIVET",
        "ord ur en ANNAN vers (6:145) får inte passera",
    ),
]


def self_test() -> int:
    """Kör kontrollens omdöme mot kända fall. Inget nät, inga filer."""
    print("Självtest av check-quran-quotes\n")

    # ⚠️ Metagrinden. Om teckenklassen någonsin går sönder normaliseras ALLT till
    # tom sträng, och då blir varje jämförelse sann — kontrollen ser ut att passera
    # utan att ha jämfört något. Den fällan kostade två felaktiga »13 av 13«.
    if len(words(BERNSTROM_2_173)) < 20:
        print("ABORT: ordnormaliseringen gav nästan inget — kontrollen är trasig")
        return 2

    failures = 0
    for quote, expected, why in SELF_TEST_CASES:
        verdict, _ = classify(strip_apparatus(quote), BERNSTROM_2_173)
        ok = verdict == expected
        failures += 0 if ok else 1
        print(f"  {'OK ' if ok else 'FEL'} {expected:10s} {why}")
        if not ok:
            print(f"      fick »{verdict}« för: {quote[:70]}…")

    print()
    if failures:
        print(f"⛔ {failures} av {len(SELF_TEST_CASES)} fall fel — rätta innan du litar på kontrollen")
        return 1
    print(f"✅ {len(SELF_TEST_CASES)} av {len(SELF_TEST_CASES)} fall rätt")
    return 0


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        return self_test()
    if len(sys.argv) > 1:
        paths = [Path(a) for a in sys.argv[1:]]
    else:
        paths = sorted(
            p
            for directory in ("data/fordjupning", "data/svar", "data/articles")
            for p in (ROOT / directory).glob("*.md")
        )
    cache = load_cache()
    verbatim = shortened = rewritten = 0
    for path in paths:
        if not path.exists():
            print(f"  ?   {path} finns inte")
            continue
        a, b, c = check(path, cache)
        verbatim, shortened, rewritten = verbatim + a, shortened + b, rewritten + c
    save_cache(cache)

    print()
    print("=" * 72)
    print(
        f"  {len(paths)} filer — {verbatim} ordagranna, {shortened} förkortade, "
        f"{rewritten} OMSKRIVNA"
    )
    print("=" * 72)
    if rewritten:
        print("\n⛔ Korantext får aldrig skrivas om. Återställ mot Bernströms lydelse")
        print("   (quran.com/<sura>/<vers>?translations=48). Husreglerna om gemena")
        print("   gudspronomen och streckbudget gäller artikelns prosa, aldrig ett citat.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
