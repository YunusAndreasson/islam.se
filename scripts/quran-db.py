#!/usr/bin/env python3
"""quran.db: Bernströms husöversättning bredvid Wennerströms skanning, och en varsam
städning av skanningen.

Varför det här finns. `verses.text_swedish` är Kent Asante Wennerströms översättning,
inläst ur den tryckta utgåvan, och den bär tryckets spår: ord delade vid radbrytningen
(»an       förtrotts«, »förma     nar«), sidnummer och delrubriker (»789 DEL 29«)
mitt i versen, och översättarens förklarande noter inklistrade efter verstexten
(4:58 slutar »… allt ni anförtrotts Omfattar alla förtroenden; … (T,K)«). Parsern
som läste in skanningen delade dessutom ofta versen vid en rad som började med
versal, så `commentary` håller ibland versens andra halva (47:7 »Om ni hjälper« +
»Allah skall Han hjälpa er …«) i stället för en not.

Husöversättningen för CITAT är Knut Bernström (quran.com, översättning 48). Den
hämtas hit till en egen kolumn, `text_bernstrom`, så att pipelinen kan citera
ordagrant ur husets egen databas i stället för att gå till webben.

Två kommandon, båda säkra att köra om:

  bernstrom   Hämtar Bernström sura för sura (114 anrop, cachade i
              node_modules/.cache/quran-com/) och skriver `text_bernstrom`. Samma
              anrop ger den arabiska texten (uthmani), som skrivs till `text_arabic`
              där den är tom — kolumnen stod tom för alla 6 233 verser.
              Städningen är fetch_verse() i check-quran-quotes.py UTAN dess
              normalise(): <sup>-noter och taggar bort, entiteter avkodade, blanktecken
              hopslagna — men streck och citattecken står kvar som de är publicerade.

  clean       Städar Wennerström. Första körningen sparar skanningen orörd i
              `text_swedish_raw` / `commentary_raw`; varje körning härleder sedan
              `text_swedish` och `commentary` på nytt ur de kolumnerna, så resultatet
              är reproducerbart och går att backa. Vad som görs:
                · sidnummer och »DEL nn« bort, layoutblanktecken hopslagna;
                · delade ord skarvas ihop — ENDAST när den hopskarvade formen är ett ord
                  (hunspell, data/hunspell/sv, eller en form som står hel på annat
                  ställe i korpusen) och fragmenten inte båda är ord (»till stånd«
                  står kvar, »an förtrotts« blir »anförtrotts«). Avstavning vid
                  radslut (»upp- gift«) skarvas på samma villkor;
                · noter som inleds med en upprepning av versfrasen de förklarar flyttas
                  till `commentary` (före det som redan står där, i skanningens ordning);
                · `commentary` utan källsiglum (T/K/B/Ö) som bara är versens
                  fortsättning förs tillbaka in i versen.
              En not UTAN upprepad frasinledning går inte att skilja från versen utan
              att gissa, och en fel gissning stympar skriften — den lämnas och räknas.

  stats       Mätningen, utan att skriva något.

Efter `clean`: bygg om versinbäddningarna (de härleds ur text_swedish):
    pnpm cli clean-quran

    python3 scripts/quran-db.py bernstrom [--refresh]
    python3 scripts/quran-db.py clean [--dry-run] [--sample N]
    python3 scripts/quran-db.py stats
    python3 scripts/quran-db.py selftest
"""

from __future__ import annotations

import argparse
import html
import json
import random
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "quran.db"
HUNSPELL_DICT = ROOT / "data" / "hunspell" / "sv"
CACHE_DIR = ROOT / "node_modules" / ".cache" / "quran-com"
BERNSTROM = 48
API = (
    "https://api.quran.com/api/v4/verses/by_chapter/{chapter}"
    "?translations={translation}&fields=text_uthmani&per_page=300"
)

# ─── Bernström ────────────────────────────────────────────────────────────────


