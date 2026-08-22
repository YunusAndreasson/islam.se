#!/usr/bin/env python3
"""Kontrollera att varje ```chart-block bär en källa som går att kontrollera.

Ett diagram är den mest auktoritativa form en siffra kan anta på en sida. Läsaren
läser en stapel som ett faktum — den har inga hedges, ingen »omkring«, ingen
brasklapp. Därför gäller samma krav som för en fotnot i prosan, och lite till.

Fem kontroller:

  SAKNAD KÄLLA    Blocket saknar `source:`. Blockerande. Parsern vägrar redan ett
                  sådant block, så det här fångar det innan bygget ens startar.

  DÖD URL         `sourceUrl:` svarar inte (404, DNS-fel). Rätt åtgärd är att ta
                  bort url-raden och behålla källans namn.
                  ⚠️ En källa utan länk är korrekt; en påhittad länk är en
                  förfalskning. Samma regel som scripts/check-source-urls.py.

  OSAMMANHÄNGANDE Diagrammets källa finns inte i sidans egen apparat. På en
                  fördjupning eller ett svar ska den ligga i `sources:` i
                  frontmatter, i en essä i en fotnot. Annars ser läsaren källan
                  bara i bildtexten, och check-source-urls.py granskar den aldrig.

  KATEGORIFÄLLA   En etikett, serie eller enhet nämner shia, sufism eller en
                  rättsskola som en egen kategori. ⛔ Blockerande. Se CLAUDE.md:
                  en »varav«-uppdelning av samfundsstatistik behöver inte posten
                  för att vara korrekt, så den ska utelämnas. Aggregera till
                  `muslimska samfund`, eller låt diagrammet vara.

  ODATERAD        Källan nämner inget år. En siffra utan årtal åldras utan att
                  synas, och den här webbplatsen står kvar i tio år.

Användning:
    python3 scripts/check-chart-sources.py data/fordjupning/*.md
    python3 scripts/check-chart-sources.py data/articles/*.md --offline

Slutkod 1 om någon blockerande defekt hittas.
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

FENCE = re.compile(r"^```(chart|table)[ \t]*\n(.*?)^```[ \t]*$", re.M | re.S)
# ⚠️ Historical sources carry historical years. This pattern matched only 1800–2099 and
# so flagged »Årtalen som de anges i artikeln, 632–661« as undated. Accept any 3–4 digit
# year, but not one welded to letters, so a table id like TAB6658 is not read as a date.
YEAR = re.compile(r"(?<![A-Za-z0-9])\d{3,4}(?![0-9])")

# Samma mönster som CLAUDE.md föreskriver att man grepar varje utkast med. Blockerande
# överallt i figuren — etiketter, serier, enhet, bildtext och brasklapp.
# Matchas mot fold()-ad text, så apostrofvarianterna behöver inte stå med: »Jaʿfarī« är
# redan »jafari« när mönstret möter det.
TRAP_ALWAYS = re.compile(r"shia|shiit|jafar|tolvshi|imamit|sufi|tariqa|tasawwuf")

# ⚠️ Rättsskolorna är en KATEGORIFÄLLA I ETT DIAGRAM MEN INTE I EN TABELL, och skillnaden
# är inte kosmetisk. En stapel per rättsskola gör en trosfråga till marknadsandel — det är
# den läsningen DIAGRAMFORMER.md förbjuder. En tabell över vad de fyra HÅLLER i en fråga är
# tvärtom precis den form CLAUDE.md föreskriver: »On a pure doctrine page (»vad säger
# rättsskolorna om X«) you take the four and stop there.«
#
# ⚠️ Substantivformerna saknades här till 2026-08-22. Mönstret var `hanafit|malikit|...`,
# alltså bara adjektivet, så etiketterna en skribent faktiskt skriver — `Hanafi:`,
# `Maliki:`, `Shafii:`, `Hanbali:` — gick rakt igenom grinden. Regeln fanns på pappret och
# inte i koden. Formerna nedan är prefix, så de täcker adjektivet också.
# ⚠️ Skrivsätten varierar, och grinden måste tåla dem alla. »Shafi'i«, »Shāfiʿī«, »Ḥanafī«
# och »Mālikī« är samma skolor som »Shafii«, »Hanafi« och »Maliki«, och en grind som bara
# kan det nakna ASCII-skrivsättet fäller bara den som råkar stava enklast.
#
# Lösningen är att VIKA texten i stället för att räkna upp diakriterna: NFD-normalisera,
# släng de kombinerande tecknen, släng apostroferna och bindestrecken. Då blir Ḥanafī till
# hanafi och Shāfiʿī till shafii, och mönstren nedan kan vara nakna. Att räkna upp varje
# variant i regexet var det första försöket, och det missade Ḥ (U+1E24) direkt.
_APOSTROPHES = dict.fromkeys(map(ord, "’'`ʿʾ‘´-"), None)


def fold(text: str) -> str:
    """Vik bort diakriter, apostrofer och bindestreck. Ḥanafī → hanafi."""
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return stripped.translate(_APOSTROPHES).lower()


MADHHABS = ("hanafi", "maliki", "shafii", "hanbali")
TRAP_CHART_ONLY = re.compile("|".join(MADHHABS))

# Fyra är fyra. Samma regel som rule_shia_sufi_mention i check-house-style.py driver i prosan.
FIVE_SCHOOLS = re.compile(r"\b(de\s+)?fem\s+(rätts)?skolor", re.I)

ERROR, WARN = "error", "warn"


def blocks(text: str) -> list[tuple[int, str, str]]:
    """Varje figurblock som (rad, språk, kropp)."""
    out = []
    for m in FENCE.finditer(text):
        out.append((text[: m.start()].count("\n") + 1, m.group(1), m.group(2)))
    return out


def scalar(body: str, key: str) -> str | None:
    m = re.search(rf"^{key}:[ \t]*(.+)$", body, re.M)
    return m.group(1).strip() if m else None


def row_labels(body: str) -> list[str]:
    """Etiketterna under `data:` — figurens egna kategorier."""
    out: list[str] = []
    in_data = False
    for line in body.split("\n"):
        if line.strip() == "data:":
            in_data = True
            continue
        if in_data and line.startswith((" ", "\t")) and ":" in line:
            out.append(line.split(":", 1)[0].strip())
    return out


def category_labels(body: str) -> list[str]:
    """Figurens KATEGORIORD: radetiketter, serier, enhet, kolumnrubriker.

    Skilt från bildtext och brasklapp med avsikt. Att en kategori heter »Hanafi« är en
    ståndpunkt om vad figuren mäter; att brasklappen NÄMNER rättsskolorna är en upplysning
    till läsaren. Den gamla koden läste båda som samma sak.
    """
    out = row_labels(body)
    for key in ("series", "unit", "columns"):
        value = scalar(body, key)
        if value:
            out.extend(p.strip() for p in value.split("|"))
    return [x for x in out if x]


def prose_fields(body: str) -> list[str]:
    """Bildtext och brasklapp — figurens egen prosa."""
    return [v for v in (scalar(body, "caption"), scalar(body, "note")) if v]


def url_status(url: str, timeout: float) -> int | None:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "islam.se-linkcheck"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def check(path: Path, offline: bool, timeout: float) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    frontmatter = text.split("---", 2)[1] if text.startswith("---") else ""
    body_after = text.split("---", 2)[2] if text.startswith("---") else text
    hits: list[dict] = []

    for line, lang, body in blocks(text):
        kind = "tabellen" if lang == "table" else "diagrammet"
        source = scalar(body, "source")
        if not source:
            hits.append({"sev": ERROR, "line": line, "rule": "saknad källa",
                         "msg": "blocket saknar source:"})
            continue

        if not YEAR.search(source):
            hits.append({"sev": WARN, "line": line, "rule": "odaterad",
                         "msg": f"källan nämner inget årtal: {source[:70]}"})

        cats = category_labels(body)
        # ⚠️ Två strängar, och skillnaden är språklig. fold() viker bort diakriter för att
        # tåla transkriberad arabiska (Ḥanafī → hanafi) — men i svenskan är ä och ö egna
        # bokstäver, inte a och o med prickar, så »rättsskolor« blir »rattsskolor« och en
        # svensk fras slutar matcha. Transkriptionsfällorna läser den vikta strängen,
        # de svenska fraserna den råa.
        raw = " | ".join(cats + prose_fields(body))
        everything = fold(raw)

        # Shia och sufism: blockerande var som helst i figuren, inte bara som kategori.
        trap = TRAP_ALWAYS.search(everything)
        if trap:
            hits.append({"sev": ERROR, "line": line, "rule": "kategorifällan",
                         "msg": f"»{trap.group(0)}« förekommer i {kind} — aggregera "
                                f"eller stryk figuren (CLAUDE.md)"})

        if FIVE_SCHOOLS.search(raw):
            hits.append({"sev": ERROR, "line": line, "rule": "fem skolor",
                         "msg": "rättsskolorna är fyra — hanafi, maliki, shafii, hanbali"})

        named = [m for m in MADHHABS if any(m in fold(c) for c in cats)]
        if lang == "chart":
            # En stapel per rättsskola gör en trosfråga till marknadsandel.
            if named:
                hits.append({"sev": ERROR, "line": line, "rule": "kategorifällan",
                             "msg": f"»{named[0]}« används som diagramkategori — en stapel per "
                                    f"rättsskola gör en trosfråga till marknadsandel. Använd en "
                                    f"tabell om du jämför ståndpunkter"})
        elif named and len(named) < 4:
            # Tillåtet i en tabell, men en ofullständig uppräkning läser som om de andra
            # saknade ståndpunkt. Varning, inte fel: ibland är tre det frågan gäller.
            hits.append({"sev": WARN, "line": line, "rule": "ofullständig",
                         "msg": f"tabellen tar upp {len(named)} av fyra rättsskolor "
                                f"({', '.join(named)}) — ta med alla fyra eller säg varför inte"})

        # Källan ska också stå i sidans egen apparat, inte bara i bildtexten.
        stem = re.split(r"[,(]", source)[0].strip()
        if stem and stem not in frontmatter and stem not in body_after.replace(body, ""):
            hits.append({"sev": WARN, "line": line, "rule": "osammanhängande",
                         "msg": f"»{stem[:50]}« finns inte i sidans sources: eller fotnoter"})

        url = scalar(body, "sourceUrl")
        if url and not offline:
            code = url_status(url, timeout)
            if code is None or code >= 400:
                hits.append({"sev": ERROR, "line": line, "rule": "död url",
                             "msg": f"{url} [{code or 'ingen respons'}] — ta bort raden, "
                                    f"behåll källans namn"})

    return hits



# ──────────────────────────────────────────────
# Självtest
#
# Kör i pnpm test:checkers. Fallen går i BÅDA riktningarna med avsikt: en grind som bara
# testas på det den ska fälla slutar tyst att släppa igenom det den ska släppa igenom, och
# tvärtom. Kategorifällan för rättsskolor fanns på pappret i månader utan att finnas i
# koden — just för att inget test bad om den.
# ──────────────────────────────────────────────

def _doc(body: str) -> str:
    return "---\ntitle: Test\n---\n\nBrödtext.\n\n" + body + "\n"


def _run(body: str) -> list[dict]:
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as fh:
        fh.write(_doc(body))
        tmp = Path(fh.name)
    try:
        return check(tmp, offline=True, timeout=1.0)
    finally:
        tmp.unlink(missing_ok=True)


def _rules(hits: list[dict], sev: str) -> set[str]:
    return {h["rule"] for h in hits if h["sev"] == sev}


CHART_MADHHAB = """```chart
type: bars
source: Ibn Rushd, Bidayat al-mujtahid, 1198
data:
  Hanafi: 3
  Maliki: 2
  Shafii: 4
  Hanbali: 1
```"""

TABLE_FOUR = """```table
source: Ibn Rushd, Bidayat al-mujtahid, 1198
columns: Rättsskola | Hållning
data:
  Hanafi: Tillåtet
  Maliki: Tillåtet
  Shafii: Ogillat
  Hanbali: Ogillat
```"""

TABLE_THREE = """```table
source: Ibn Rushd, Bidayat al-mujtahid, 1198
columns: Rättsskola | Hållning
data:
  Hanafi: Tillåtet
  Maliki: Tillåtet
  Shafii: Ogillat
```"""

TABLE_SHIA = """```table
source: Ibn Rushd, Bidayat al-mujtahid, 1198
columns: Rättsskola | Hållning
data:
  Hanafi: Tillåtet
  Maliki: Tillåtet
  Shafii: Ogillat
  Hanbali: Ogillat
  Jaʿfari: Tillåtet
```"""

CHART_NOTE_MENTIONS = """```chart
type: bars
unit: procent
source: SCB, tabell 4822, 2025
note: Siffrorna gäller alla rättsskolor, hanafi såväl som hanbali.
data:
  Sverige: 8
  Norge: 6
```"""

NO_SOURCE = """```table
columns: A | B
data:
  Ett: 1
  Två: 2
```"""

FIVE = """```table
source: X, 2025
columns: Rättsskola | Hållning
caption: De fem rättsskolorna om frågan.
data:
  Ett: a
  Två: b
```"""


def self_test() -> int:
    failures: list[str] = []

    def expect(name: str, body: str, *, errors: set[str] = frozenset(),
               warns: set[str] = frozenset()) -> None:
        hits = _run(body)
        got_e, got_w = _rules(hits, ERROR), _rules(hits, WARN)
        # Bara de regler fallet uttalar sig om jämförs; »osammanhängande« beror på sidans
        # apparat och är inte det som testas här.
        got_e &= errors | {"kategorifällan", "fem skolor", "saknad källa"}
        got_w &= warns | {"ofullständig"}
        if got_e != errors:
            failures.append(f"{name}: fel-regler {sorted(got_e)}, väntade {sorted(errors)}")
        if got_w != warns:
            failures.append(f"{name}: varnings-regler {sorted(got_w)}, väntade {sorted(warns)}")

    # ⚠️ Regressionen som gav upphov till självtestet: substantivformerna av rättsskolorna
    # gick rakt igenom kategorifällan, så ett diagram med en stapel per skola passerade.
    expect("diagram med rättsskolor som kategori", CHART_MADHHAB, errors={"kategorifällan"})
    expect("tabell med alla fyra", TABLE_FOUR)
    expect("tabell med tre av fyra", TABLE_THREE, warns={"ofullständig"})
    expect("tabell som lägger till en femte", TABLE_SHIA, errors={"kategorifällan"})
    # Att NÄMNA rättsskolorna i en brasklapp är inte att göra dem till kategori.
    expect("diagram vars brasklapp nämner skolorna", CHART_NOTE_MENTIONS)
    expect("figur utan källa", NO_SOURCE, errors={"saknad källa"})
    expect("»de fem rättsskolorna«", FIVE, errors={"fem skolor"})

    # ⚠️ Skrivsättsregression: mönstret tog bara nakna ASCII-former, så etiketterna
    # »Shafi'i«, »Mālikī« och »Hanbalī« gick rakt igenom kategorifällan.
    for label_set, name in (
        (("Hanafi", "Mālikī", "Shafi'i", "Hanbalī"), "diakriter och apostrof"),
        (("Ḥanafī", "Mālikī", "Shāfiʿī", "Ḥanbalī"), "full transkription"),
    ):
        rows = "\n".join(f"  {l}: 1" for l in label_set)
        expect(f"diagram med rättsskolor ({name})",
               f"```chart\ntype: bars\nsource: Ibn Rushd, 1198\ndata:\n{rows}\n```",
               errors={"kategorifällan"})
        expect(f"tabell med alla fyra ({name})",
               f"```table\nsource: Ibn Rushd, 1198\ncolumns: Rättsskola | Hållning\ndata:\n{rows}\n```")

    # Metagrind: om blocks() slutar hitta figurer blir varje regel tyst och testet ovan
    # skulle rapportera idel OK utan att ha läst någonting alls.
    if len(blocks(_doc(TABLE_FOUR))) != 1:
        print("ABORT: blocks() hittade ingen figur — kontrollen är trasig")
        return 2

    if failures:
        print("SJÄLVTEST MISSLYCKADES")
        for f in failures:
            print(f"  ✗ {f}")
        return 1
    print("check-chart-sources: självtest ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    # nargs="*" så att --self-test kan köras utan filer. Tomheten kontrolleras nedan:
    # en glob som inte matchar något får ALDRIG rapportera en grön grind.
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--offline", action="store_true", help="hoppa över URL-kontrollen")
    ap.add_argument("--timeout", type=float, default=8.0)
    ap.add_argument("--self-test", action="store_true", help="kör grindens egna testfall")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    # ⚠️ Utan det här returnerade `check-chart-sources.py --offline data/tomt/*.md` noll fel
    # och slutkod 0 när globben inte matchade någonting — en grind som rapporterar grönt
    # efter att ha läst noll filer är värre än ingen grind.
    if not args.files:
        print("Inga filer angavs. Ange minst en fil, eller kör --self-test.", file=sys.stderr)
        return 2

    total_blocks = 0
    errors = 0
    warnings = 0

    for path in args.files:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        found = blocks(text)
        total_blocks += len(found)
        hits = check(path, args.offline, args.timeout)
        errors += sum(1 for h in hits if h["sev"] == ERROR)
        warnings += sum(1 for h in hits if h["sev"] == WARN)
        if hits:
            print(f"\n  {path.name}")
            for h in sorted(hits, key=lambda x: (x["sev"] != ERROR, x["line"])):
                mark = "✗" if h["sev"] == ERROR else "!"
                print(f"     {mark} {h['rule']:<18} rad {h['line']}")
                print(f"       {h['msg']}")

    print("\n" + "=" * 72)
    print(f"  {len(args.files)} filer, {total_blocks} figurer — {errors} fel, {warnings} varningar")
    print("=" * 72)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
