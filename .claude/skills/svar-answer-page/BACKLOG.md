# /svar/ answer-page backlog (GSC-derived)

Generated **2026-06-20** from 180-day Google Search Console page data (`gsc query --dim page`).
State at generation: **49 `/svar/` pages live**, **64 redirect-from paths wired**, **123 legacy URLs
still soft-404 to the homepage with impressions**. This file lists the clear remaining wins, ranked.
Numbers are 180-day `impressions` (i) / `clicks` (c) / avg `position` (p).

## How to pick up

- **New page:** `node apps/content-producer/dist/index.js svar "<fråga>" --slug <slug> --legacy <legacy-path>`
  (Opus 4.8 two-pass; defaults `--effort xhigh` author / `--review-effort max`). Then wire
  `["<legacy>", "/svar/<slug>/"]` into `customRedirects` in `apps/web/astro.config.ts`, build, `pnpm ship`.
- **Free redirect** (legacy maps to a page that already exists): just add the `["<legacy>", "/svar/<existing-slug>/"]`
  line to `customRedirects`, build, ship. **Zero production.**
- Always: one quality pass + link-check (`curl`-HEAD every al-ibadah/islamqa/wiki URL — the producer
  hallucinated a URL once), orthodoxy review (Athari guardrail), house-style sweep. See `SKILL.md`.
- Wire the slash + non-slash forms are emitted automatically; custom rules win over the homepage fallback.

---

## P0 — Free redirects to pages that already exist ✅ DONE 2026-06-20 (deployed)

**Status: all wired + shipped** — 40 free redirects total (the table below + a second sub-150i/`/category/`
wave: tron-pa-gud/treenigheten/gud-ar-skild → islams-gudssyn, tron-pa-yttersta-dagen → domedagen,
tron-pa-sandebuden → profeten, tafsir → koranen, category/kvinna + frun-foder-en-dotter + tvangsaktenskap
→ kvinnan/aktenskap, kan-kvinnan-ha-flera-man → flera-fruar, forberedelser/odmjukhet-under-bonen +
/islam-i-praktik → sa-ber-man, attacker-mot-civila → jihad, motsager-islam-vetenskap → big-bang, etc.).

_Original table (kept for reference): legacy URLs topically answered by a live page, repointed off the
homepage 301._

| legacy path | 180d | → existing /svar/ page | why |
|---|---|---|---|
| /gud/guds-harstamning | 1098i | islams-gudssyn | al-Ikhlās "ej avlat/avlad"; God has no lineage |
| /kvinna/kvinnans-mindre-arv | 425i p5 | islams-syn-pa-kvinnan | the kvinnan page already covers inheritance nuance |
| /islam/koranen-sager-att-muslimer-skall-drapa… | 375i 15c | vad-ar-jihad | the "kill the disbelievers" misread — jihad page handles it |
| /kvinna/kvinnofortryck | 373i | islams-syn-pa-kvinnan | women's oppression |
| /existens/universums-ursprung | 349i | islam-och-big-bang | origin of the universe |
| /jihad/manniskors-lika-varde | 309i | vad-ar-jihad | jihad cluster |
| /kvinna/vad-onskar-den-muslimska-kvinnan | 292i | islams-syn-pa-kvinnan | |
| /gud/kalla-gud-for-han | 254i | islams-gudssyn | God's "gender" — gudssyn covers it (42:11) |
| /jihad/islam-spreds-inte-med-svardet | 228i | vad-ar-jihad | |
| /islam-i-praktik/video-bonen | 215i | sa-ber-man-steg-for-steg | how to pray |
| /gud/gud-beskriver-sig-sjalv | 209i | islams-gudssyn | |
| /category/jihad | 177i | vad-ar-jihad | tag/category page |
| /islam/tron-pa-det-forutbestamda | 166i | vad-ar-odet-qadar | exact match (belief in qadar) |
| /gud/kan-gud-fa-en-son | 163i | jesus-i-islam | "can God have a son" — Jesus page answers it |
| /kvinna/temporara-aktenskap | 162i | aktenskap-i-islam | mutʿa (or sunni-och-shia) |
| /gud/en-existens-tyder-pa-att-det-ocksa-finns-en-skapare | 154i | islams-gudssyn | argument from existence |
| /tro/sjalens-existens | 408i 12c | vad-sager-islam-om-livet-efter-doden | the soul / barzakh (decent fit) |

### P0b — Non-/svar/ redirects to existing pages (also free)
| legacy path | 180d | → target |
|---|---|---|
| /om/om-islam-se | 368i 5c | /om |
| /uncategorized/bonetider | 365i | /bonetider/ |
| /islam-i-praktik (bare index) | 487i | /bonetider/ or a /svar/ hub |

