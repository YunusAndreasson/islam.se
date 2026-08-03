---
name: fordjupning-page
description: Produce ONE encyclopedic pillar page (data/fordjupning/*.md) for islam.se — a Wikipedia-length, neutrally written reference article on a contested Islamic topic (hijab, äktenskap, sharia, polygyni), built on the internal corpus and aimed at the broad head term. Use when asked to write/produce an fordjupning or fördjupning page, to cover a controversial topic in full, to rank for a broad topic term rather than a single question, or to build a pillar above existing /svar/ answer pages. One page per session, high quality, human-reviewed.
---

# Pillar-page (`/fordjupning/`) production skill

islam.se has two content types that both stop short of one job. The **answer pages**
(`/svar/`, 460–1 230 words) win the question intent — »vad är hijab?«. The **essays**
(root-level, 950–2 600 words) are literary and argue a thesis. Neither is built for the
**broad topic term** — »hijab«, »slöja islam«, »muslimskt äktenskap« — where the
competition is Wikipedia, newspaper columns and debate pieces.

`/fordjupning/` is that third type: an encyclopedic reference article of 2 800–4 500 words,
neutral in register, that covers a contested topic in full and puts it in a Swedish frame
without betraying the sources.

**One page per session, to a very high bar.** Never bulk-generate — Google's 2026
scaled-content-abuse enforcement punishes mass AI pages, and this is YMYL religious
content besides.

## The architecture: pillar above spoke

The pillar does **not** replace the answer page on the same topic. They split the intent:

```
/fordjupning/hijab/            »Hijab« — head term, 2 800–4 500 words
  ├─ ordet · källorna · de lärda · historien
  ├─ Slöjan i Sverige (lag, domar, siffror, debatt)   ← the bridge
  ├─ blygsamhet i svensk idéhistoria                  ← the corpus
  └─→ /svar/vad-ar-hijab/
/svar/vad-ar-hijab/        »Vad är hijab?« — question intent, ~900 words
  └─→ »Fördjupning: Hijab«  (rendered automatically, see below)
```

The cross-links are **derived, not declared twice**: whichever pillar lists an answer in
its `related` is that answer's fördjupning, and `svar/[slug].astro` builds the reverse
index at build time. Set `related` on the pillar only.

⚠️ **Do not move existing 301s onto the pillar.** Four legacy slöja URLs already point at
`/svar/vad-ar-hijab/`, including `/kvinna/slojan` (3 057 impressions/90 d). The answer page
is the accumulated recipient; the pillar earns the head term on its own. Only consider
repointing after reading per-URL GSC **query** data — never inferring a page's topic from
its slug (that mistake is recorded in [[svar_answer_pages]]).

## Workflow (one session, one page)

1. **Judge the corpus before spending an hour.** Angles are the highest-leverage input to
   the whole run, so look at what they return first:
   ```bash
   node apps/content-producer/dist/index.js fordjupning "Hijab" --corpus-only \
     --verse 24:30 24:31 33:59 33:53 7:26 \
     --quran "kvinnors klädsel och blygsamhet, slöja och sänkta blickar" … \
     --arabic "تحريم كشف العورة وحجاب المرأة" … \
     --swedish "kvinnans klädsel, blygsamhet och blicken från andra" …
   ```
   Read the brief. Can an article be built on this? If a whole angle group is noise,
   reword it and re-run — it costs seconds.

   ⚠️⚠️ **Skriv `--arabic`-vinklarna PÅ ARABISKA, trots att flaggans hjälptext säger
   "English thematic phrases".** Mätt på griskött (2026-08-03): engelska temafraser gav
   nära noll passager som ens nämnde ämnet — sökningen returnerade offerkött, ribā-byten
   och att äta med höger hand. Samma vinklar på arabiska gav **24 av 64 passager med
   `خنزير` i sig**. Embeddingmodellen (multilingual-e5-small) matchar arabiska mot
   arabiska långt bättre än engelska mot arabiska, och fiqh-termerna har inga bra
   engelska motsvarigheter. Slå upp facktermen först — `sqlite3 data/books.db "select
   count(*) from passages where text like '%الخنزير%'"` — och använd den ordagrant.
2. **Produce** (~45–75 min; spawns headless Claude with web + MCP):
   ```bash
   node apps/content-producer/dist/index.js fordjupning "Hijab" --slug hijab \
     --verse … --quran … --arabic … --swedish … \
     -m opus -e xhigh --review-effort max -q 7.5 -r 2 -o <output-dir>
   ```
   Stage outputs land in `-o`: `corpus-brief.md`, `research.json`, and the gate report is
   printed at the end. Add `--overwrite` to regenerate.
3. **Read the gate report first.** It tells you what to distrust before you read a word:
   credibility score, review score and verdict, revisions used, dropped sources, prose
   issue count.
4. **Run the mechanical checks first.** They cost a second and catch what
   the prompts demonstrably fail to enforce on their own:
   ```bash
   python3 scripts/check-house-style.py data/fordjupning/<slug>.md
   python3 scripts/check-language-tics.py data/fordjupning/<slug>.md
   python3 scripts/check-claim-sourcing.py data/fordjupning/<slug>.md
   python3 scripts/check-source-urls.py data/fordjupning/<slug>.md   # ⛔ blockerande
   python3 scripts/check-quran-quotes.py data/fordjupning/<slug>.md  # ⛔ blockerande
   ```
   ⛔⛔ **`check-quran-quotes.py` kollationerar varje korancitat mot Bernström.** Den
   finns därför att GRANSKAREN skrev om Koranen på griskött: den ändrade öppningen av
   2:173 från »Vad Han har förbjudit er är kött av …« till »Han har förbjudit er kött
   av …« med hänvisning till husregeln om gemena gudspronomen, och påstod att den nya
   lydelsen låg närmare Bernström. Den gjorde inte det. Husreglerna gäller artikelns
   egen prosa — **innanför ett citat gäller ingen av dem**. Kontrollen skiljer
   ORDAGRANT / FÖRKORTAT (troget utdrag, tillåtet) / OMSKRIVET (fäller).
   ⛔ **`check-source-urls.py` är den enda kontrollen som får stoppa en sida helt, och
   den är avsiktligt fri från modell — den hämtar varje käll-URL och läser statusraden.**
   En påhittad länk är den defekt varken granskaren, faktakollen eller en människa som
   läser prosan upptäcker, eftersom en falsk `shamela.ws/book/9673` ser exakt ut som en
   äkta. Kör den innan du läser texten; exitkod 1 betyder att sidan inte får skickas.
   Rätt åtgärd är alltid `--fix` (tar bort `url:`, behåller `name:`) — aldrig att gissa
   ett nytt id. En källa utan länk är korrekt; en påhittad länk är en förfalskning.
   `check-house-style.py` knows the `fordjupning` genre and applies the reference-page rule
   set: the see-saw closer cap, the dash budget, dot-under transliteration, du-tilltal, no
   »Källor« in the body, plus three rules specific to this type — Bernström scan artifacts
   copied out of `quran.db`, »athari« in reader-facing text, and a `— Koranen N:N`
   attribution line where a footnote belongs.
5. **Evaluate hard — do not self-rubber-stamp.** Kör **två subagenter parallellt**, båda
   definierade i `.claude/agents/`:
   - **`fordjupning-verifier`** (Bash/Read/Grep/WebFetch) — källor, arabiska
     korpuspassager, korancitat, svenska rätts- och sifferuppgifter, korspelarkonsistens.
     Ge den både artikeln **och stegutdatakatalogen**; dess mest givande enskilda grepp är
     att diffa `draft-raw-1.md` mot den levererade filen, eftersom ett SENARE steg kan ha
     förstört det författaren fick rätt.
   - **`fordjupning-prose-critic`** (inga verktyg) — register, rytm, AI-tics,
     avslutningsformer, falsk ekvivalens, invändningarnas styrka. Den jämför mot
     `data/svar/vad-ar-kaba.md` och en essä i `data/articles/`.

   ⚠️ **Dela alltid upp dem.** En enda agent som ombeds både bedöma prosa och kontrollera
   fakta gör den billiga halvan. På griskött var prosan ren på varje mekaniskt mått
   (0 av 7 avslutningar över kvoten) medan **samtliga fem verkliga defekter var sakliga
   eller strukturella** — en omskriven koranvers, ett felbeskrivet processteg, publicerade
   redaktörslappar, stulna spokes och ett obelagt påstående. En prosakritiker fångar
   ingen av dem.

   ⚠️ Kräv **falsifierbara fynd, inte poäng per dimension**. Poängsättning driver mot
   medhåll: 8,6 »publish« samexisterade med en omskriven koranvers.

   📋 Hela kontrollistan finns i `VALIDERING.md` bredvid den här filen.
6. **Improve** — apply the punch-list by hand, and **fold every recurring lesson back into
   `prompts/fordjupning-author.md`** so the next page starts higher. That compounding is the
   whole point of one-per-session.
7. **Build + verify**: `pnpm --filter @islam-se/web build`. A dangling `related`/`essays`
   slug fails the build by design (the producer filters them, but confirm). Check the
   rendered page: TOC anchors resolve, footnotes relocate under »Noter«, the recitation
   player appears under the Quran block quotes, the 390 px view holds.
8. **Human review gate (REQUIRED)**: orthodoxy + factual accuracy. Defer to the user. This
   is YMYL religious content on a contested topic — see [[orthodoxy_review_guardrail]].
9. **Ship** one page. Don't batch.

## The rubric (a "must" miss = don't ship)

- **Lede**: first sentence a bolded standalone definition (`**Hijab** är …`) — that is what
  the AI Overview extracts. The lede also states what the dispute is actually about.
- **All seven sections present**, each `##` usable as a search phrase in its own right
  (»Slöjan i Sverige«, not »I Sverige«).
- **The Sweden section has real content** — statutes, named court rulings, figures with
  years — not general phrasing. It is the page's reason to exist; if it is thin, the page is
  just a worse Wikipedia.
- **Objections in their strongest form.** A strawman that is then rebutted is worse than no
  objection at all.
- **Disagreement shown as disagreement**: madhhab differences with named proponents.
- **Freshly translated primary text** from the Arabic classics — the unique core.
- **Footnotes** (GFM), used liberally. Frontmatter `sources` ≥8 is the only source list;
  **no »Källor« list in the body**. Every source named or quoted in the prose.
- **Entity anchor**: `about.sameAs` with working Wikidata + Wikipedia URLs.
- Length 2 800–4 500 words, from structure, not padding.

## Index layout: switch to cards at ~6 pages

The hub is a text list with a 120px thumbnail today because a three-column grid holding
one card reads as broken. At roughly six pages, switch it to the Pelare & tro treatment:
`components/FaktaCard.astro` already takes exactly what `resolveHero()` returns
(`href`, `label`, `blurb`, `art`, `image`), so the change is the grid CSS, not new
plumbing. A grid also halves the scroll — thirty list rows run ~4 500px, ten grid rows
about half that.

Two things must be true first, and one of them is content: every page needs its short
`blurb` (the producer requires it, so pages produced from 2026-07-30 have one), and
enough topics need bespoke art that the grid does not read as a wall of borrowed,
unrelated essay photos. Borrowing survives at one card; at thirty it looks arbitrary.

## What the first two pages taught (hijab, döden)

Both pages shipped at review ≥8.6, and comparing their runs exposed four faults that were
in the *system*, not in either draft. All four are fixed; this is the record of why.

- ⚠️ **The id gate was inert on both pages.** `research.json` carried `quotes: 0` while the
  corpus brief offered 20 candidates, so `getQuote()` verified nothing and the Strindberg,
  Tegnér and Boye quotations reached the page unchecked. The gate report now prints
  `Korpuscitat: N verifierade av M i briefen` and warns when the count is zero — a run must
  never again report success with its strictest gate disarmed. **If you see that warning,
  the Swedish material in the article is unverified; check it by hand.**
- ⚠️ **The review prompt contradicted the checker.** It said `citattecken » «` while
  `check-house-style.py` errors on `»` and demands straight quotes (smartypants converts at
  render). Every review therefore "fixed" the author's correct straight quotes into ten
  errors a human undid by hand. The author prompt had been corrected during the hijab
  session; the review prompt was missed. **When a house rule changes, grep all three
  prompts and the checker — not just the one that produced the symptom.**
- ⚠️ **The review prompt also stripped macrons**, which the author prompt explicitly allows
  (*khimār*, *jilbāb*). Only the dot-under is banned. The result: hijab keeps its macrons,
  döden has none, and the two pages are inconsistent for no editorial reason.
- ⚠️ **A prompt example became the template.** The blurb rule illustrated itself with
  "Vad källorna säger och vad svensk rätt tillåter" — and *both* pages produced a near-
  identical line. Illustrative examples in a prompt are copied as forms, not read as
  hints. Show the shape to avoid, not the shape to use.

Recurring drafting faults, now named explicitly in `fordjupning-author.md`: the see-saw
closer cap (4 of 7 sections on döden's first draft) and »snarare än« over cap (3 on both
pages).

## ⚠️⚠️ Fiqh-luckan: en korpusbrist som blev en förfalskning (2026-08-01)

Den här sidan bokförde tidigare »zero fiqh sources on both pages« som ett SKRIVFEL att
rätta i författarprompten. Det var fel diagnos, och åtgärden gjorde skadan värre.

**Sanningen då:** `data/books.db` innehöll 33 arabiska verk och **inte ett enda
furūʿ al-fiqh-verk** — beståndet var taṣawwuf/akhlāq (Ibn al-Qayyim ×8), ʿaqīda
(Ibn Taymiyya ×12), hadith/adab (Riyāḍ, Adab al-Mufrad), korantolkningsvetenskap
(al-Suyūṭī) och statsrätt (al-Māwardī). Ingen promptändring kan få författaren att
citera ett verk som inte finns.

✅ **LUCKAN ÄR STÄNGD (verifierat 2026-08-02).** `books.db` bär nu 57 arabiska verk,
däribland alla som då hittades på: al-Mughnī (15 349 avsnitt), al-Majmūʿ (11 625),
al-Umm (9 427), al-Hidāya (2 895), Bidāyat al-mujtahid (2 598), al-Muwaṭṭaʾ, samtliga
sex hadithsamlingar samt Ibn Kathīrs och al-Qurṭubīs tafsīr. Halal-körningen citerade
nio av dem och alla nio belades ordagrant. **Kontrollera beståndet innan du planerar
ett fiqh-tungt ämne** — `sqlite3 data/books.db "select author, title from books where
language='ar'"` — och sök på den arabiska facktermen (`ذكاة`, `التسمية`,
`الاستحالة`) innan du lägger en timme på briefen.

**Vad åtgärden orsakade:** prompten kom att KRÄVA ett klassiskt fiqh-verk och namngav
tre exempel. Författaren kopierade exempellistan rakt in i bibliografin och hittade på
shamela-id:n. Kontroll av alla 562 käll-URL:er i det publicerade materialet:

| citeras som | URL | vad det faktiskt är |
|---|---|---|
| al-Nawawī, *al-Majmūʿ* (aktenskap) | `shamela.ws/book/9673` | 404 |
| al-Nawawī, *al-Majmūʿ* (ramadan) | `shamela.ws/book/9424` | 404 — **annat påhittat id för samma verk** |
| al-Marghīnānī, *al-Hidāya* | `shamela.ws/book/13290` | 404 |
| Mughniyya, *al-madhāhib al-khamsa* | `shamela.ws/book/23653` | 200 → *ʿUyūn al-athar* |
| Ibn Taymiyya, *al-Qawāʿid al-nūrāniyya* | `shamela.ws/book/1157` | 200 → al-Shaybānīs *al-Jāmiʿ al-kabīr* |

Två svarar 200 på fel bok — **en liveness-kontroll kan aldrig fånga den sorten.**
Att samma verk fick två olika påhittade id på två sidor avgör saken: det är inte en
inaktuell länk, det är fabrikation. Alla 63 `/svar/`-sidor är rena; felet är isolerat
till fiqh-citaten här.

**Varför ingen grind såg det:** `validateResearch()` granskar `research.sources` —
forskningsstegets lista, före författarsteget. Artikelns egen frontmatter-`sources`
granskades aldrig. Dokkommentaren sa »before the material can reach the page«, vilket
lät heltäckande och var det inte.

**Nu åtgärdat i KOD, inte i prompt** (tre promptfixar hade redan misslyckats mot samma
felklass): `validateArticleSources()` körs på `reviewed.fm.sources` före `write()`,
strippar döda URL:er och alla shamela/islamweb-djuplänkar, behåller källans namn och
skriver ut varje strykning i grindrapporten. Regressionstest i
`fordjupning-producer.test.ts`. Fristående kontroll: `scripts/check-source-urls.py`.

⚠️ Kvarstår: rätten måste hämtas från WEBBEN (IIFA, al-ibadah.com, islamqa, en fatwa
du faktiskt öppnat), inte ur korpusbriefen. Den varaktiga lösningen är att importera
furūʿ-verken med `pnpm cli import-books`.

## Traps

- ⚠️ **False equivalence in the intellectual-history section is the single biggest risk.**
  That the covered female body has a Swedish intellectual history is a *fact worth
  reporting*; it is not an argument for the Islamic position. Read that section once for
  nothing else. Every »see, you did the same thing« sentence must go.
- ⚠️ **Never quote verse text straight from the corpus brief.** `quran.db` holds a scan of
  the print edition: words are split at the original line breaks (»dött rar«, »kvinn folk«,
  »kläd nad«) and Bernström's glosses are pasted into the verse body. Fetch the clean
  wording from `quran.com/<sura>/<vers>?translations=48`.
- ⚠️ **Similarity scores are meaningless across searches.** Everything scores 0.83–0.86
  whether relevant or not, and on the hijab topic the query returning pure noise scored
  *highest*. That is why the brief groups hits per search and never pools them — judge each
  group on its own, and expect whole groups to be useless.
- ⚠️ **Semantic search misses the loci classici.** It never returned 33:59, the jilbāb
  verse, under any angle. Pin the central texts with `--verse`; search is for what you would
  not have thought to look for.
- ⚠️⚠️ **En ny pelare STJÄL spokes från de gamla — omvända indexet är alfabetiskt.**
  `svar/[slug].astro` bygger `pillarBySvar` med `if (!pillarBySvar.has(svarSlug))`, och
  `getCollection("fordjupning")` kommer i id-ordning. **Först i bokstavsordning vinner.**
  Griskött-utkastet listade `vad-ar-halalslakt`, `ar-vinager-halal`,
  `far-muslimer-dricka-alkohol` och `islams-fem-pelare` i sin `related`, och eftersom
  »griskott« < »halal« < »ramadan« flyttades alla fyra svarssidornas fördjupningslänk
  från rätt pelare till griskött. Producenten kan inte se det: varje enskild slug finns,
  så bygget går igenom. **Kontrollera efter varje ny sida vilka svar fler än en pelare
  gör anspråk på, och trimma den nya till det den faktiskt äger.** `related` är dubbelt
  bokfört — det är både sidans »Relaterade frågor« och dess anspråk i indexet — så en
  bred lista kostar andra sidor deras rätta pelare.
  ⚠️ Redan i beståndet: `vad-ar-hijab` pekar på **aktenskap.md**, inte hijab.md, och
  `vad-sager-islam-om-livet-efter-doden` på abort.md i stället för doden.md — samma
  alfabetiska orsak, äldre än griskött.
- ⚠️ **Redaktörsinstruktioner läcker ut i publicerade fotnoter.** Griskött-utkastet
  skickade »Referensen bör kontrolleras mot en angiven utgåva« och »Ett konkret
  rådsbeslut om livsmedelstillsatser bör anges här« rakt in i noterna, och en tredje not
  hänvisade till »standardlitteraturen« som om det vore en källa. Ingen grind ser det:
  det är inte en död URL, inte ett påhittat id, och prosan är oklanderlig. **Läs noterna
  som text, inte som apparat** — allt som säger »bör«, »kontrollera« eller »se
  standardlitteraturen« är en lapp till dig själv, och en not utan källa är ärligare än
  en not som låtsas ha en.
- ⚠️ **Rättsprocesser beskrivs ett steg för långt.** Utkastet skrev att DO »stämde« en
  skola i december 2023; myndigheten hade skickat ett *utkast till stämningsansökan* med
  svarsfrist, och någon stämning lämnades aldrig in. Ingressen hade dessutom sidan
  »förd till domstol«. Samma felklass som djurskyddslagen på halal-sidan: ett
  myndighetsbesked sammanfattas till nästa steg i processen. **Öppna pressmeddelandet
  och läs vilket processteg som faktiskt inträffat.**
- ⚠️ **Attribution trap** ([[quotes_db_arabic_attribution_trap]]): the author field is the
  **book's** author, not the speaker, and the text is often a paraphrase — about one in three
  fails. A hadith quoted by Ibn al-Qayyim belongs to the hadith collection.
- ⚠️ **The reviewer cannot fix frontmatter.** `runReview` keeps only its own verdict fields
  plus the body; the article's frontmatter is carried over from the draft. Frontmatter
  problems arrive as `issues` for a human to apply.
- ⚠️ **»RÄTTAT AV MIG« in the issue list is not proof the fix landed.** Until 2026-08-01 the
  review loop returned the body on the *passing* round before reading `revisedText`, so the
  last reviewer's edits were always discarded — on ramadan that shipped a real factual error
  (Trelleborg glossed as 48°N) under an 8.7/publish verdict. Fixed in `adoptRevision()` and
  guarded by `fordjupning-producer.test.ts`; `review-N.json` now records `revisedTextChars`.
  **Read the last round's issue list against the file anyway** — the reviewer also lists
  things it only *described*, and the two are worded almost identically.
- ⚠️ **Quran player**: cite the verse in a **footnote** (`Koranen, al-Nūr 24:31.`), not with
  a `— Koranen 24:31` line under the block quote. The attribution line yields a player with
  no surah name; the footnote route yields a named one.
- ⚠️ **Astro caches rendered markdown per file content, and `rm node_modules/.astro/data-store.json`
  does NOT invalidate it.** Change a rehype/remark plugin and rebuild, and every unchanged
  page keeps its previously rendered HTML — the plugin never runs, so a correct fix looks
  like it did nothing. Verify a plugin change by touching the content (append and remove a
  comment line), or by asserting on the plugin directly in a unit test. This cost several
  build cycles chasing a fix that had been right all along.
- ⚠️ **Quote dates**: the producer emits double-quoted YAML scalars. An unquoted ISO date is
  parsed by Astro as a YAML timestamp → a JS `Date`, which fails the collection's
  `z.string()` and breaks the build. Keep it that way.
- ⚠️ **The closer-shape cap does not self-enforce.** Max two of seven sections may end on
  »inte X, utan Y« / a semicolon pivot / an em-dash sharpening. It was violated in ~50 of 60
  audited sections *while the rule was in the prompt*. The reviewer must count and state the
  count; so must you.

## Gates (all enforced in code, not only in prompts)

| Gate | Where | Behaviour |
|---|---|---|
| URL verification (research) | `SourceValidator.verifyUrls()` | 404/DNS-fail and blacklisted sources dropped — ⚠️ guards `research.sources` ONLY |
| URL verification (artikeln) | `validateArticleSources()` | the list that actually ships: dead URLs and shamela/islamweb deep links have their `url` stripped, name kept, every strip printed |
| Quote ids | `getQuote()` | a missing id **aborts** (stricter than the essay pipeline, which only logs) |
| Credibility | `runFactCheck()` | `< 7.5` aborts |
| Review score | producer's loop | `< 8` forces another revision regardless of verdict; `< 6` abandons |
| Prose | `evaluateProseText()` | `> 12` issues triggers a corrective pass, kept only if the count actually falls |

The review-score gate is the one the essay pipeline lacks: `produce()` branches on `verdict`
alone and never compares `finalScore`, so `{finalScore: 4, verdict: "publish"}` publishes
an essay. Closing that for essays too is an open question for the user.

⚠️ **A gate written only as a penalty teaches the model to empty the field it guards.** Every
sentence about `quotes` in `fordjupning-research.md` used to describe a risk of *including*
something — »ett id som inte finns avbryter hela körningen«, »ungefär en av tre faller« — on
a field the schema defaults to `[]`. Research therefore returned nothing in 3 of the first
4 runs, and the id gate had nothing to check while the author quoted Boye and Strindberg
straight from the raw brief. The prompt now says what the list is *for* and names the cost of
leaving it empty, and the author prompt requires a verified id before any corpus block quote.
**When adding a gate, write the cost of omission, not only the cost of error.**

⚠️⚠️ **Prompträttningen räckte inte — halal (2026-08-02) gav `quotes: 0 av 19` igen.**
Det var första skarpa provet efter rättningen, och den föll. MCP är rätt kopplat
(`.mcp.json` skickas in, `get_quote_by_id` står i `allowedTools`), så orsaken är inte
saknat verktyg. Behandla id-grinden som **obeväpnad tills motsatsen visas i
grindrapporten** och kontrollera varje svenskt korpuscitat för hand:
`grep -oP '(?<=citat-id )\d+' <brief>` ger de lagliga id:na, och allt i texten som inte
finns bland dem är påhittat. På halal höll bryggan ändå — Strindberg låg byteidentiskt
mot id 8681, och både han och Heidenstam attribuerades korrekt till en *romanreplik*,
inte till författaren — men det var författarpromptens förtjänst, inte grindens.

⚠️ **`bookPassages` fylls och är verifierbart — men INGEN grind rör det.** `getQuote()`
slår bara mot `quotes.db`. De arabiska passagerna bär `passage-id` som ingen kod
kontrollerar. Kör kontrollen själv; den tar sekunder och är den enda som svarar på
frågan »kommer fiqh-citaten ur korpusen eller ur modellens minne?«.
⚠️ **En naiv delsträngsjämförelse underkänner ALLT och är värdelös.** `books.db` är OCR
av tryckta utgåvor: `~~` i radbörjan, sidmarkörer (`PageV09P076`), handskriftsmarkörer
(`ms4120`) och saknad hamza mitt i meningar. Normalisera bort skräpet, slå ihop
`أإآ→ا`, `ىی→ي`, `ة→ه`, strippa all interpunktion — jämför bara konsonantskelettet.
Att skanningens egen stavning (`شىء` med alef maqṣūra) överlever in i citatet är i sig
ett äkthetsbevis. På halal gav den rättade kontrollen 13 av 13.
⚠️ **Kontrollen bevisar att citatet FINNS, aldrig att läsningen stämmer.** Faktakollen
fångade att Ibn Kathīr framställdes som motståndare till al-Qaraḍāwī när passagen
tvärtom bekräftar konsensus. Passagen var äkta och ordagrann; slutsatsen var fel.

⚠️ **A non-fatal stage that dies leaves no trace in the numbers.** Ground, Swedish voice and
the prose correction are all skip-on-failure; on ramadan two of the three never ran and the
gate report still read like a clean pass. The report now prints `STEG SOM ALDRIG KÖRDE`.
Run the three check scripts by hand regardless — that is how the skip was caught.

## Key files

- Producer: `apps/content-producer/src/fordjupning-producer.ts` (`fordjupning` command in
  `src/index.ts`), frontmatter contract in `src/fordjupning-schema.ts`.
- Prompts: `apps/content-producer/prompts/fordjupning-{research,author,review}.md` — tune these
  to raise quality. `fact-checker.md`, `ground.md` and `swedish-voice.md` are reused unchanged.
- Corpus stage: `packages/orchestrator/src/services/corpus-brief.ts`.
- Pages: `data/fordjupning/<slug>.md`. Collection: `apps/web/src/content.config.ts`.
  Rendering + JSON-LD: `apps/web/src/pages/fordjupning/[slug].astro`; TOC in
  `src/components/Innehall.astro`.
- Related memory: [[orthodoxy_review_guardrail]], [[feedback_language_standard]],
  [[fakta_cornerstone_audit]], [[gsc_skill]].