def clean_bernstrom(raw: str) -> str:
    """fetch_verse() i check-quran-quotes.py, minus normalise(): typografin står kvar."""
    text = re.sub(r"<sup[^>]*>.*?</sup>", "", raw, flags=re.S)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return " ".join(text.split())


def fetch_chapter(chapter: int, refresh: bool) -> list[dict]:
    cache = CACHE_DIR / f"translation-{BERNSTROM}" / f"{chapter:03d}.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text("utf8"))["verses"]
    url = API.format(chapter=chapter, translation=BERNSTROM)
    req = urllib.request.Request(url, headers={"User-Agent": "islam.se-quran-db"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = json.load(resp)
            break
        except (urllib.error.URLError, TimeoutError, ValueError):
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    if payload["pagination"]["next_page"] is not None:
        raise RuntimeError(f"sura {chapter}: fler verser än en sida (per_page=300)")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(payload, ensure_ascii=False), "utf8")
    return payload["verses"]


def ensure_column(con: sqlite3.Connection, name: str) -> None:
    cols = {row[1] for row in con.execute("PRAGMA table_info(verses)")}
    if name not in cols:
        con.execute(f"ALTER TABLE verses ADD COLUMN {name} TEXT")


# Kontroll mot kända öppningar — samma två verser som svarssidorna citerar och som
# check-quran-quotes.py:s historia handlar om. Fel här betyder fel översättning eller
# fel städning, och då ska ingenting skrivas.
EXPECTED_OPENINGS = {
    (2, 173): "Vad Han har förbjudit er är kött av självdöda djur",
    (4, 58): "GUD befaller er att till den",
}


def cmd_bernstrom(args: argparse.Namespace) -> int:
    rows: dict[tuple[int, int], tuple[str, str]] = {}
    for chapter in range(1, 115):
        for verse in fetch_chapter(chapter, args.refresh):
            sura, ayah = (int(part) for part in verse["verse_key"].split(":"))
            texts = [t["text"] for t in verse.get("translations", []) if t["resource_id"] == BERNSTROM]
            if len(texts) != 1:
                raise RuntimeError(f"{sura}:{ayah}: {len(texts)} Bernström-texter i svaret")
            rows[(sura, ayah)] = (clean_bernstrom(texts[0]), verse.get("text_uthmani", "").strip())
        print(f"\r  sura {chapter}/114", end="", file=sys.stderr, flush=True)
    print(file=sys.stderr)

    for key, opening in EXPECTED_OPENINGS.items():
        got = rows.get(key, ("", ""))[0]
        if not got.startswith(opening):
            print(f"⛔ {key[0]}:{key[1]} börjar »{got[:60]}«, väntat »{opening}«", file=sys.stderr)
            return 1
    empty = [f"{s}:{a}" for (s, a), (t, _) in rows.items() if not t]
    if empty:
        print(f"⛔ tom Bernström-text för {', '.join(empty[:10])}", file=sys.stderr)
        return 1

    con = sqlite3.connect(DB)
    try:
        ensure_column(con, "text_bernstrom")
        db_keys = {(s, a) for s, a in con.execute("SELECT surah_number, verse_number FROM verses")}
        missing_in_api = sorted(db_keys - rows.keys())
        extra_in_api = sorted(rows.keys() - db_keys)
        changed = arabic_filled = 0
        with con:
            # Skanningen saknar tre verser helt (16:69, 25:30, 26:54 — parsern tappade
            # versnumret). Utan rad kan de varken slås upp eller citeras, och 16:69 är
            # honungsversen. Raden läggs till med tom Wennerström-text: '' betyder »finns
            # inte i skanningen«, och semantisk sökning hoppar över sådana rader.
            for sura, ayah in extra_in_api:
                sibling = con.execute(
                    "SELECT surah_name_arabic, surah_name_swedish, translator FROM verses"
                    " WHERE surah_number = ? LIMIT 1",
                    (sura,),
                ).fetchone()
                if sibling:
                    con.execute(
                        "INSERT OR IGNORE INTO verses (surah_number, surah_name_arabic, surah_name_swedish,"
                        " verse_number, text_swedish, translator) VALUES (?, ?, ?, ?, '', ?)",
                        (sura, sibling[0], sibling[1], ayah, sibling[2]),
                    )
            for (sura, ayah), (text, arabic) in rows.items():
                cur = con.execute(
                    "UPDATE verses SET text_bernstrom = ? WHERE surah_number = ? AND verse_number = ?"
                    " AND text_bernstrom IS NOT ?",
                    (text, sura, ayah, text),
                )
                changed += cur.rowcount
                if arabic:
                    cur = con.execute(
                        "UPDATE verses SET text_arabic = ? WHERE surah_number = ? AND verse_number = ?"
                        " AND (text_arabic IS NULL OR text_arabic = '')",
                        (arabic, sura, ayah),
                    )
                    arabic_filled += cur.rowcount
        total = con.execute("SELECT COUNT(*) FROM verses WHERE text_bernstrom IS NOT NULL").fetchone()[0]
    finally:
        con.close()

    print(f"Bernström: {len(rows)} verser hämtade, {changed} rader ändrade, {total} rader har text_bernstrom.")
    print(f"text_arabic: {arabic_filled} tomma rader fyllda (uthmani).")
    if missing_in_api:
        print(f"⚠️ {len(missing_in_api)} verser i quran.db saknas i API-svaret: {missing_in_api[:10]}")
    if extra_in_api:
        print(
            f"⚠️ {len(extra_in_api)} verser saknades i skanningen och lades till med tom"
            f" text_swedish: {', '.join(f'{s}:{a}' for s, a in extra_in_api)}"
        )
    for key in EXPECTED_OPENINGS:
        print(f"  {key[0]}:{key[1]}  {rows[key][0][:90]}…")
    return 0


# ─── Wennerström ──────────────────────────────────────────────────────────────

# Översättarens källsiglum efter en not: (T), (K), (B), (T,K), (T, B, K), (Ö) — och i
# skanningen ibland »(Ö� )«. Strikt, eftersom versen själv har parenteser: (Koranen).
TAG = re.compile(r"\(\s*[TKBÖ](?:\s*[,/]\s*[TKBÖ])*[\s�]*\)")
# Sidnummer följt av delrubriken (»789 DEL 29«), ibland med ett enda blanktecken före.
PAGE_DEL = re.compile(r"\s+\d{1,3}\s+DEL\s+\d{1,2}(?=\s|$)")
BIDI = re.compile(r"[​-‏‪-‮⁠-⁩﻿]")
TOKEN = re.compile(r"(\s*)(\S+)")

LEAD = "([{”“»«\"'‘’"
TRAIL = ".,;:!?)]}”“»«\"'’…"
# Tecken som kan avsluta versen omedelbart före en not.
END_PUNCT = set('.,;:!?”"»’)]…')
SENTENCE_END = set(".!;:")
COMPLETE_END = set(".!?…")
# Transkriberade arabiska artiklar som avstavas vid radslut: »az- zakāt« → »az-zakāt«.
ARTICLES = {"al", "an", "ar", "as", "at", "ad", "az", "ash", "adh", "ath", "aḍ", "aṭ", "aẓ", "aš", "ad̂", "ul"}

# En not inleds med en upprepning av versfrasen den förklarar. Består upprepningen bara
# av sådana här ord är den inte en frasupprepning utan löptext (»… den Hörande, den
# Vetande«).
STOPWORDS = {
    "den", "det", "de", "och", "en", "ett", "som", "är", "han", "hon", "att", "i", "på",
    "till", "för", "med", "av", "om", "men", "så", "när", "då", "eller", "inte", "ni", "vi",
    "dem", "dessa", "denna", "detta", "all", "alla", "allt", "utom", "över", "under", "från",
    "efter", "före", "hos", "vid", "mot", "sin", "sina", "sitt", "deras", "hans", "hennes",
    "er", "era", "ert", "din", "dina", "ditt", "min", "mina", "mitt", "skall", "har", "var",
    "ja", "nej",
}
# Versaliserade ord som står mitt i versens mening (gudsnamn och gudspronomen). Följer ett
# sådant på en upprepad fras är det versen som fortsätter, inte en not som börjar.
DIVINE = {
    "herre", "herren", "herres", "han", "hans", "honom", "allah", "allahs", "gud", "guds",
    "sin", "sina", "sitt", "mig", "min", "mina", "mitt", "jag", "du", "dig", "din", "dina",
    "ditt", "vi", "oss", "vår", "våra", "vårt",
}


def norm(text: str) -> str:
    return re.sub(r"[\W_]", "", text.lower())


# hunspell godtar en del tvåbokstavsord som i den här texten bara förekommer som fragment
# av ett delat ord (»an förtrotts«, »Al lah«, »ho nom«). Räknades de som ord skulle
# regeln »fragmenten är inte båda ord« lämna dem delade. Enstaka bokstäver är ord bara
# om de är i, å, ö.
BOGUS_SHORT = {
    "an", "ar", "as", "al", "mu", "ho", "va", "te", "ko", "di", "et", "so", "hu", "hå",
    "tu", "ad", "hy", "si", "bu", "mö", "mo", "bä",
}
SINGLE_LETTER_WORDS = {"i", "å", "ö"}


def core(token: str) -> str:
    return token.lstrip(LEAD).rstrip(TRAIL)


def first_letter(token: str) -> str:
    return next((ch for ch in token if ch.isalpha()), "")


def strip_layout(stream: str) -> list[str]:
    """Blanktecken bort, sidnummer bort. Ett fristående tal med minst två blanksteg före
    (eller sist) är ett sidnummer eller ett marginalversnummer, aldrig verstext —
    översättningen skriver tal med bokstäver, och noternas hänvisningar har kolon (3:182)."""
    stream = PAGE_DEL.sub("   ", BIDI.sub("", stream))
    parts = [(len(m.group(1)), m.group(2)) for m in TOKEN.finditer(stream)]
    out = []
    for i, (gap, tok) in enumerate(parts):
        if re.fullmatch(r"\d{1,3}", tok) and (gap >= 2 or i == len(parts) - 1):
            continue
        out.append(tok)
    return out


def find_gloss_start(words: list[str], start: int = 1) -> int | None:
    """Index för den första noten, eller None.

    En not är [skiljetecken] FRAS Versal… där FRAS (1–8 ord, minst fem bokstäver) står
    tidigare i versen på ordgräns. Jämförelsen görs utan blanktecken, så att »fast
    ställda« i versen och »fastställda« i noten är samma fras.
    """
    for g in range(max(start, 1), len(words)):
        if words[g - 1][-1] not in END_PUNCT:
            continue
        parts = [norm(w) for w in words[:g]]
        verse = "".join(parts)
        starts: set[int] = set()
        ends: set[int] = set()
        offset = 0
        for part in parts:
            if part:
                starts.add(offset)
                offset += len(part)
                ends.add(offset)
        for k in range(1, 9):
            if g + k > len(words):
                break
            lemma = words[g : g + k]
            if any(w[-1] in SENTENCE_END for w in lemma):
                break
            j = g + k
            transliterated = False
            if j < len(words) and words[j].startswith("("):
                if TAG.fullmatch(words[j]):
                    continue
                while j < len(words) and not words[j].endswith(")"):
                    j += 1
                j += 1
                transliterated = True
            if j >= len(words):
                continue
            nxt = words[j]
            letter = first_letter(nxt)
            if not letter or not letter.isupper():
                continue
            # »den Hörande (as-Samīʿ) Du hör vår bön«: efter en translittererad gudsnamnsglosa
            # får noten börja med ett gudspronomen. Utan parentesen är det versen som fortsätter.
            joined = norm(nxt + (words[j + 1] if j + 1 < len(words) else ""))
            if not transliterated and (norm(nxt) in DIVINE or joined in DIVINE):
                continue
            phrase = norm("".join(lemma))
            if len(phrase) < 5 or all(norm(w) in STOPWORDS for w in lemma):
                continue
            i = verse.find(phrase)
            while i != -1:
                if i in starts and i + len(phrase) in ends:
                    return g
                i = verse.find(phrase, i + 1)
    return None


def ends_complete(words: list[str]) -> bool:
    if not words:
        return True
    last = words[-1]
    if TAG.search(last):
        return True
    stripped = last.rstrip("”\"»’)]")
    return bool(stripped) and stripped[-1] in COMPLETE_END


class Speller:
    """hunspell -l i satser, med cache. Ett ord är »känt« om hunspell godtar det."""

    def __init__(self) -> None:
        self.known: dict[str, bool] = {}

    def check(self, words: set[str]) -> None:
        todo = sorted(w for w in words if w and w not in self.known)
        if not todo:
            return
        proc = subprocess.run(
            ["hunspell", "-d", str(HUNSPELL_DICT), "-i", "utf-8", "-l"],
            input="\n".join(todo) + "\n",
            capture_output=True,
            text=True,
            check=True,
        )
        bad = set(proc.stdout.split("\n"))
        for w in todo:
            self.known[w] = w not in bad

    def __call__(self, word: str) -> bool:
        return self.known.get(word, False)


def join_candidates(left: str, right: str) -> tuple[str, str] | None:
    """(den hopskarvade token, dess kärna att slå upp), eller None om paret inte kan vara ett delat ord."""
    # Andra halvan av ett delat ord börjar alltid med gemen (»Mu hammed«, »an förtrotts«).
    if not left or not right or not (right[0].isalpha() and right[0].islower()):
        return None
    if re.fullmatch(r"[\d\W]+", right):
        return None
    if left.endswith("-") and len(left) > 2 and left[-2].isalpha() and right[0].islower():
        base = left[:-1]
        return base + right, core(base + right)
    if left[-1] in TRAIL or left[-1] == "-" or not left[-1].isalpha():
        return None
    return left + right, core(left + right)


def rejoin(words: list[str], is_word, is_joinable) -> tuple[list[str], int]:
    """Skarva delade ord. Returnerar (ord, antal skarvar)."""
    out: list[str] = []
    joins = 0
    fresh = False  # out[-1] skarvades i detta varv: kärnan är inte uppslagen än
    for i, tok in enumerate(words):
        if out and not fresh:
            left = out[-1]
            cand = join_candidates(left, tok)
            if cand is not None:
                joined, joined_core = cand
                if left.endswith("-"):
                    if is_joinable(joined_core):
                        out[-1] = joined
                        joins += 1
                        fresh = True
                        continue
                    if core(left[:-1]).lower() in ARTICLES:
                        out[-1] = left + tok
                        joins += 1
                        fresh = True
                        continue
                elif is_joinable(joined_core) and not (is_word(core(left)) and is_word(core(tok))):
                    # »ni an förtrotts«: »an« hör till ordet efter, inte till »ni« (»nian«).
                    # Är vänster led ett ord och kan höger led bilda ett ord framåt, vänta.
                    ahead = join_candidates(tok, words[i + 1]) if i + 1 < len(words) else None
                    if not (is_word(core(left)) and ahead and is_joinable(ahead[1])):
                        out[-1] = joined
                        joins += 1
                        fresh = True
                        continue
        out.append(tok)
        fresh = False
    return out, joins


def split_verse(text: str, commentary: str) -> tuple[list[str], list[str], str]:
    """(versord, notord, fall). Fallet säger vilken regel som avgjorde."""
    t_words = strip_layout(text)
    c_words = strip_layout(commentary) if commentary and commentary.strip() else []
    c_has_tag = any(TAG.search(w) for w in c_words) or bool(TAG.search(commentary or ""))

    if not c_words:
        g = find_gloss_start(t_words)
        if g is None:
            return t_words, [], "no-gloss" if not TAG.search(text) else "unlocated"
        return t_words[:g], t_words[g:], "moved"

    if not c_has_tag or not ends_complete(t_words):
        # Kommentaren börjar med versens fortsättning (utan siglum är den ingenting annat;
        # efter en ofullständig mening är i alla fall början av den verstext).
        stream = t_words + c_words
        g = find_gloss_start(stream)
        if g is not None:
            return stream[:g], stream[g:], "merged+moved" if g > len(t_words) else "moved"
        if not c_has_tag:
            return stream, [], "merged"
        return t_words, c_words, "unlocated"

    g = find_gloss_start(t_words)
    if g is None:
        return t_words, c_words, "kept" if not TAG.search(text) else "unlocated"
    return t_words[:g], t_words[g:] + c_words, "moved"


def load_rows(con: sqlite3.Connection, raw: bool) -> list[tuple[int, int, int, str, str]]:
    cols = {row[1] for row in con.execute("PRAGMA table_info(verses)")}
    if raw and "text_swedish_raw" in cols:
        sql = (
            "SELECT id, surah_number, verse_number, COALESCE(text_swedish_raw, text_swedish),"
            " CASE WHEN text_swedish_raw IS NULL THEN COALESCE(commentary, '') ELSE COALESCE(commentary_raw, '') END"
            " FROM verses ORDER BY surah_number, verse_number"
        )
    else:
        sql = (
            "SELECT id, surah_number, verse_number, text_swedish, COALESCE(commentary, '')"
            " FROM verses ORDER BY surah_number, verse_number"
        )
    return con.execute(sql).fetchall()


def measure(rows) -> dict[str, int]:
    return {
        "verser": len(rows),
        "text_swedish med 3+ blanksteg mellan ord": sum(1 for r in rows if re.search(r"\S {3,}\S", r[3])),
        "text_swedish med källsiglum (not i versen)": sum(1 for r in rows if TAG.search(r[3])),
        "text_swedish med sidnummer/DEL": sum(
            1 for r in rows if PAGE_DEL.search(r[3]) or re.search(r"\s{2,}\d{1,3}(?:\s|$)", r[3])
        ),
        "commentary ifylld": sum(1 for r in rows if r[4] and r[4].strip()),
        "commentary ifylld utan siglum": sum(1 for r in rows if r[4] and r[4].strip() and not TAG.search(r[4])),
    }


def clean_all(rows) -> tuple[list[tuple[int, str, str | None]], Counter, list]:
    speller = Speller()
    vocab = Counter()
    split = []
    for vid, sura, ayah, text, comm in rows:
        verse_words, gloss_words, case = split_verse(text, comm)
        split.append((vid, sura, ayah, verse_words, gloss_words, case))
        for w in strip_layout(text) + strip_layout(comm or ""):
            vocab[core(w)] += 1

    def known_forms(tokens: list[str]) -> set[str]:
        forms = {core(t) for t in tokens}
        for a, b in zip(tokens, tokens[1:]):
            cand = join_candidates(a, b)
            if cand:
                forms.add(cand[1])
        return forms

    def is_word(w: str) -> bool:
        if len(w) == 1:
            return w.lower() in SINGLE_LETTER_WORDS
        if len(w) == 2 and w.lower() in BOGUS_SHORT:
            return False
        return speller(w)

    def is_joinable(w: str) -> bool:
        return speller(w) or vocab[w] >= 2

    stats = Counter()
    # Två varv räcker för ord i tre delar (»Vidmakt hål laren«).
    for _ in range(3):
        forms: set[str] = set()
        for _vid, _s, _a, vw, gw, _case in split:
            forms |= known_forms(vw) | known_forms(gw)
        speller.check(forms)
        changed = False
        new_split = []
        for vid, sura, ayah, vw, gw, case in split:
            vw2, j1 = rejoin(vw, is_word, is_joinable)
            gw2, j2 = rejoin(gw, is_word, is_joinable)
            if j1 or j2:
                changed = True
                stats["skarvade ord i versen"] += j1
                stats["skarvade ord i noterna"] += j2
            new_split.append((vid, sura, ayah, vw2, gw2, case))
        split = new_split
        if not changed:
            break

    out = []
    detail = []
    for vid, sura, ayah, vw, gw, case in split:
        if case == "unlocated" and not any(TAG.search(w) for w in vw):
            case = "kept"
        stats[f"fall: {case}"] += 1
        verse = " ".join(vw)
        gloss = " ".join(gw) or None
        out.append((vid, verse, gloss))
        detail.append((sura, ayah, verse, gloss, case))
    return out, stats, detail


def cmd_clean(args: argparse.Namespace) -> int:
    con = sqlite3.connect(DB)
    try:
        before_rows = load_rows(con, raw=True)
        cleaned, stats, detail = clean_all(before_rows)
        after_rows = [
            (vid, s, a, verse, gloss or "")
            for (vid, verse, gloss), (s, a, *_rest) in zip(cleaned, detail)
        ]
        before, after = measure(before_rows), measure(after_rows)
        print(f"{'':48} {'före':>7} {'efter':>7}")
        for key in before:
            print(f"{key:48} {before[key]:>7} {after[key]:>7}")
        print()
        for key, value in sorted(stats.items()):
            print(f"{key:48} {value:>7}")
        verse_joined_words = sum(
            1 for (_v, _s, _a, t, _c), (_v2, verse, _g) in zip(before_rows, cleaned) if verse != t
        )
        print(f"{'verser vars text_swedish ändrades':48} {verse_joined_words:>7}")

        if args.sample:
            rng = random.Random(args.seed)
            for i in rng.sample(range(len(detail)), args.sample):
                sura, ayah, verse, gloss, case = detail[i]
                raw_t, raw_c = before_rows[i][3], before_rows[i][4]
                print(f"\n── {sura}:{ayah} [{case}]")
                print(f"  FÖRE  text: {' '.join(raw_t.split())}")
                if raw_c.strip():
                    print(f"  FÖRE  comm: {' '.join(raw_c.split())}")
                print(f"  EFTER text: {verse}")
                if gloss:
                    print(f"  EFTER comm: {gloss}")

        if args.dry_run:
            print("\n(--dry-run: ingenting skrivet)")
            return 0

        ensure_column(con, "text_swedish_raw")
        ensure_column(con, "commentary_raw")
        with con:
            con.execute(
                "UPDATE verses SET text_swedish_raw = text_swedish, commentary_raw = commentary"
                " WHERE text_swedish_raw IS NULL"
            )
            written = 0
            for vid, verse, gloss in cleaned:
                cur = con.execute(
                    "UPDATE verses SET text_swedish = ?, commentary = ? WHERE id = ?"
                    " AND (text_swedish IS NOT ? OR commentary IS NOT ?)",
                    (verse, gloss, vid, verse, gloss),
                )
                written += cur.rowcount
        print(f"\n{written} rader skrivna. Bygg om inbäddningarna: pnpm cli clean-quran")
    finally:
        con.close()
    return 0


# Fall ur skanningen som städningen måste klara — och de den INTE får röra. Varje fall
# är en verklig vers (förkortad), och kommentaren säger vad som gick fel utan regeln.
SELF_TEST = [
    # (text_swedish, commentary, väntad text_swedish, väntad commentary)
    (
        # 4:58: noten inleds med versfrasen den förklarar; »an förtrotts« är delat vid radslut.
        "Allah befaller er att återlämna allt ni an       förtrotts till dess ägare. Allah är"
        " evigt hörande, seende. allt ni anförtrotts Omfattar alla förtroenden. (T,K)",
        "",
        "Allah befaller er att återlämna allt ni anförtrotts till dess ägare. Allah är evigt hörande, seende.",
        "allt ni anförtrotts Omfattar alla förtroenden. (T,K)",
    ),
    (
        # »den Hörande, den Vetande« är versens egen upprepning, ingen not. Utan stoppordsregeln
        # klipptes 30-talet verser mitt i gudsnamnen.
        "Han är sannerligen den Hörande,   den Vetande.",
        "",
        "Han är sannerligen den Hörande, den Vetande.",
        None,
    ),
    (
        # 47:7: parsern delade versen vid en rad som började med »Allah«. Utan siglum är
        # kommentaren versens fortsättning.
        "Ni som har antagit tron! Om ni hjälper        ",
        "Allah skall Han hjälpa er och göra er stadiga på foten.    ",
        "Ni som har antagit tron! Om ni hjälper Allah skall Han hjälpa er och göra er stadiga på foten.",
        None,
    ),
    (
        # Sidnummer och delrubrik i slutet av en vers (2:141 »… göra.    30 DEL 2«).
        "Och ni skall inte tillfrågas om vad de brukade göra.    30 DEL 2",
        "",
        "Och ni skall inte tillfrågas om vad de brukade göra.",
        None,
    ),
    (
        # 22:10: en not UTAN frasinledning efter en fullständig mening ska stå kvar i
        # kommentaren — den får inte föras in i versen.
        "Så sker på grund av vad dina egna händer har uträttat.",
        "Allah låter inte någon oskyldig bära bördan av någon annans synd. egna händer Se 3:182. (Ö)",
        "Så sker på grund av vad dina egna händer har uträttat.",
        "Allah låter inte någon oskyldig bära bördan av någon annans synd. egna händer Se 3:182. (Ö)",
    ),
]


def cmd_selftest(_args: argparse.Namespace) -> int:
    rows = [(i, 0, i, t, c) for i, (t, c, _et, _ec) in enumerate(SELF_TEST)]
    cleaned, _stats, _detail = clean_all(rows)
    failed = 0
    for (_vid, verse, gloss), (_t, _c, want_t, want_c) in zip(cleaned, SELF_TEST):
        if verse != want_t or gloss != want_c:
            failed += 1
            print(f"✗ väntat  {want_t!r} | {want_c!r}\n  fick    {verse!r} | {gloss!r}")
    print(f"{len(SELF_TEST) - failed}/{len(SELF_TEST)} fall rätt")
    return 1 if failed else 0


def cmd_stats(_args: argparse.Namespace) -> int:
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        rows = load_rows(con, raw=False)
        for key, value in measure(rows).items():
            print(f"{key:48} {value:>7}")
        cols = {row[1] for row in con.execute("PRAGMA table_info(verses)")}
        if "text_bernstrom" in cols:
            n = con.execute("SELECT COUNT(*) FROM verses WHERE text_bernstrom IS NOT NULL").fetchone()[0]
            print(f"{'text_bernstrom ifylld':48} {n:>7}")
        n = con.execute("SELECT COUNT(*) FROM verses WHERE text_arabic IS NOT NULL AND text_arabic != ''").fetchone()[0]
        print(f"{'text_arabic ifylld':48} {n:>7}")
    finally:
        con.close()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("bernstrom", help="hämta Knut Bernström till text_bernstrom")
    b.add_argument("--refresh", action="store_true", help="hämta om i stället för att läsa cachen")
    b.set_defaults(func=cmd_bernstrom)
    c = sub.add_parser("clean", help="städa Wennerströms text_swedish/commentary")
    c.add_argument("--dry-run", action="store_true")
    c.add_argument("--sample", type=int, default=0, help="visa N slumpade verser före/efter")
    c.add_argument("--seed", type=int, default=2026)
    c.set_defaults(func=cmd_clean)
    s = sub.add_parser("stats", help="mät utan att skriva")
    s.set_defaults(func=cmd_stats)
    t = sub.add_parser("selftest", help="kör städningen på kända fall ur skanningen")
    t.set_defaults(func=cmd_selftest)
    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
