#!/usr/bin/env python3
"""Kontrollera husets typografi- och språkkonventioner i publicerade texter.

Komplement till evaluate-article.py: den räknar AI-mönster och prosakvalitet,
den här kollar de bindande husreglerna — tankstreck, citattecken, tilltal,
rubriker — som är olika för essäer (data/articles) och svarssidor (data/svar).

Reglerna kommer från fix-passet 2026-07-09 (svar) och dash/dropcap-beslutet
(essäer). Se .claude/skills/language-pass/SKILL.md för sammanhanget.

Användning:
    python scripts/check-house-style.py data/svar/vad-ar-zakat.md
    python scripts/check-house-style.py data/articles/*.md
    python scripts/check-house-style.py --json data/svar/*.md
    python scripts/check-house-style.py --severity error data/svar/*.md

Slutkod 1 om någon regel med severity=error slår till.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ERROR, WARN, INFO = "error", "warn", "info"
# Referenssidor (svar + fordjupning) delar husreglerna; essäerna har egna.
REFERENCE_GENRES = ("svar", "fordjupning")
SEVERITY_ORDER = {ERROR: 0, WARN: 1, INFO: 2}


# ──────────────────────────────────────────────
# Parsning
# ──────────────────────────────────────────────

class Doc:
    """En artikel uppdelad i de radklasser reglerna behöver skilja på."""

    def __init__(self, path: Path):
        self.path = path
        raw = path.read_text(encoding="utf-8")
        lines = raw.splitlines()

        self.frontmatter: list[tuple[int, str]] = []
        self.body: list[tuple[int, str]] = []

        # Frontmatter = första --- ... --- blocket
        if lines and lines[0].strip() == "---":
            end = next((i for i, l in enumerate(lines[1:], 1) if l.strip() == "---"), None)
            if end is not None:
                self.frontmatter = [(i + 1, l) for i, l in enumerate(lines[1:end], 1)]
                self.body = [(i + 1, l) for i, l in enumerate(lines[end + 1:], end + 1)]
            else:
                self.body = [(i + 1, l) for i, l in enumerate(lines)]
        else:
            self.body = [(i + 1, l) for i, l in enumerate(lines)]

        norm = str(path).replace("\\", "/")
        # ⚠️ Fördjupningssidorna delar reglerna med svarssidorna, inte med essäerna: de är
        # referenstext, inte litterär prosa. Utan den här grenen föll de på "essay" och
        # HOPPADE TYST ÖVER gungbrädetaket, tankstrecksbudgeten, punkt-under, du-tilltal
        # och kontrollen av "Källor" i brödtexten.
        if "/svar/" in norm:
            self.genre = "svar"
        elif "/fordjupning/" in norm:
            self.genre = "fordjupning"
        else:
            self.genre = "essay"

    # -- radklasser -------------------------------------------------

    @staticmethod
    def is_blockquote(line: str) -> bool:
        return line.lstrip().startswith(">")

    @staticmethod
    def is_attribution(line: str) -> bool:
        """En källrad under ett citat: "> — Koranen 9:103"."""
        return bool(re.match(r"^\s*>\s*[—–-]\s*\S", line))

    @staticmethod
    def is_heading(line: str) -> bool:
        return line.lstrip().startswith("#")

    @staticmethod
    def is_footnote_def(line: str) -> bool:
        return bool(re.match(r"^\[\^[^\]]+\]:", line))

    def prose(self) -> list[tuple[int, str]]:
        """Författarens egen brödtext — inte citat, rubriker eller fotnoter."""
        out = []
        for n, line in self.body:
            s = line.strip()
            if not s or s == "---":
                continue
            if self.is_blockquote(line) or self.is_heading(line) or self.is_footnote_def(line):
                continue
            out.append((n, line))
        return out

    def headings(self) -> list[tuple[int, str]]:
        return [(n, l) for n, l in self.body if self.is_heading(l)]

    def sections(self) -> list[tuple[str, list[tuple[int, str]]]]:
        """(rubriktext, prosarader) per ## -avsnitt."""
        out: list[tuple[str, list[tuple[int, str]]]] = []
        current_title = "(ingress)"
        current: list[tuple[int, str]] = []
        for n, line in self.body:
            if re.match(r"^##\s+", line):
                out.append((current_title, current))
                current_title = line.lstrip("# ").strip()
                current = []
                continue
            s = line.strip()
            if not s or self.is_blockquote(line) or self.is_heading(line) or self.is_footnote_def(line):
                continue
            current.append((n, line))
        out.append((current_title, current))
        return [(t, ls) for t, ls in out if ls]


