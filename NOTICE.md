# Content, brand and third-party material

The [MIT license](LICENSE) covers this repository's source code. It doesn't
cover the content the code publishes, which is © islam.se, all rights
reserved:

- The texts: essays, answers and Fördjupning pages, published, pending and
  archived (`data/articles/`, `data/articles-pending/`,
  `data/articles-archived/`, `data/svar/`, `data/fordjupning/`), and the
  research, briefs and drafts behind them (`data/briefs/`,
  `data/fordjupning-output/`, `data/bildforslag/`,
  `data/pipeline-feedback.jsonl`).
- The podcast: the narrated essays and their episode art
  (`apps/web/public/audio/*.mp3`, `apps/web/public/audio/*.jpg`,
  `apps/web/public/podcast-cover.jpg`).
- The pictures made for the site: feature images and the engraved drawings
  (`apps/web/src/assets/images/` outside `inline/` and `moskeer/`,
  `apps/web/src/assets/ritningar/`, `apps/web/src/assets/app/`).
- AI-barometern's questions and recorded answers
  (`apps/web/src/data/ai-barometern/`, `data/ai-barometern-pilot/`).
- The name islam.se, the wordmark and sun mark, the icons, the social card and
  the store graphics (`apps/web/public/*.svg`, `apps/web/public/*.png`,
  `apps/mobile/assets/`, `apps/mobile/store/`).

## Third-party material

Each keeps its owners' terms:

- The App Store and Google Play badges (`apps/web/public/badge-*`) and the AI
  model logos on AI-barometern (`apps/web/src/assets/ai-barometern/logos/`)
  are their companies' marks.
- Quotations in the texts belong to their authors and translators, among them
  Mohammed Knut Bernström, whose Swedish rendering of the Quran (*Koranens
  budskap*) the texts quote.
- Quran recitation by Ahmad al-Nufais (murattal), cut per verse from the surah
  recordings on Tarteel's CDN, with word timings from the
  [Quranic Universal Library](https://qul.tarteel.ai) (recitation 461), and
  the Uthmani Arabic text via Tarteel: `apps/web/public/audio/quran/`,
  `apps/web/scripts/data/qul-alnufais-segments.json`,
  `apps/web/scripts/data/qul-alnufais-surahs.json` and
  `apps/web/src/data/quran-verses.json`.
- Photographs from Wikimedia Commons, each under the license named beside it
  in `apps/web/src/data/image-credits.json` (for
  `apps/web/src/assets/images/inline/`) and `apps/web/src/lib/moskeer/art.ts`
  (for `apps/web/src/assets/images/moskeer/`).
- Fonts under the SIL Open Font License 1.1: Literata, Source Sans 3 and
  Amiri, including Amiri Quran and the two honorific glyphs cut from Amiri
  (`apps/web/src/assets/fonts/`, which holds the license texts,
  `apps/web/scripts/fonts/` and `fonts/`).
- The Swedish Hunspell dictionary from the `dictionary-sv` package, under the
  LGPL-3.0 (`data/hunspell/sv.aff`, `data/hunspell/sv.dic`).
- Map and place data: land, water and the outlines of Sweden and its
  neighbours from Natural Earth (public domain); national parks and nature
  reserves © OpenStreetMap contributors (ODbL), via OpenFreeMap; place names
  from GeoNames (CC BY 4.0); population figures from Statistics Sweden (SCB);
  shaded relief from AWS Terrain Tiles (Mapzen)
  (`apps/web/src/lib/bonetider/`, `apps/web/src/assets/bonetider/` and
  `apps/mobile/src/lib/places/`).
- The mosque list, compiled from migrationskartan, OpenStreetMap (ODbL) and
  muslimer.se (`apps/web/src/data/moskeer-sverige.csv`,
  `apps/web/src/data/moskeer-sverige.json` and its mirror in
  `apps/mobile/src/lib/mosques/`).
