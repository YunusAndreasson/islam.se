#!/usr/bin/env python3
"""Ge de importerade arabiska verken läsbara titlar, och lös namnkrockarna.

OpenITI-importen härleder titeln ur URI-segmentet, så `0256Bukhari.Sahih` och
`0261Muslim.Sahih` blir båda »Sahih«, och de fyra Sunan-samlingarna blir alla
»Sunan«. Hämtningen fungerar ändå — passager bär `book_id` — men en källhänvisning
som renderas »Sahih« är oanvändbar för en läsare, och det är för att kunna citera
hadith till en namngiven samling som verken importerades.

Författarfältet är dessutom blandat: några poster står med arabisk skrift
(البخاري, النووي), de flesta translittererade. Här normaliseras båda.

⚠️ Idempotent och säker att köra om: matchar på (titel, författare) och hoppar över
det som redan är rättat. Kör den igen när importen är klar, så fångas de verk som
inte hade landat vid första körningen.

    python3 scripts/fix-book-titles.py            # visa vad som skulle ändras
    python3 scripts/fix-book-titles.py --apply    # skriv
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "books.db"

# (nuvarande titel, delsträng ur författarfältet) → (riktig titel, normaliserad författare)
# Författarnamnet skrivs som husstilen skriver det i brödtext.
RENAMES: dict[tuple[str, str], tuple[str, str]] = {
    ("Sahih", "بخاري"): ("Sahih al-Bukhari", "al-Bukhari"),
    ("Sahih", "Bukhari"): ("Sahih al-Bukhari", "al-Bukhari"),
    ("Sahih", "Muslim"): ("Sahih Muslim", "Muslim ibn al-Hajjaj"),
    ("Sunan", "IbnMaja"): ("Sunan Ibn Maja", "Ibn Maja"),
    ("Sunan", "AbuDawud"): ("Sunan Abi Dawud", "Abu Dawud al-Sijistani"),
    ("Sunan", "Nasai"): ("Sunan al-Nasai", "al-Nasai"),
    ("Sunan", "Tirmidhi"): ("Sunan al-Tirmidhi", "al-Tirmidhi"),
    ("SunanSughra", "Nasai"): ("Sunan al-Nasai", "al-Nasai"),
    ("Muwatta", "Malik"): ("al-Muwatta", "Malik ibn Anas"),
    ("Mughni", "IbnQudama"): ("al-Mughni", "Ibn Qudama"),
    ("Majmuc", "نووي"): ("al-Majmu sharh al-Muhadhdhab", "al-Nawawi"),
    ("Majmuc", "Nawawi"): ("al-Majmu sharh al-Muhadhdhab", "al-Nawawi"),
    ("HidayaFiSharhBidaya", "Marghinani"): ("al-Hidaya fi sharh al-Bidaya", "al-Marghinani"),
    ("BidayatMujtahid", "IbnRushd"): ("Bidayat al-mujtahid", "Ibn Rushd"),
    ("TafsirQuran", "IbnKathir"): ("Tafsir al-Quran al-azim", "Ibn Kathir"),
    ("JamicLiAhkamQuran", "Qurtubi"): ("al-Jami li-ahkam al-Quran", "al-Qurtubi"),
    ("SiraNabawiyya", "IbnHisham"): ("al-Sira al-nabawiyya", "Ibn Hisham"),
    ("AkhbarMakka", "Azraqi"): ("Akhbar Makka", "al-Azraqi"),
    ("Umm", "Shafic"): ("al-Umm", "al-Shafii"),
    ("Bidaya", "IbnKathir"): ("al-Bidaya wa-l-nihaya", "Ibn Kathir"),
    ("Rihla", "IbnFadlan"): ("Risalat Ibn Fadlan", "Ibn Fadlan"),
    ("Rihla", "IbnJubayr"): ("Rihlat Ibn Jubayr", "Ibn Jubayr"),
    # ⚠️ Författarfältet kommer ibland på arabiska ur OpenITI-metadatan, ibland
    # translittererat. Båda formerna måste stå här, annars hoppas verket tyst över.
    ("TuhfatMawdud", "IbnQayyim"): ("Tuhfat al-mawdud bi-ahkam al-mawlud", "Ibn al-Qayyim"),
    ("TuhfatMawdud", "القيم"): ("Tuhfat al-mawdud bi-ahkam al-mawlud", "Ibn al-Qayyim"),
    ("ZadMacad", "IbnQayyim"): ("Zad al-maad", "Ibn al-Qayyim"),
    ("ZadMacad", "القيم"): ("Zad al-maad", "Ibn al-Qayyim"),
    ("Tarikh", "IbnKhaldun"): ("Tarikh Ibn Khaldun", "Ibn Khaldun"),
    ("SharhCaqidaTahawiyya", "IbnAbiCizz"): ("Sharh al-Aqida al-Tahawiyya", "Ibn Abi al-Izz"),
    ("JamicCulumWaHikam", "IbnRajab"): ("Jami al-ulum wa-l-hikam", "Ibn Rajab al-Hanbali"),
    ("SiyarAclamNubala", "Dhahabi"): ("Siyar alam al-nubala", "al-Dhahabi"),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="skriv ändringarna (annars bara visa)")
    args = ap.parse_args()

    con = sqlite3.connect(DB)
    rows = con.execute("SELECT id, title, COALESCE(author,'') FROM books").fetchall()

    planned: list[tuple[int, str, str, str, str]] = []
    for bid, title, author in rows:
        for (t, a), (new_title, new_author) in RENAMES.items():
            if title == t and a.lower() in author.lower():
                planned.append((bid, title, new_title, author, new_author))
                break

    if not planned:
        print("Inget att rätta — alla verk har redan riktiga titlar.")
        return 0

    for bid, old_t, new_t, old_a, new_a in planned:
        print(f"  {bid:>4}  {old_t:<24} → {new_t}")
        print(f"        {old_a:<24} → {new_a}")

    # Kvarvarande krockar efter bytet — den enda kontroll som betyder något här.
    after = [r[1] for r in rows]
    for bid, old_t, new_t, _oa, _na in planned:
        after[[r[0] for r in rows].index(bid)] = new_t
    dupes = {t for t in after if after.count(t) > 1}
    print(f"\n{len(planned)} verk rättas. Kvarvarande titelkrockar: {sorted(dupes) or 'inga'}")

    if not args.apply:
        print("\n(torrkörning — kör om med --apply för att skriva)")
        return 0

    for bid, _ot, new_t, _oa, new_a in planned:
        con.execute("UPDATE books SET title=?, author=? WHERE id=?", (new_t, new_a, bid))
    con.commit()
    print("✓ skrivet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