QUOTE_SPAN = re.compile(r'"[^"\n]{1,400}"|”[^”\n]{1,400}”|«[^»\n]{1,400}»')


def outside_quotes(text: str) -> str:
    """Ersätt citatinnehåll med blanksteg — registerregler gäller inte i citat."""
    return QUOTE_SPAN.sub(lambda m: " " * len(m.group()), text)


# ──────────────────────────────────────────────
# Regler
# ──────────────────────────────────────────────

def _hit(rule: str, sev: str, line: int, excerpt: str, fix: str) -> dict:
    return {"rule": rule, "severity": sev, "line": line, "excerpt": excerpt.strip()[:160], "fix": fix}


def rule_em_dash(doc: Doc) -> list[dict]:
    """Tankstreck i prosa ska vara spatierat en dash " – ". Em dash (—) hör
    bara hemma i en källrad under ett blockcitat ("> — Koranen 9:103").

    Em dash inuti själva citattexten rapporteras som info, aldrig som fel:
    citatet är verifierad källtext och ändras inte för husstilens skull.
    """
    hits = []
    for n, line in doc.frontmatter + doc.body:
        if "—" not in line or doc.is_attribution(line):
            continue
        if doc.is_blockquote(line):
            hits.append(_hit("em-dash-i-citat", INFO, n, line,
                             "citattext — lämna orörd om inte källan själv har annat"))
            continue
        hits.append(_hit("em-dash", ERROR, n, line, 'byt "—" mot spatierat " – "'))
    return hits


def rule_guillemets(doc: Doc) -> list[dict]:
    return [
        _hit("guillemets", ERROR, n, line, 'huset använder raka "…", inte »…«')
        for n, line in doc.frontmatter + doc.body
        if "»" in line or "«" in line
    ]


def rule_curly_quotes(doc: Doc) -> list[dict]:
    """Krulliga citattecken byts mot raka i prosan.

    Två undantag, båda av samma skäl som em dash-regeln. Inne i ett blockcitat
    är tecknet källans eget och rapporteras bara som info. I frontmatter hoppas
    regeln över helt: där ligger texten i YAML-strängar som redan är dubbel-
    citerade, och ”…” är då enda sättet att citera inuti utan att bryta
    parsningen.
    """
    hits = []
    for n, line in doc.body:
        if not ("”" in line or "“" in line or "„" in line):
            continue
        if doc.is_blockquote(line):
            hits.append(_hit("curly-quotes-i-citat", INFO, n, line,
                             "citattext — lämna orörd"))
            continue
        hits.append(_hit("curly-quotes", WARN, n, line, 'byt ”…” mot raka "…"'))
    return hits


# En URL och en källas EGNA titel är citerad text, inte vår prosa — husstavningen
# gäller inte där. ⚠️ abort.md fick tre fel för RFSU:s sidtitel "Abortmotstånd idag",
# varav ett inne i själva URL:en. En kontroll som säger åt en att stava om någon
# annans boktitel lär läsaren att strunta i kontrollen.
_CITED_TITLE = re.compile(r'https?://\S+|"[^"]*\bidag\b[^"]*"|»[^»«]*\bidag\b[^»«]*«', re.I)


def rule_idag(doc: Doc) -> list[dict]:
    return [
        _hit("idag", ERROR, n, line, '"i dag" skrivs i två ord')
        for n, line in doc.frontmatter + doc.body
        if re.search(r"\bidag\b", _CITED_TITLE.sub("", line), re.IGNORECASE)
    ]


def rule_mekka(doc: Doc) -> list[dict]:
    return [
        _hit("mekka", WARN, n, line, 'husstavning: "Mecka"')
        for n, line in doc.frontmatter + doc.body
        if re.search(r"\bMekka\b", line)
    ]


