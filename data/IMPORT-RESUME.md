# Bokimport — pausad 2026-08-01, så här tar du upp den igen

## Läget

`books.db`: **154 996 passager**. Omgång 1 (fiqh) är KLAR:

| verk | skola | passager |
|---|---|---|
| Ibn Qudāma, *al-Mughnī* | hanbalitisk | 15 349 |
| al-Nawawī, *al-Majmūʿ* | shafiitisk | 11 625 |
| al-Marghīnānī, *al-Hidāya* | hanafitisk | 2 895 |
| Ibn Rushd, *Bidāyat al-mujtahid* | jämförande | 2 598 |

Alla fyra rättsskolorna har nu sitt standardverk i korpus. Det var luckan som gjorde att
pipelinen hittade på shamela-länkar — se [[fordjupning_fabricated_sources]].

## Ta upp igen

```bash
cd /home/yunus/Work/islam.se
pnpm cli import-books data/urls-arabic-tafsir-hadith.txt --language ar   # omgång 2, ~2,3 h
pnpm cli import-books data/urls-arabic-sunan-historia.txt --language ar  # omgång 3, ~2,3 h
```

Filerna är resumerbara: klara böcker markeras `# DONE ` i URL-filen och hoppas över.
Ingen av omgång 2 eller 3 har någon DONE-rad än, så de börjar från början.

⚠️ **Sahih al-Bukhari var halvimporterad och är BORTTAGEN.** Körningen avbröts mitt i
embeddinggenereringen, och eftersom `# DONE ` bara skrivs efter lyckad import hade en
omstart importerat boken en andra gång — 5 353 dubbletter i korpus. Boken raderades
därför ur `books.db` (bok-id 171) och importeras om från noll vid nästa körning.
Säkerhetskopia före raderingen: `/tmp/books.db.bak` (527 MB, gäller bara denna session).

⚠️ Kör `pnpm cli clean-orphan-embeddings` efter återupptagandet — raderingen kan ha
lämnat embeddingrader utan passage bakom sig (`passage_embeddings` indexeras på rowid).

## Kostnad

0 kr. Allt är lokalt: HuggingFace `multilingual-e5-small` (384 dim) via ONNX Runtime.
Ingen API-nyckel inblandad. Kostnaden är CPU — ~3,5 kärnor, ~5 passager/sek, ~2,8 min/MB.
⛔ Lägg INTE till `--summarize` för att gå fortare — den flaggan startar `claude`-CLI:t
och drar prenumerationskvot. Utan den saknar böckerna kapitelsammanfattningar, så
`book-search`s »Relevant Themes«-väg missar dem; passage- och FTS-sökning fungerar ändå.
Vill du ha temavägen: `pnpm cli summarize-books` i efterhand.

## Kvar att importera

**Omgång 2** (`data/urls-arabic-tafsir-hadith.txt`): Bukhārī, Muslim, Ibn Hishāms *sīra*,
Ibn Kathīrs *tafsīr*, al-Qurṭubīs rättstafsīr — ~50 MB.

**Omgång 3** (`data/urls-arabic-sunan-historia.txt`): al-Azraqīs *Akhbār Makka* (för
Kaba-sidan), Mālik, de fyra *Sunan*, al-Shāfiʿīs *al-Umm*, Ibn Kathīrs *al-Bidāya* — ~50 MB.

Båda filerna är ordnade efter värde per minut; det går att avbryta var som helst.
