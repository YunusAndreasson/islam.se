#!/usr/bin/env python3
"""check-era-arithmetic.py — hittar felräknade tidsavstånd i essäer och svarssidor.

Korpusen vilar på en enda retorisk figur: "N sekler före/senare nådde X samma
punkt." Figuren är osynlig för alla andra kontroller — den bryter ingen språkregel,
ingen typografi, ingen fotnot. Den är bara fel. Vid införandet 2026-07-26 bar
korpusen fem sådana fel, bland dem "Aristoteles, fem sekler före Koranen"
(verkligt avstånd: nio) och "fjorton sekler före Strindberg" i en essä som på
nästa sida skrev "tretton sekler senare" om den *senare* Wittgenstein.

Kontrollen gissar aldrig ett ankare. Den mäter bara anspråk där BÅDA ändpunkterna
står namngivna i samma mening:

    "Aristoteles, fem sekler före Koranen, rörde vid samma problem."
     └─ ändpunkt B                  └─ ändpunkt A          → |615 − (−350)| = 965 år
                                                             påstått: 500 → FEL

Levnadsår läses i första hand ur filen själv ("Strindberg (1849–1912)") och faller
annars tillbaka på tabellen över gestalter som återkommer i korpusen. Ett anspråk
vars ändpunkter inte går att lösa upp rapporteras inte — verktyget föreslår, du
avgör.

    python3 scripts/check-era-arithmetic.py data/articles/*.md
"""
import re
import sys
from pathlib import Path

# Hur mycket ett anspråk får avvika innan det flaggas. Essäistisk avrundning ska
# rymmas ("halvtannat sekel" för 157 år), men inte ett helt sekel på tok.
TOLERANS_ANDEL = 0.15
TOLERANS_MIN = 120  # år; under detta flaggas aldrig, avrundning är legitim

# Verksamt år (verkets tid), inte nödvändigtvis födelse/död. Negativt = f.Kr.
KANDA = {
    "koranen": 615, "uppenbarelsen": 615, "profeten": 615, "profeten muhammed": 615,
    "aristoteles": -350, "platon": -380, "herakleitos": -500, "sokrates": -410,
    "pascal": 1670, "swedenborg": 1740, "linné": 1750, "goethe": 1819,
    "kierkegaard": 1844, "rydberg": 1859, "darwin": 1859, "ellen key": 1900,
    "strindberg": 1897, "söderberg": 1905, "lagerlöf": 1918, "levertin": 1900,
    "boye": 1934, "martinson": 1956, "wittgenstein": 1921, "lewis": 1960,
    "damasio": 1994, "kahneman": 2011, "chalmers": 1995, "berridge": 2009,
    "de rougemont": 1939, "rougemont": 1939, "günther anders": 1972,
    "acemoglu": 2012, "hjärnskannern": 1971, "hjärnskanner": 1971,
    "ibn khaldūn": 1380, "ibn khaldun": 1380, "al-ghazālī": 1100,
    "ibn qayyim": 1330, "ibn qayyim al-jawziyyah": 1330, "ibn taymiyyah": 1300,
    "al-māwardī": 1040, "ibn al-jawzī": 1190, "ibn rajab": 1380,
    "ibn kathīr": 1360, "al-jurjānī": 1050, "sībawayh": 780,
    "al-ḥasan al-baṣrī": 700, "al-khaṭṭābī": 990, "ʿumar": 640, "umar": 640,
}

TAL = {
    "ett": 1, "en": 1, "två": 2, "tre": 3, "fyra": 4, "fem": 5, "sex": 6,
    "sju": 7, "åtta": 8, "nio": 9, "tio": 10, "elva": 11, "tolv": 12,
    "tretton": 13, "fjorton": 14, "femton": 15, "sexton": 16, "sjutton": 17,
    "arton": 18, "nitton": 19, "tjugo": 20,
}
HUNDRATAL = {
    "hundra": 1, "tvåhundra": 2, "trehundra": 3, "fyrahundra": 4, "femhundra": 5,
    "sexhundra": 6, "sjuhundra": 7, "åttahundra": 8, "niohundra": 9, "tusen": 10,
}