def rule_double_space(doc: Doc) -> list[dict]:
    """Dubbelt blanksteg är nästan alltid rester efter en handredigering."""
    return [
        _hit("double-space", WARN, n, line, "dubbelt blanksteg — ta bort det ena")
        for n, line in doc.prose()
        if re.search(r"[^\s]  +[^\s]", line)
    ]


_TALORD = (
    r"(?:noll|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv|tretton|"
    r"fjorton|femton|sexton|sjutton|arton|nitton|tjugo|trettio|fyrtio|femtio|"
    r"sextio|sjuttio|åttio|nittio|hundra|tusen)"
)


def rule_unspaced_dash(doc: Doc) -> list[dict]:
    """ord–ord utan blanksteg.

    Intervall skrivs med ospatierat tankstreck och är alltså korrekta — både med
    siffror (1300–1373, 112:1–4) och med talen utskrivna (tio–elva dagar). Bara
    det senare behöver kollas här; sifferfallen faller redan på regexets \\d.
    """
    hits = []
    for n, line in doc.prose():
        for m in re.finditer(r"(?<=[^\s\d–])–(?=[^\s\d–])", line):
            vänster, höger = line[: m.start()], line[m.end() :]
            if re.search(rf"(?:^|\W){_TALORD}$", vänster, re.I) and re.match(
                rf"{_TALORD}\b", höger, re.I
            ):
                continue
            hits.append(
                _hit("unspaced-dash", WARN, n, line,
                     "tankstreck mellan ord spatieras: ord – ord")
            )
            break
    return hits


def rule_du_tilltal(doc: Doc) -> list[dict]:
    """Svarssidor skrivs i tredje person. Du-tilltal inne i ett citat är förstås ok."""
    if doc.genre not in REFERENCE_GENRES:
        return []
    hits = []
    for n, line in doc.prose():
        stripped = outside_quotes(line)
        # ⚠️ Negativ lookbehind på bindestreck: translittererade namn bär "din" som
        # egen ordled — Muhammad Nasir al-Din al-Albani, Salah al-Din, Nur al-Din — och
        # \b efter ett bindestreck gör dem till träffar. Varje islamisk referenstext
        # utlöste regeln på ett författarnamn.
        m = re.search(r"(?<!-)\b(du|dig|din|ditt|dina)\b", stripped, re.IGNORECASE)
        if m:
            hits.append(_hit("du-tilltal", ERROR, n, line,
                             f'"{m.group()}" — skriv i tredje person ("muslimen", "den som")'))
    return hits


def rule_body_kallor(doc: Doc) -> list[dict]:
    """Frontmatter-`sources` är den enda källistan; en `## Källor` i brödtexten
    renderas som en dubblett av mallens "Källor och fördjupning"."""
    if doc.genre not in REFERENCE_GENRES:
        return []
    return [
        _hit("body-kallor", ERROR, n, line,
             "ta bort — frontmatter `sources` renderar redan listan")
        for n, line in doc.headings()
        # ⚠️ Anchored, not a substring search: fördjupningssidorna har ett obligatoriskt
        # avsnitt som heter "Vad källorna säger", och en fri sökning på "källor"
        # underkände det. Regeln gäller en KÄLLISTA, inte ordet.
        if re.match(r"^\s*#+\s*källor\b", line.strip(), re.IGNORECASE)
    ]


def rule_dropcap_opening(doc: Doc) -> list[dict]:
    """Anfangen (::first-letter) tar första tecknet i första <p>. Citattecken,
    blockcitat och Å/Ä/Ö renderas trasigt."""
    if doc.genre != "essay":
        return []
    first = next((( n, l) for n, l in doc.body if l.strip()), None)
    if not first:
        return []
    n, line = first
    ch = line.strip()[0]
    if ch in '>"”«ÅÄÖ':
        return [_hit("dropcap-opening", ERROR, n, line,
                     f'essän får inte inledas med "{ch}" — anfangen bryts')]
    return []


def rule_sunnitisk(doc: Doc) -> list[dict]:
    """Undvik sekteristiskt "sunnitisk" i löptext ("sunnimuslimer" som
    demografi går bra)."""
    return [
        _hit("sunnitisk", WARN, n, line, 'använd "klassisk"/"islamisk" i stället')
        for n, line in doc.prose()
        if re.search(r"\bsunnitisk\w*\b", line, re.IGNORECASE)
    ]


