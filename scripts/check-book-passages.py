#!/usr/bin/env python3
"""Collate every `bookPassages` entry in a fördjupning run against data/books.db.

No gate touches these. `getQuote()` only checks quotes.db, so the Arabic passage ids in
research.json are verified by nothing — this script is the only thing that answers
"did the fiqh citations come from the corpus or from the model's memory?".

books.db is OCR of printed editions: `~~` at line starts, page markers (PageV09P076),
manuscript markers (ms4120), missing hamza mid-sentence. A naive substring comparison
fails everything, so compare the normalised consonant skeleton only. A scan's own
misspelling surviving into the quotation is evidence of authenticity, not of error.

⚠️ This script must never be rewritten as a bash heredoc: literal Arabic in a heredoc is
bidi-reordered, which silently breaks the character classes below and makes every
comparison `"" in ""` — a green result that compared nothing.

Usage:
    python3 scripts/check-book-passages.py data/fordjupning-output/<slug>/research.json
    python3 scripts/check-book-passages.py --self-test
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

DB = Path("data/books.db")

# Built from codepoints, never from literal ranges typed inline, so that a bidi
# reordering of this file cannot silently change what the class matches.
#
# ⚠️ LETTERS only — not the whole 0600–06FF block. Arabic punctuation (`،` U+060C,
# `؛` U+061B, `؟` U+061F) and Arabic-Indic digits (0660–0669) live inside that block,
# so a naive range test keeps them; the scans drop or move them, and every passage
# containing a comma then reports a false mismatch.
LETTER_RANGES = ((0x0621, 0x064A), (0x0671, 0x06D3))
DIACRITICS = {chr(c) for c in range(0x064B, 0x0653)} | {chr(0x0640), chr(0x0670)}
FOLD = {
    "أ": "ا",  # alef hamza above -> alef
    "إ": "ا",  # alef hamza below -> alef
    "آ": "ا",  # alef madda      -> alef
    "ى": "ي",  # alef maqsura    -> ya
    "ی": "ي",  # farsi ya        -> ya
    "ة": "ه",  # ta marbuta      -> ha
    "ؤ": "و",  # waw hamza       -> waw
    "ئ": "ي",  # ya hamza        -> ya
    "ء": "",        # bare hamza dropped: the scans lose it mid-word
}


def normalise(text: str) -> str:
    """Reduce Arabic text to its bare consonant skeleton."""
    out = []
    for ch in text:
        if ch in DIACRITICS:
            continue
        ch = FOLD.get(ch, ch)
        if ch and any(lo <= ord(ch) <= hi for lo, hi in LETTER_RANGES):
            out.append(ch)
    return "".join(out)


def strip_ocr_junk(text: str) -> str:
    """Remove the scan apparatus that appears mid-sentence in books.db."""
    text = re.sub(r"Page[VP0-9]+", " ", text)
    text = re.sub(r"\bms\d+\b", " ", text)
    text = text.replace("~~", " ")
    return text


def strip_editorial(text: str) -> str:
    """Drop the printed edition's own bracketed insertions.

    ⚠️ Editors of the classical texts add words in square brackets — `[بهم]`,
    `[محمد بن إسحاق]` — and a scholarly quotation legitimately omits them. The Latin
    footnote markers `(4)` vanish in normalise() because digits are not letters, but the
    ARABIC letters inside the brackets survive and break the comparison. This cost a
    false 'AVVIKER 0/81' on a quotation that was verbatim.
    """
    return re.sub(r"\[[^\]]*\]", " ", text)


def segments(text: str) -> list[str]:
    """Split a quotation on its ellipsis marks.

    ⚠️ The research stage abridges: it quotes a passage's opening, marks the omission
    with `…`, then resumes further down. normalise() strips the `…` along with all other
    punctuation, so a flat substring test demands contiguity the quotation never claimed
    and fails every abridged citation. On griskott that was 3 of 13 — all of them sound.
    Verify each segment separately, and in order.
    """
    parts = re.split(r"[…]|\.{3}", text)
    return [s for s in (p.strip() for p in parts) if s]


def contains_in_order(haystack: str, needles: list[str]) -> bool:
    """Every needle present, each starting after the previous one ended."""
    at = 0
    for n in needles:
        i = haystack.find(n, at)
        if i < 0:
            return False
        at = i + len(n)
    return True


def load_passage(cur: sqlite3.Cursor, pid: str) -> tuple[str, str, str] | None:
    """Return (text, book_author, book_title) for a `passage-NNN` id."""
    m = re.search(r"(\d+)", pid)
    if not m:
        return None
    cur.execute(
        "select p.text, b.author, b.title from passages p "
        "join books b on b.id = p.book_id where p.id = ?",
        (int(m.group(1)),),
    )
    return cur.fetchone()


def check(research_path: Path) -> int:
    data = json.loads(research_path.read_text(encoding="utf-8"))
    passages = data.get("bookPassages") or []
    if not passages:
        print("⚠️  research.json har INGA bookPassages — inget att kontrollera.")
        print("   Det är i sig ett fynd: de arabiska citaten i artikeln är då obelagda.")
        return 1

    con = sqlite3.connect(DB)
    cur = con.cursor()

    ok = miss = bad = 0
    for p in passages:
        pid = str(p.get("id", ""))
        raw = strip_ocr_junk(p.get("text", ""))
        parts = [normalise(s) for s in segments(raw)]
        parts = [s for s in parts if s]
        total = sum(len(s) for s in parts)

        # The guard that would have caught the two false 13/13 passes on griskott.
        if total < 20:
            print(f"❌ ABORT: normaliseringen gav {total} tecken för {pid}.")
            print("   Kontrollen är trasig — jämför inte, rätta skriptet.")
            return 2

        row = load_passage(cur, pid)
        if row is None:
            print(f"❌ {pid}: FINNS INTE i books.db  ({p.get('bookTitle')})")
            miss += 1
            continue

        # Two readings of the source: as printed, and with the editor's bracketed
        # insertions removed. A quotation may legitimately skip the latter, so accept
        # a match against either — but never relax further than that.
        printed = strip_ocr_junk(row[0])
        haystacks = [normalise(printed), normalise(strip_editorial(printed))]
        haystack = haystacks[0]
        elided = f" ({len(parts)} delar, förkortat)" if len(parts) > 1 else ""
        if any(contains_in_order(h, parts) for h in haystacks):
            print(f"✅ {pid}: ordagrant{elided}  — {row[1]} / {row[2]}")
            ok += 1
        else:
            print(f"❌ {pid}: AVVIKER{elided}  — {row[1]} / {row[2]}")
            for i, s in enumerate(parts, 1):
                n = next((k for k in range(len(s), 19, -1) if s[:k] in haystack), 0)
                verdict = "hela" if s in haystack else f"{n}/{len(s)} tecken"
                print(f"   del {i}: {verdict}")
            bad += 1

        # The attribution trap: the author column is the BOOK's author, never the speaker.
        # Skip when books.db stores the name in Arabic script — comparing that with a
        # Latin transliteration is meaningless and buries the real warnings in noise.
        stated = (p.get("author") or "").strip()
        if stated and row[1] and _is_latin(row[1]) and not _same_person(stated, row[1]):
            print(f"   ⚠️ attribution: research säger {stated!r}, books.db säger {row[1]!r}")

    con.close()
    print(f"\n{ok} ordagranta, {bad} avvikande, {miss} saknade — av {len(passages)}.")
    if bad or miss:
        print("⛔ Kontrollera varje avvikelse för hand innan sidan skickas.")
    print("⚠️ Kontrollen bevisar att citatet FINNS, aldrig att läsningen stämmer.")
    return 1 if (bad or miss) else 0


def _is_latin(s: str) -> bool:
    return any("a" <= c.lower() <= "z" for c in s)


def _same_person(a: str, b: str) -> bool:
    """Loose match — the two spellings are transliterations of the same name."""
    strip = lambda s: re.sub(r"[^a-z]", "", s.lower().replace("al-", ""))
    x, y = strip(a), strip(b)
    return bool(x and y and (x in y or y in x))


def self_test() -> int:
    """Prove the normaliser can fail. A check that cannot fail is not a check."""
    real = "والخنزير أشد تحريما من الميتة"
    if len(normalise(real)) < 20:
        print("❌ normaliseringen tappar nästan allt — teckenklasserna är trasiga")
        return 2

    cases = [
        ("identisk", real, real, True),
        ("diakriter borttagna", "وَالْخِنْزِيرُ أَشَدُّ", "والخنزير أشد", True),
        ("alef-varianter", "إبراهيم", "ابراهيم", True),
        ("ta marbuta", "الميتة", "الميته", True),
        ("sidmarkör mitt i", "الميتة PageV09P076 وهذا", "الميتة وهذا", True),
        ("helt annan text", "الصلاة والزكاة", "والخنزير أشد تحريما", False),
        ("omskrivet ordval", "الخنزير محرم قطعا", "والخنزير أشد تحريما", False),
    ]
    failed = 0
    for name, a, b, expect in cases:
        got = normalise(strip_ocr_junk(a)) in normalise(strip_ocr_junk(b)) or normalise(
            strip_ocr_junk(b)
        ) in normalise(strip_ocr_junk(a))
        mark = "✅" if got == expect else "❌"
        if got != expect:
            failed += 1
        print(f"{mark} {name}: väntade {expect}, fick {got}")

    # Elision. Splitting on `…` must not turn the check into a rubber stamp: the parts
    # still have to appear, and in the order the quotation claims.
    source = "الصلاة عماد الدين ومن تركها فقد كفر والزكاة قرينة الصلاة في كتاب الله"
    elision = [
        ("förkortat citat, rätt ordning", "الصلاة عماد الدين … والزكاة قرينة الصلاة", True),
        ("förkortat, OMVÄND ordning", "والزكاة قرينة الصلاة … الصلاة عماد الدين", False),
        ("förkortat med påhittad del", "الصلاة عماد الدين … وصوم رجب واجب", False),
        ("tre delar i ordning", "الصلاة عماد … فقد كفر … في كتاب الله", True),
    ]
    hay = normalise(source)
    for name, q, expect in elision:
        got = contains_in_order(hay, [normalise(s) for s in segments(q)])
        mark = "✅" if got == expect else "❌"
        if got != expect:
            failed += 1
        print(f"{mark} {name}: väntade {expect}, fick {got}")

    # Editorial brackets: a quotation may skip the editor's insertion, but the
    # relaxation must not swallow invented words.
    printed = "\u062d\u062a\u0649 \u0625\u0630\u0627 \u0627\u0646\u062a\u0647\u0649 \u0627\u0644\u0647\u062f\u0645 [\u0628\u0647\u0645] \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0627\u0633"
    brackets = [
        ("hoppar över redaktörens klammer", "\u062d\u062a\u0649 \u0625\u0630\u0627 \u0627\u0646\u062a\u0647\u0649 \u0627\u0644\u0647\u062f\u0645 \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0627\u0633", True),
        ("behåller klammerns ord", "\u062d\u062a\u0649 \u0625\u0630\u0627 \u0627\u0646\u062a\u0647\u0649 \u0627\u0644\u0647\u062f\u0645 \u0628\u0647\u0645 \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0627\u0633", True),
        ("smugglar in eget ord", "\u062d\u062a\u0649 \u0625\u0630\u0627 \u0627\u0646\u062a\u0647\u0649 \u0627\u0644\u0647\u062f\u0645 \u0633\u0631\u064a\u0639\u0627 \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0627\u0633", False),
    ]
    hs = [normalise(strip_ocr_junk(printed)), normalise(strip_editorial(strip_ocr_junk(printed)))]
    for name, q, expect in brackets:
        got = any(contains_in_order(h, [normalise(s) for s in segments(q)]) for h in hs)
        mark = "\u2705" if got == expect else "\u274c"
        if got != expect:
            failed += 1
        print(f"{mark} {name}: v\u00e4ntade {expect}, fick {got}")

    print("\n" + ("alla fall passerade" if not failed else f"{failed} FALL FÖLL"))
    return 1 if failed else 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(check(Path(sys.argv[1])))