_ord = sorted(set(TAL) | set(HUNDRATAL), key=len, reverse=True)
CLAIM = re.compile(
    r"\b(?P<tal>" + "|".join(map(re.escape, _ord)) + r")"
    r"(?P<halv>\s+och\s+ett\s+halvt)?\s*"
    r"(?P<enhet>sekler|sekel|hundra\s+år|år)\s+"
    r"(?P<riktning>före|senare|efter|tidigare)\b",
    re.IGNORECASE,
)

# Elliptiskt andraled: "Fjorton sekler före Chalmers, elva före Swedenborg" —
# enheten är underförstådd i det andra ledet.
ELLIPS = re.compile(
    r",\s*(?:" + "|".join(map(re.escape, _ord)) + r")\s+"
    r"(?:före|senare|efter|tidigare)\b",
    re.IGNORECASE,
)

DATED = re.compile(
    r"(?P<namn>[A-ZÅÄÖ][\wʿʾāīūḥṣṭẓḍġḫšʼ’'-]+(?:\s+(?:al-|ibn\s+|de\s+|von\s+)?"
    r"[A-ZÅÄÖa-zåäö][\wʿʾāīūḥṣṭẓḍġḫšʼ’'-]+){0,3})\s*"
    r"\((?:ca\.?\s*|d\.\s*)?(?P<a>\d{3,4})\s*(?:[–-]\s*(?P<b>\d{3,4}))?\)"
)


def lokala_datum(text):
    """Levnadsår som texten själv anger, nyckelade på både fullnamn och efternamn."""
    ut = {}
    for m in DATED.finditer(text):
        a = int(m.group("a"))
        b = int(m.group("b")) if m.group("b") else a
        ar = (a + b) // 2
        namn = m.group("namn").strip()
        ut.setdefault(namn.lower(), ar)
        ut.setdefault(namn.split()[-1].lower(), ar)
    return ut


def hitta_entiteter(fras, tabeller):
    """Alla kända gestalter som nämns i frasen, i den ordning de står."""
    träffar = []
    for tabell in tabeller:
        for namn, ar in tabell.items():
            for m in re.finditer(r"(?<![\w-])" + re.escape(namn) + r"(?![\w-])", fras, re.I):
                träffar.append((m.start(), namn, ar))
    # längsta match vinner på varje position
    träffar.sort(key=lambda t: (t[0], -len(t[1])))
    ut, sedda = [], set()
    for pos, namn, ar in träffar:
        if any(abs(pos - p) < 3 for p in sedda):
            continue
        sedda.add(pos)
        ut.append((pos, namn, ar))
    return ut


def meningar(body):
    """Ger (avsnitt, mening). Avsnittet är närmast föregående ##-rubrik."""
    avsnitt = "(ingress)"
    for stycke in body.split("\n"):
        if stycke.startswith("#"):
            avsnitt = stycke.lstrip("# ").strip()
            continue
        if stycke.startswith((">", "[^")) or not stycke.strip():
            continue
        for m in re.finditer(r"[^.!?]+[.!?]?", stycke):
            if m.group().strip():
                yield avsnitt, m.group().strip()