def rule_dot_under(doc: Doc) -> list[dict]:
    """Referenssidorna (svar + fordjupning) translittererar utan punkt under (tawhīd, inte tawḥīd);
    makroner behålls. Essäerna använder full translitterering — rör dem inte."""
    if doc.genre not in REFERENCE_GENRES:
        return []
    hits = []
    for n, line in doc.body:
        if doc.is_blockquote(line):
            continue
        found = sorted(set(re.findall(r"[ḥṣḍṭẓṛḏḳʿ]", line)) - {"ʿ"})
        if found:
            hits.append(_hit("dot-under", INFO, n, line,
                             f"punkt under ({''.join(found)}) — referenssidor skriver utan"))
    return hits


SEESAW = re.compile(r"\binte\b[^.!?]{0,90}?\butan\b", re.IGNORECASE)


def rule_seesaw_closers(doc: Doc) -> list[dict]:
    """Högst två avsnitt per referenssida får landa i samma gungbräda
    ("inte X, utan Y"). Revisionen 2026-07-09 hittade 173/179 sådana."""
    if doc.genre not in REFERENCE_GENRES:
        return []
    offenders = []
    for title, lines in doc.sections():
        n, last = lines[-1]
        sentences = re.split(r"(?<=[.!?])\s+", last.strip())
        closer = sentences[-1] if sentences else ""
        if SEESAW.search(closer):
            offenders.append((n, title, closer))
    if len(offenders) <= 2:
        return []
    return [
        _hit("seesaw-closers", WARN, n,
             f"[{title}] {closer}",
             f"{len(offenders)} avsnitt landar i \"inte X, utan Y\" (tak: 2) — "
             "låt resten sluta i ett rakt påstående, en bild eller ett historiskt fäste")
        for n, title, closer in offenders[2:]
    ]


def rule_dash_budget(doc: Doc) -> list[dict]:
    """Högst ~6 författartankstreck per referenssida — annars blir de en metronom."""
    if doc.genre not in REFERENCE_GENRES:
        return []
    total = sum(len(re.findall(r" – ", line)) for _, line in doc.prose())
    if total <= 6:
        return []
    return [_hit("dash-budget", WARN, 0, f"{total} spatierade tankstreck i brödtexten",
                 "tak ~6 per sida — gör om några till komma, kolon eller egen mening")]


# Ordbrott som Bernström-utgåvans radbrytningar lämnat kvar i quran.db. Kuraterad
# lista, inte heuristik: att gissa var ett mellanslag är oavsiktligt inuti ett svenskt
# ord ger falska träffar på verklig text, och det här är skrift.
QURAN_SCAN_ARTIFACTS = [
    "dött rar", "kvinn folk", "sö ner", "kläd nad", "utsmyck ning",
    "avvänj ningen", "underkas tat", "säker het", "hus trur", "otrog na",
    "såvi da", "gemen skap", "för nämligaste", "medgu dar", "be dem",
]


def rule_quran_scan_artifacts(doc: Doc) -> list[dict]:
    """Verstext kopierad rå ur quran.db bär den tryckta utgåvans radbrytningar.

    quran.db är inläst ur Bernströms tryckta upplaga och orden är delade där raden
    bröts. Kopieras versen rakt in i ett blockcitat följer brotten med och sidan
    publicerar trasig svenska. Den rena lydelsen finns på
    quran.com/<sura>/<vers>?translations=48.
    """
    hits = []
    for n, line in doc.body:
        low = line.lower()
        for frag in QURAN_SCAN_ARTIFACTS:
            if frag in low:
                hits.append(_hit("quran-scan-artifact", ERROR, n, line,
                                 f'"{frag}" är ett radbrott ur den tryckta utgåvan — '
                                 "hämta den rena lydelsen från quran.com (translations=48)"))
                break
    return hits


def rule_athari(doc: Doc) -> list[dict]:
    """Skolterminologin "athari" hör inte hemma i läsartext — namnge de lärda."""
    return [
        _hit("athari", ERROR, n, line,
             "för teknisk skolterminologi i läsartext — namnge den lärde i stället")
        for n, line in doc.prose()
        if re.search(r"\bathari\w*\b", line, re.IGNORECASE)
    ]


