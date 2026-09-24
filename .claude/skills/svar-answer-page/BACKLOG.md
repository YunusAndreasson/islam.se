# /svar/ answer-page backlog (GSC-derived)

Regenerated **2026-08-08** from 90-day Search Console data (2026-05-07 → 2026-08-05).
State at generation: **63 `/svar/` pages live**, **236 custom redirects wired**, **9 `/fordjupning/`
pillars live**. Numbers below are 90-day `impressions` (i) / `clicks` (c) / avg `position` (p).

> **The old premise is gone.** Versions of this file before 2026-08-08 were organised around ~214
> legacy WordPress URLs 301'ing to the homepage (~41k impressions of soft-404 waste). **That work is
> done.** Only 10 legacy paths still leak, totalling **1 282i — and 1 088 of those are
> `/samlingsvolym.pdf`**, not a page. About **194 impressions** of the original project remain, and
> the 2026-08-08 sweep gave a destination to every one of them worth having. Do not go looking for
> legacy URLs to recover; there are none left worth a page.
>
> ⚠️ When auditing this yourself, parse `customRedirects` **multi-line-aware**. Biome wraps long
> tuples across three lines, so the obvious `^\s*\["([^"]+)"` grep silently misses ~40 entries and
> reports already-wired paths as leaks. Pull every quoted string in the array body and pair them.

## Where the site actually stands

| window | clicks | impressions |
|---|---|---|
| 2026-03 (Ramadan peak, pre-migration) | 2 346 | 151 020 |
| 2026-05 (migration trough) | 130 | 8 582 |
| 2026-07 | 2 841 | 139 608 |
| 2026-08 (first 5 days) | 646 | 31 297 (~6 260/day) |

`/svar/` across consecutive 28-day windows: **93c / 6 066i → 360c / 28 396i**, and **all 63 pages
grew**. The answer-page strategy is working; it is simply young. 90-day `/svar/` total:
**453c / 34 462i**.

**So the selection criterion has changed:** the backlog is now driven by *query demand* — Swedish
questions earning impressions with no page that answers them — not by orphaned URLs.

## How to pick up

- **New page:** `node --no-warnings apps/content-producer/dist/index.js svar "<fråga>" --slug <slug>`
  (`--legacy` is optional and mostly moot now — these are demand-driven, not URL rescues).
  Opus-tier two-pass, `--effort xhigh` author / `--review-effort max`. Then build, review, `pnpm ship`.
- **Rescue pass:** no new file — retitle/restructure an existing `data/svar/*.md`. Cheaper than
  earning a new page's ranking from zero when the page already owns the topic.
- Always: quality pass, `curl -I` every source URL (the producer hallucinated one once), orthodoxy
  review (Athari guardrail), house-style sweep, closer-count. See `SKILL.md`.
- **One page per session.** Staggered publishing is the whole anti-scaled-content strategy.

---

## 2026-09-24 — what the »flera fruar« spike taught

From 17 September, site clicks went ~300/day → 400–530/day, and ~95 % of the gain was one page:
`far-muslimska-man-ha-flera-fruar` went **24c / 921i → 810c / 10 340i** week on week, p3.4 → p1.9.
The page had not been touched since 2026-07-26: the searches themselves rose (»hur många fruar får
muslimer ha«, 27i → 3 195i in a week, 97 % Sweden, 95 % mobile), probably from something in the
news. The traffic halved within four days.

1. **A good page published before a question trends is worth more than one written after.** It sat at
   p3.5 for three months doing nothing; when the searches came, Google lifted it to #1. Outsiders'
   »får muslimer…« / »hur många…« questions are the shape that trends.
2. **A description that holds something back gets clicked; one that gives the whole answer doesn't.** At p1–2: flera fruar
   (»upp till fyra – men bara på ett villkor som de flesta glömmer«) **10,5 %**; halalslakt (full
   definition + law answer) **0,8 %**; `/det-islamiska-aret` (all dates in the title) **0,3 %** on
   »när är ramadan 2027«.
3. **The title has to say the question the way people search it.** »…får muslimer ha« (matches) 10,5 % vs »…får en
   muslimsk man ha« 1,4–4,6 % on the same page.
4. **Read CTR on the bare URL only.** Google shows the H2 jump links (`#…`) as separate results; each
   gets impressions and ~0 clicks (≈3 000i on flera fruar alone), which drags page-level CTR down.

### Title changes shipped 2026-09-24 — measure from 2026-10-22 (28 days)