def granska(path):
    text = path.read_text(encoding="utf-8")
    body = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)
    tabeller = [lokala_datum(text), KANDA]
    fynd = []
    # Anspråk med bara EN utpekbar ändpunkt ("fjorton sekler före Strindberg").
    # Den andra ändpunkten är underförstådd — men inom en och samma essä är det
    # alltid samma underförstådda punkt (den text essän utgår från). Alltså måste
    # sådana anspråk peka på samma år. Gör de inte det motsäger essän sig själv.
    ensam = []

    for avsnitt, mening in meningar(body):
        cm = CLAIM.search(mening)
        if not cm:
            continue
        talord = cm.group("tal").lower()
        enhet = cm.group("enhet").lower()
        if talord in HUNDRATAL:
            # Hundratalet sitter i själva ordet: "sjuhundra år" = 700, inte 7.
            pastatt = HUNDRATAL[talord] * 100
        elif enhet.startswith(("sekel", "sekler", "hundra")):
            pastatt = TAL[talord] * 100
        else:
            pastatt = TAL[talord]
        if cm.group("halv"):
            pastatt += 50

        ent = hitta_entiteter(mening, tabeller)
        efter = [e for e in ent if e[0] > cm.end()]
        fore = [e for e in ent if e[0] < cm.start()]

        # "Fjorton sekler före Chalmers, elva före Swedenborg" — två anspråk i en
        # mening är parallella mätningar från ETT gemensamt ankare, inte ändpunkter
        # på ett spann. Skicka dem till ankarkontrollen i stället.
        if len(CLAIM.findall(mening)) > 1 or ELLIPS.search(mening):
            if efter:
                ensam.append((avsnitt, mening, cm, pastatt,efter[0]))
            continue
        # Ändpunkt A är den som riktningsordet pekar på — alltid den närmast efter.
        # Ändpunkt B är den andra gestalten: antingen nästa efter A ("fjorton sekler
        # före hjärnskannern förstod al-Māwardī") eller den som stod före anspråket
        # ("Aristoteles, fem sekler före Koranen").
        if not efter:
            ensam.append((avsnitt, mening, cm, pastatt,fore[-1] if fore else None))
            continue
        a = efter[0]
        kandidater = [e for e in efter[1:] if e[1] != a[1]]
        b = kandidater[0] if kandidater else (fore[-1] if fore else None)
        if b is None or a[1] == b[1]:
            ensam.append((avsnitt, mening, cm, pastatt,a))
            continue
        verkligt = abs(a[2] - b[2])
        avvikelse = abs(verkligt - pastatt)
        if avvikelse > max(TOLERANS_MIN, pastatt * TOLERANS_ANDEL):
            fynd.append(
                dict(sort="avstånd", mening=" ".join(mening.split())[:110],
                     pastatt=pastatt, verkligt=verkligt,
                     a=a[1], aar=a[2], b=b[1], bar=b[2])
            )

    # Underförstådda ankare ska stämma överens INOM ett avsnitt. Över en hel essä
    # duger det inte: en essä byter med rätta referenspunkt mellan avsnitten
    # (först Koranen, sedan Swedenborg). Inom ett och samma avsnitt gör den inte det.
    #
    # Ankaret ligger i BÅDA riktningarna före referensen: "N år före X" beskriver
    # något som hände vid X − N, och "N år senare gjorde X samma sak" utgår från
    # en punkt vid X − N. Alltså ankare = referensår − avstånd i båda fallen.
    per_avsnitt = {}
    for avsnitt, mening, cm, pastatt, ent in ensam:
        if ent is None:
            continue
        per_avsnitt.setdefault(avsnitt, []).append(
            (ent[2] - pastatt, mening, ent, pastatt)
        )
    for avsnitt, punkter in per_avsnitt.items():
        if len(punkter) < 2:
            continue
        lo, hi = min(p[0] for p in punkter), max(p[0] for p in punkter)
        if hi - lo > 100:
            fynd.append(dict(sort="motsägelse", avsnitt=avsnitt,
                             spridning=hi - lo, punkter=punkter))
    return fynd


def ar(y):
    return f"{abs(y)} f.Kr." if y < 0 else str(y)


def main(argv):
    filer = [Path(p) for p in argv[1:]]
    if not filer:
        print(__doc__)
        return 0
    totalt = 0
    for p in sorted(filer):
        fynd = granska(p)
        if not fynd:
            continue
        totalt += len(fynd)
        print(f"\n──── {p.name}")
        for f in fynd:
            if f["sort"] == "avstånd":
                print(f'  AVSTÅND     "{f["mening"]}"')
                print(f'     påstått : {f["pastatt"]} år')
                print(f'     verkligt: {f["verkligt"]} år '
                      f'({f["b"]} ≈ {ar(f["bar"])} → {f["a"]} ≈ {ar(f["aar"])})')
            else:
                print(f'  MOTSÄGELSE  "{f["avsnitt"]}" — underförstådda ankare '
                      f'{f["spridning"]} år isär:')
                for ankare, mening, ent, pastatt in sorted(f["punkter"]):
                    print(f'     "{" ".join(mening.split())[:88]}"')
                    print(f'        {ent[1]} ≈ {ar(ent[2])}, {pastatt} år ⇒ ankare {ar(ankare)}')
            print()
    print("=" * 62)
    ordet = "tidsavstånd" if totalt == 1 else "tidsavstånd"
    print(f"  {len(filer)} filer — {totalt} felaktigt {ordet} att rätta")
    print("=" * 62)
    return 1 if totalt else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