def rule_fordjupning_verse_attribution(doc: Doc) -> list[dict]:
    """På fördjupningssidor ska koranblockcitat fotnoteras, inte attribueras med en
    "— Koranen N:N"-rad.

    Båda vägarna ger en recitationsspelare, men attributionsraden ger en UTAN
    suranamn medan fotnoten ger en MED. Svarssidorna saknar fotnoter och måste
    använda raden; fördjupningssidorna har fotnotsapparat och ska inte.
    """
    if doc.genre != "fordjupning":
        return []
    return [
        _hit("verse-attribution-line", WARN, n, line,
             "fotnotera versen i stället (fotnoten lyder \"Koranen, al-Nūr 24:31.\") — "
             "attributionsraden ger en spelare utan suranamn")
        for n, line in doc.body
        if re.match(r"^\s*>\s*[—–-]\s*Koranen\s+\d", line)
    ]


GENERIC_HEADINGS = (
    "ordet och dess betydelse",
    "vad källorna säger",
    "hur de lärda har tolkat texterna",
    "historia",
    "invändningar och missförstånd",
)


def rule_fordjupning_generic_headings(doc: Doc) -> list[dict]:
    """Varje ## på en fördjupningssida ska fungera som en sökfras i sig.

    De fem rubrikerna nedan stod som exempel i författarprompten och kopierades
    därför ordagrant till de åtta första sidorna. Varken granskaren eller någon
    grind såg det, eftersom en intetsägande rubrik är språkligt oklanderlig.
    """
    if doc.genre != "fordjupning":
        return []
    return [
        _hit("generic-heading", WARN, n, line,
             "skriv om rubriken så att den bär ämnesordet och går att söka på "
             "(\"Slöjan i Sverige\", inte \"I Sverige\")")
        for n, line in doc.body
        if (m := re.match(r"^##\s+(.+?)\s*$", line))
        and m.group(1).strip().lower() in GENERIC_HEADINGS
    ]


# Shiitiska auktoriteter. Att citera en av dem som det som AVGÖR en fråga är en
# överträdelse; att nämna en ståndpunkt och besvara den är tillåtet. Kontrollen kan
# inte avgöra vilket, så namnen fäller och blotta omnämnandet varnar.
SHIA_AUTHORITIES = (
    r"al-Kulayn[īi]", r"al-Majlis[īi]", r"al-Ṭūs[īi]", r"al-T[ūu]s[īi]",
    r"al-Murtaḍ[āa]", r"al-Murtad[āa]", r"al-Khūʾ[īi]", r"al-Khu'?[īi]",
    r"Sistani", r"al-Sistani", r"Khomeini", r"al-Ṣadūq", r"al-Saduq",
)

# Att underkänna en auktoritet på genre, epok eller motiv i stället för på belägg.
GENRE_DISMISSAL = (
    r"h[äa]mtat? ur en stridsskrift",
    r"skriv(en|et) i polemiskt syfte",
    r"medeltida (manliga )?jurist",
    r"[äa]r part i m[åa]let",
    r"partsinlaga",
)


def rule_shia_sufi_mention(doc: Doc) -> list[dict]:
    """Varje shia-/sufiomnämnande måste bedömas för hand: visar det ståndpunkten fel?"""
    hits = []
    for n, line in doc.prose():
        if re.search(r"\b(de\s+)?fem\s+(rätts)?skolor", line, re.IGNORECASE):
            hits.append(_hit("fem-skolor", ERROR, n, line,
                             "rättsskolorna är fyra — hanafi, maliki, shafii, hanbali"))
        for pat in SHIA_AUTHORITIES:
            if re.search(pat, line):
                # WARN, inte ERROR: att NAMNGE en shiitisk auktoritet för att
                # vederlägga den är tillåtet (sunni-och-shia gör det fyra gånger).
                # Att låta den AVGÖRA frågan är det inte, och det kan bara en
                # människa skilja — så kontrollen tvingar fram blicken, inte fällan.
                hits.append(_hit("shia-auktoritet", WARN, n, line,
                                 "avgör för hand: citeras auktoriteten som det som AVGÖR "
                                 "frågan? då ska den bort. namnges den för att vederläggas "
                                 "är den tillåten"))
                break
        else:
            if re.search(r"shia|shiit|jaʿfar|jafarit|tolvshi|tolvimam|imamit|"
                         r"sufi|tariqa|tasawwuf", line, re.IGNORECASE):
                hits.append(_hit("shia-sufi-omnamnande", WARN, n, line,
                                 "bedöm för hand: visar meningen ståndpunkten FEL? "
                                 "ett neutralt omnämnande som lämnas stående ska bort"))
    return hits