---

## P1 — New /svar/ pages, genuine gaps (ranked by impressions)

| topic | legacy (180d) | suggested slug | question |
|---|---|---|---|
| Superstition / amulets / evil eye | /religion/vidskepelse (1017i) | vad-sager-islam-om-vidskepelse | "Vad säger islam om vidskepelse, amuletter och onda ögat?" |
| Atheism | /religion/ateism (862i) | vad-sager-islam-om-ateism | "Vad säger islam om ateism?" |
| Deism / secularism | /religion/deism-och-sekularism (744i) | islam-deism-och-sekularism | "Vad säger islam om deism och sekularism?" |
| First revelation (sira) | /historia/uppenbarelsens-borjan (411i) | forsta-uppenbarelsen | "Hur började uppenbarelsen av Koranen?" (Iqraʾ, Ḥirāʾ) |
| Arguments for God | /gud/argument-for-guds-existens (412i) | finns-bevis-for-gud | "Finns det bevis för Guds existens i islam?" |
| Quran vs earlier scriptures | /islam/hur-skiljer-sig-koranen… (428i) | koranen-och-tidigare-skrifter | "Hur skiljer sig Koranen från Bibeln och Toran?" |
| Islamic golden age / science | /historia/vetenskap…medeltiden (451i) | den-islamiska-guldaldern | "Vad var den islamiska guldåldern?" |
| Why God created mankind | /existens/syftet-med-skapelsen… (326i) | varfor-skapade-gud-manniskan | "Varför skapade Gud människan?" |
| Conquest of Mecca (sira) | /historia/erovringen-av-mecka (298i) | erovringen-av-mecka | "Vad hände vid erövringen av Mecka?" |
| Prophets in Islam | /islam/guds-profeter (216i) | profeterna-i-islam | "Vilka är profeterna i islam?" (could also be a P0 redirect to vem-var-profeten-muhammed) |
| Karma (comparative) | /islam/karma (377i) | tror-muslimer-pa-karma | "Tror muslimer på karma?" |
| Hinduism / polytheism | /islam/hinduismens-manga-gudar (1494i, p16) | islam-och-polyteism | "Vad säger islam om månggudadyrkan?" (high impr but weak position — needs a strong page) |
| Christianity's view of God | /religion/kristendomens-gudssyn (237i) | — | comparative; or fold into islams-gudssyn |
| **Four witnesses & rape** ⚠️ | /kvinna/fyra-vittnen-till-en-valdtakt (180i) | fyra-vittnen-och-valdtakt | **SENSITIVE** — the 4-witness rule is for *accusing* someone of zinā, NOT for a rape victim to prove assault (qarīna/forensic evidence applies). Major misconception worth correcting carefully per the orthodoxy guardrail. |

---

## P2 — Content-restore candidates (NOT /svar/ — your call)

These are old WordPress **essays/posts** still ranking, now 301'd to the homepage. They're not FAQ
answer-page material; decide per item: restore as an essay, write a thematic /svar/, or redirect.

- **/featured/omsesidig-karlek — 3722i / 115c / p6 🔴** the single biggest *click* leak (115 clicks
  landing on the homepage). Topic = mutual love / brotherhood. Options: restore the essay, a /svar/
  "Vad säger islam om kärlek och broderskap?", or redirect to the closest essay.
- /kost/muslimsk-matkultur-i-historien (1206i, p11) — Muslim food culture in history (essay).
- /featured/planeterna-i-solsystemet (634i), /featured/mangudemyten (624i),
  /featured/fastans-historiska-anknytning (156i) — old science/comparative essays.
- /arbete/arbete-och-valstand (381i, 10c) — work & prosperity (essay).

---

## Notes

- **Query coverage is good:** the top informational queries (varför äter muslimer gris, halalslakt,
  kaba, ghusl, hijab, abort, ramadan, sunni/shia, alhamdulillah, bönen steg för steg, wudu,
  trosbekännelse, hur blir man muslim) are all served by live pages now.
- **Niche/health tail** not listed above (≥150i): /kost/traning, /kost/amning, /kost/utbrandhet,
  /kost/mediciner, /kost/inre-och-yttre-valbefinnande, /kost/partnerskapet-mellan-kropp-och-sjal,
  /gud/treenigheten, /religion/pandoras-ask, /islam/hinduismens-kastsystem — lower priority; cluster
  into a few pages only if the higher tiers are exhausted.
- Re-generate this file with the GSC helper + the classify snippet whenever a batch ships (the
  redirect-from set grows, so the uncovered list shrinks).