| page | change | baseline (27 Aug–23 Sep, bare URL) |
|---|---|---|
| `far-muslimska-man-ha-flera-fruar` | title → »Hur många fruar får en muslim ha? Fyra – på ett villkor« | »…får en muslimsk man ha« 4,6 % p1.9; »…får muslimer ha« 10,5 % p1.4 (spike-inflated — also watch this one doesn't fall) |
| `far-muslimer-dricka-alkohol` | title »Varför dricker…« → »Får muslimer dricka alkohol? Därför är det förbjudet« | »får muslimer dricka alkohol« 1,0 % p1.8 |
| `vad-ar-halalslakt` | description: the law answer is left open instead of stated | »vad är halal slakt« 0,8 % p1.7 |
| `/det-islamiska-aret` | title: start date only + »fastans längd i din stad«; description leads with the fast | »när är ramadan 2027« 0,3 % p3.0 (3c / 1 080i) |
| `vad-ar-kaba` | rescue: question title + six question H2s (vem byggde / när, Svarta stenen, vad finns inuti, dyrkar, hur många varv); crossword-chasing override removed | 90d: page 4 883i / 5c p8.8; »kaba« 2 246i p9.2; »vad är kaba« 157i p3.8 1c; »när/vem byggde kaba«, »vad finns i kaba« ~125i, 0c. Ignore »helgedom i mecka«, »här står kaba«, »kaba ort«, »sten i mecka«: crossword clues, unwinnable |
| `vad-ar-hijab` | new H2s »Hur ska en hijab se ut?« (hijab regler / hur bär man / hur ser en hijab ut, ~180i over 16 months) and »Vad är skillnaden mellan hijab, niqab och burka?«; FAQ rebuilt so it no longer repeats H2s: ålder, män, burka i Koranen, slöjförbud i Sverige (HFD 2022, riksdagssvar maj 2026) | 90d: »niqab« 408i p3.1 4c; »skillnad på slöja/hijab« ~92i ~1c; »burka« 118i lands on `vad-ar-ghusl`. Page already growing (3 → 93 clicks/week Jul → Sep) — watch that the addition doesn't dent »vad säger koranen om slöja« (p1.2, 14 %) |

All via `SVAR_SEO_OVERRIDES` (`apps/web/src/lib/svar.ts`) — the editorial H1 is untouched — except
the Ramadan page (`apps/web/src/pages/det-islamiska-aret.astro`). Also wired: 301
`/det-islamiska-aret/ramadan-2027` → `/det-islamiska-aret/` (GSC saw it; it 404'd).

**New page 2026-09-24:** `vad-betyder-inshallah`, split out of `vad-betyder-alhamdulillah`
(retitled »Vad betyder alhamdulillah och mashallah?«, inshallah H2s and keywords removed). Baseline,
90d to 2026-09-23: inshallah queries ≈5 800i / ≈17c at p5.7–6.3 on the combined page. Measure from
2026-10-22.

### Candidates with the same shape — checked against 90d GSC before listing

Most of the obvious follow-ups are **already owned** and are not new pages:
interfaith marriage → `aktenskap-i-islam` (has the H2, p9.8 on »får en muslimsk kvinna gifta sig med
en kristen man« — rescue with a title/H2 echo if it grows); divorce → `/fordjupning/skilsmassa`;
»hur många gånger ber muslimer« → `sa-ber-man-steg-for-steg` + `/bonetider/`; »hur många muslimer
finns det i Sverige« → `/fordjupning/islam-i-sverige` (19i landing on `vad-ar-hijab` instead — check why).

Genuinely unwritten, zero measurable demand today (we don't rank, so GSC can't show it) — write only
as ahead-of-the-wave pages, one per session:

- `ar-musik-haram` — »får muslimer lyssna på musik« / »är musik haram« (1i each on unrelated pages)
- `far-muslimer-ha-hund` — »islam hundar« (1i)
- `far-muslimer-tatuera-sig` — no impressions at all

---

## The demand map (90d, prayer-time / mosque / city / brand queries filtered out)

| # | cluster | i | c | pos | who ranks today |
|---|---|---|---|---|---|
| 1 | Ramadan/Eid 2027 dates | 6 985 | 35 | 3–5 | `/det-islamiska-aret` — 0.5% CTR |
| 2 | "islam" / "vad är islam" | 3 760 | 34 | 10–17 | homepage (p9.9); `/vad-ar-islam` sits at p39.1 |
| 3 | Offices & titles (kadi, imam, mufti, kalif) | 3 085 | 2 | 8–12 | the essay `/domaren-utan-svard` |
| 4 | Slöja — Swedish "varför" queries | 812 | 15 | 20–38 | nobody; `vad-ar-hijab` only wins the nouns |
| 5 | Halal/haram as a life-rule framework | 810 | 9 | 13–32 | nobody; `vad-ar-halalslakt` is slaughter |
| 6 | inshallah | 495 | 0 | 7–9 | `vad-betyder-alhamdulillah` (deliberate 3-phrase page) |
| 7 | mashallah | 482 | 1 | 4–7 | same page |
| 8 | Holy places (Mecca, Medina) | 277 | 0 | 10–40 | partly `vad-ar-kaba` |
| 9 | The Qur'an as a book (language, dating) | 103 | 0 | 21–31 | `vad-ar-koranen` (p21.5) |
| 10 | Islams människosyn | 94 | 0 | 27–42 | nobody |

---

## P1 — ⛔ WITHDRAWN 2026-08-15: every page below was already written

Checked against all 73 live pages (64 `/svar/` + 9 `/fordjupning/`). The list conflated *"we rank
badly for this query"* with *"we have no page for this query"*. Only the second justifies a new
text; the first is a rescue pass. **N1 shipped; N2–N5 must not be produced as new pages.**

| item | status | who already owns it |
|---|---|---|
| N1 `vad-ar-en-kadi` | ✅ shipped 2026-08-08 | measure from 2026-09-05 |
| N2 `varfor-bar-muslimska-kvinnor-sloja` | **already written** | `vad-ar-hijab` carries the H2, the keyword *and* the FAQ question verbatim; `/fordjupning/hijab` holds 24:31/33:59 |
| N3 `vad-betyder-halal-och-haram` | **already written** | `/fordjupning/halal` — titled "Halal och haram", keywords "vad betyder halal", "halal och haram" |
| N4 `vad-betyder-inshallah` | **already written** | `vad-betyder-alhamdulillah` — the title names all three phrases |
| N5 `vad-betyder-mashallah` | **already written** | same page |

N2 and N4/N5 remain defensible as deliberate *intent splits*, but not as two simultaneous ones —
and the phrase cluster now has a pillar ahead of it in
`.claude/skills/fordjupning-page/BACKLOG.md` (P1). Decide the pillar first, then the split.

The mandatory coverage gate that would have caught this is written up in that file. Run it before
adding any candidate here.

## P1 (withdrawn) — New pages, in order

### N1 · `vad-ar-en-kadi` — "Vad är en kadi (islamisk domare)?" — 3 085i / **2c**

The largest pure-waste pool on the site: "islamisk domare" alone is **2 105i at p9.1 with zero
clicks**. Fan-out H2s must cover the whole field of offices — **kadi, imam, mufti, kalif, emir,
shaykh** — because that is where the neighbouring queries sit ("muslimskt ämbete", "muslimsk
furste", "muslimsk riktning"). `related`: `de-rattledda-kaliferna`, `vad-ar-sharia`, `vad-ar-en-moske`.

⚠️ **This cluster is crossword-driven.** "muslimsk furste", "muslimskt ämbete", "kalif nr 4", "den
andre av kaliferna" are Swedish *korsord* clues. That does not disqualify it — the skill's mandated
answer-first bold definition (*"En kadi är …"*) is exactly what wins both the crossword click and an
AI-Overview citation. Decided with the user 2026-08-08: write it as genuine reference.

Side benefit: `de-rattledda-kaliferna` already takes "kalif nr 4" (99i) and "den andre av kaliferna"
(143i) at p7.8–8.7 with **zero clicks** — an internal link plus a sharper opening should fix it too.

### N2 · `varfor-bar-muslimska-kvinnor-sloja` — 812i / 15c

`vad-ar-hijab` wins the *nouns* ("hijab" p7.3, "niqab" p2.5) and loses the *why* completely:
"varför bär muslimska kvinnor slöja" p22.3, "varför bär man slöja" p38.0, "slöja islam" p21.6,
"koranen slöja" p27.7. Two intents, not one. The 2026-06-20 decision to solve this with a free
redirect to `vad-ar-hijab` did **not** hold — the position data says so. Pillar: `/fordjupning/hijab`.
Keep it clear of `vad-ar-hijab`'s ground (the garments, the terms): this page is about reasons, the
Qur'anic wording (24:31, 33:59), and the Swedish context.

### N3 · `vad-betyder-halal-och-haram` — 810i / 9c

Covers "vad är halal" (p14.3), "haram" (p12.9), "vad är haram" (p29.9), "islam levnadsregler"
(p16.8), "levnadsregler islam" (p32.1) — the general licit/illicit principle, entirely missing.
`vad-ar-halalslakt` stays the slaughter page; cross-link. Pillar: `/fordjupning/halal`.

### N4 · `vad-betyder-inshallah` — 495i / **0c** — run as a measurable split test

`vad-betyder-alhamdulillah` is **deliberately** a three-phrase page (title, `keywords`, FAQ and three
H2s all cover it) and ranks p6.5 overall. Splitting is a strategy change, not a bug fix, and
cannibalisation is a real risk. So split **one** phrase only, and make it inshallah: biggest volume
(495i) and worst position of the three ("inshallah betyder" p8.9, "vad betyder inshallah" p7.2),
while mashallah already sits p3.8–7.0. Let it settle **4–6 weeks**, then measure whether (a) the
inshallah queries lifted and (b) the parent held its own. Rewrite the parent as a hub toward the
split-off pages rather than gutting it.

### N5 · `vad-betyder-mashallah` — 482i — **conditional on N4**

Only if N4 measures positive. If it doesn't, the combined page was right all along — write *that*
finding into `SKILL.md`.

**Next tier, not in this series:** `islams-heliga-platser` (277i), `islams-manniskosyn` (94i).

---

## P2 — Rescue passes (no new files; edit `data/svar/*.md`)

**Age explains nothing here.** `vad-ar-ramadan` (p28.6), `vad-ar-koranen` (p21.5) and
`eid-al-fitr-och-eid-al-adha` (p21.9) were all published **2026-06-20** — the same cohort as
`vad-ar-ghusl` (p3.9) and `far-muslimska-man-ha-flera-fruar` (p3.8). It is page-level, so fix it.

| # | page | pos | diagnosis |
|---|---|---|---|
| R1 | `/vad-ar-islam` (the Fakta hub, `apps/web/src/pages/vad-ar-islam.astro`) | p39.1, 81i | The homepage takes "islam" (2 551i, p9.9) and "vad är islam" (p16.9) off the hub. Two pages fighting for the head term; both lose. Resolve ownership. |
| R2 | `vad-ar-ramadan` | p28.6, 273i | Worst-ranking of all 63 despite being a core question. Diff its structure against `vad-ar-ghusl`. |
| R3 | `eid-al-fitr-och-eid-al-adha` | p21.9, 80i | Two topics in one title — same diagnosis as the alhamdulillah page. Split candidate *after* N4 reports. |
| R4 | `vad-ar-koranen` | p21.5, 103i | Misses the whole "Qur'an as a book" tail: "när skrevs koranen" (p24.2), "vilket språk är koranen skriven på" (p30.6), "hur många sidor har koranen" (p21.7). Add fan-out H2s. |

---

## P3 — Work outside the answer pages

- **`/det-islamiska-aret` CTR rework.** 6 985i, 35c, position 3–5. Ranking is not the problem —
  Google answers the date in the SERP. Give a reason to click (Swedish dates, fasting length in
  hours at Swedish latitudes, printable calendar) in `<title>` and meta description. Best
  return-per-hour in this whole file.
- **Legacy leaks — ✅ DONE 2026-08-08 (wired, not yet shipped).** Five redirects added to
  `customRedirects` (`apps/web/astro.config.ts`): `/historia/den-islamiska-varlden-bilder` →
  `/vad-ar-islam/`, `/islam/islams-behorighetskrav` + `/guider/sa-blir-du-muslim-2` →
  `/svar/hur-blir-man-muslim/`, and the two remaining `/author/*` → `/om/redaktion/`.
  Deliberately left on the homepage 301: `/religion/pandoras-ask` (43i — ranks for the *Greek
  idiom*, nothing we cover), `/samlingsvolym.pdf` (1 088i of `filetype:pdf` and unrelated-phrase
  junk), and `/islam/foraldrar` + `/category/featured` + `/andra-religioners-syn-pa-gud`, which
  rank only for the brand query "islam.se" — the homepage is already the right answer.
  (`/islam/hur-skiljer-sig-koranen-fran-de-andra-skrifterna` turned out to have been wired since
  2026-07-28; the naive grep just couldn't see it. See the multi-line warning at the top.)
- **Small gap surfaced by that sweep:** nothing on the site answers **"hur många muslimer finns det
  i världen"** / "islams utbredning i världen" / "antal muslimer i Sverige". Low volume today
  (~60i, positions 20–54) and parked at `/vad-ar-islam/`, but it is a clean, citable-fact page if
  the tier above ever runs dry.
- **Investigate separately — do not disturb by accident:** `/islam-i-praktik/nar-ghusl-kravs` is a
  **301** that nonetheless carries **10 974i and 374 clicks — 8% of all site clicks** — at p3.4, and
  ranks for wholly unrelated queries ("iran", "marocko", "cap verde", "hushållspapper",
  "birgitta ed"). The site's single biggest traffic source sits on a URL that does not exist.

---

## Measurement

Baseline (90d to 2026-08-05): `/svar/` = **453c / 34 462i**; the five target clusters =
**~5 684i / 27c**. Measure no sooner than **28 days after each ship** — a shorter window measures
indexing, not ranking.

```bash
gsc query --dim query --filter "query contains domare" --start <ship+28d> --end <ship+56d>
gsc query --dim page  --filter "page contains /svar/"  --start <ship+28d> --end <ship+56d>
```

Helper: `~/.claude/skills/google-search-console/scripts/gsc` (note: it appends an `HTTP 200` line
after the JSON — pipe through `head -n -1` before `jq`).

Regenerate this file from fresh GSC data whenever a batch ships.