def rule_genre_dismissal(doc: Doc) -> list[dict]:
    """En norm prövas mot sina belägg, aldrig mot vem som bär den."""
    return [
        _hit("genre-avfardande", ERROR, n, line,
             "underkänner en auktoritet på genre/epok/motiv i stället för på belägg "
             "— redovisa invändningen sakligt eller stryk den")
        for n, line in doc.prose()
        if any(re.search(pat, line, re.IGNORECASE) for pat in GENRE_DISMISSAL)
    ]


RULES = [
    rule_em_dash, rule_guillemets, rule_curly_quotes, rule_idag, rule_mekka,
    rule_double_space, rule_unspaced_dash, rule_du_tilltal, rule_body_kallor,
    rule_dropcap_opening, rule_sunnitisk, rule_dot_under, rule_seesaw_closers,
    rule_dash_budget, rule_quran_scan_artifacts, rule_athari,
    rule_fordjupning_verse_attribution, rule_fordjupning_generic_headings,
    rule_shia_sufi_mention, rule_genre_dismissal,
]


# ──────────────────────────────────────────────
# Körning
# ──────────────────────────────────────────────

def check(path: Path) -> dict:
    doc = Doc(path)
    hits: list[dict] = []
    for rule in RULES:
        hits.extend(rule(doc))
    hits.sort(key=lambda h: (SEVERITY_ORDER[h["severity"]], h["line"]))
    return {
        "file": str(path),
        "genre": doc.genre,
        "errors": sum(1 for h in hits if h["severity"] == ERROR),
        "warnings": sum(1 for h in hits if h["severity"] == WARN),
        "info": sum(1 for h in hits if h["severity"] == INFO),
        "hits": hits,
    }


def print_report(result: dict) -> None:
    name = Path(result["file"]).name
    counts = f"{result['errors']} fel, {result['warnings']} varningar, {result['info']} info"
    if not result["hits"]:
        print(f"  OK   {name}  ({result['genre']})")
        return
    icon = "FEL " if result["errors"] else "VARN"
    print(f"\n{icon} {name}  ({result['genre']}) — {counts}")
    for h in result["hits"]:
        loc = f":{h['line']}" if h["line"] else ""
        print(f"       {h['severity']:<5} {h['rule']:<17} {name}{loc}")
        print(f"             {h['excerpt']}")
        print(f"             → {h['fix']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Husstilskontroll för islam.se-texter")
    parser.add_argument("files", nargs="+", help="Markdownfiler att kontrollera")
    parser.add_argument("--json", action="store_true", help="JSON i stället för text")
    parser.add_argument("--severity", choices=[ERROR, WARN, INFO], default=INFO,
                        help="Lägsta allvarsgrad som rapporteras (standard: info)")
    args = parser.parse_args()

    floor = SEVERITY_ORDER[args.severity]
    results = []
    for filepath in args.files:
        path = Path(filepath)
        if not path.exists():
            print(f"Hittar inte: {filepath}", file=sys.stderr)
            continue
        result = check(path)
        result["hits"] = [h for h in result["hits"] if SEVERITY_ORDER[h["severity"]] <= floor]
        results.append(result)

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        for result in results:
            print_report(result)
        if len(results) > 1:
            e = sum(r["errors"] for r in results)
            w = sum(r["warnings"] for r in results)
            i = sum(r["info"] for r in results)
            clean = sum(1 for r in results if not r["hits"])
            print(f"\n{'=' * 60}")
            print(f"  {len(results)} filer — {clean} rena, {e} fel, {w} varningar, {i} info")
            print(f"{'=' * 60}")

    return 1 if any(r["errors"] for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
