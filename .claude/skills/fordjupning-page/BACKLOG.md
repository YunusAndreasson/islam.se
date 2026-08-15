# `/fordjupning/` pillar backlog (GSC-derived)

Generated **2026-08-15** from 90-day Search Console data (2026-05-17 → 2026-08-12).
State at generation: **9 pillars live**, **64 `/svar/` pages live**, **2 466 pages in the sitemap**.
Numbers are 90-day `impressions` (i) / `clicks` (c) / impression-weighted average `position` (p).

> ## Read this before writing anything
>
> **The pillar layer has 2 impressions in 90 days.** Not two thousand — two. One on
> `/fordjupning/` and one on `/fordjupning/aktenskap/`. Meanwhile the 64 answer pages took
> **34 462i / 453c** in the same window.
>
> Of the nine pillars, published 2026-07-30 → 2026-08-03:
>
> | indexed | never crawled |
> |---|---|
> | aktenskap, doden, griskott, halal, ramadan | **abort, hijab, tvagning, kaba** |
>
> None has reached the 28-day measurement point, so **this is not evidence that pillars fail** —
> it is evidence that we do not yet know what a pillar earns. Every click estimate below is
> therefore **modelled from the answer pages' CTR curve, not observed from a pillar.** Treat the
> ordering as a ranking, not a forecast, and re-derive it once `ramadan` and `halal` have 28 days
> behind them (from ~2026-08-30).

## The coverage gate — mandatory, this is what the last backlog skipped

The `/svar/` backlog dated 2026-08-08 listed five "new pages" and **all five were already written**.
It conflated *"we rank badly for this query"* with *"we have no page for this query"*. Only the
second justifies a new text; the first is a rescue pass on the page that already owns the ground.

Before any candidate enters this file, run all three and paste the result into its entry:

```bash
# 1. Does a pillar already cover it?
ls data/fordjupning/

# 2. Does an answer page already own the exact query? Check TITLES AND KEYWORDS, not filenames —
#    `vad-ar-hijab` carries the keyword "varför bär muslimska kvinnor slöja" verbatim.
grep -l "<huvudfrågan>" data/svar/*.md
awk '/^---$/{n++;next} n==1' data/svar/*.md | grep -i "<huvudfrågan>"

# 3. Is the demand real, and is the bucket clean? Prayer-time queries contaminate everything —
#    "salat tider", "gbg salat", "husby moske bönetider" are tool traffic, not editorial demand.
gsc query --dim query --limit 300 --filter "query includingRegex <regex>" \
  --start <90d> --end <idag-3d> | head -n -1 | jq -r '.rows[]|[.impressions,(.position|round),.keys[0]]|@tsv' | sort -rn | head
```

Step 3 is not optional. Four of the first six clusters measured for this file were contaminated:
"bönen/salat" read as 3 656i until the prayer-time queries came out and left 850i; "moskén" read
as 3 536i and left 1 685i; "gudssyn/tawhid" read as 1 855i and turned out to be *mashallah* and
*inshallah* matching on the substring `allah`.

## Demand map — cleaned, tool queries removed

| # | cluster | i | c | pos | breadth | pillar today |
|---|---|---|---|---|---|---|
| 1 | Islamiska uttryck och fraser | 2 452 | 9 | p7 | 62 queries | none |
| 2 | Moskén som institution | 1 685 | 17 | p12 | 193 | none |
| 3 | Sunni och shia | 1 290 | 15 | p8 | 128 | none |
| 4 | Historia och kaliferna | 855 | 1 | p11 | 61 | none |
| 5 | Bönen (salat) | 850 | 29 | p10 | 69 | none |
| 6 | Koranen som bok | 697 | 5 | **p21** | 85 | none |
| 7 | Domedagen och livet efter döden | 541 | 3 | p7 | 25 | `doden` (angränsande) |
| 8 | Konvertering och shahada | 423 | 6 | p11 | 33 | none |
| 9 | Profeten Muhammed | 410 | 2 | **p21** | 80 | none |
| 10 | Jihad | 237 | 3 | p9 | 19 | none |
| — | Kvinnan i islam | 156 | 3 | p18 | 20 | `hijab` (bara slöjan) |

Held out deliberately: **halal**, **hijab**, **abort**, **äktenskap**, **döden**, **ramadan**,
**griskott**, **kaba**, **tvagning** — all nine have a pillar, and the biggest of those clusters
(halalslakt 608i p9, ghusl 958i p6) are theirs to win, not a new page's.

---

## The ten, in order of modelled click upside

Upside is `impressions × (CTR at target position − CTR today)` on a conservative curve
(p3 ≈ 5 %, p5 ≈ 3 %, p8 ≈ 1,5 %, p12 ≈ 0,8 %, p20 ≈ 0,3 %). Ranges are wide on purpose.

### P1 · Islamiska uttryck och fraser — 2 452i / **9c** / p7 → **+80–120c**

The largest editorial cluster on the site and the worst-converting: **0,37 % CTR**. Three phrases
share one answer page (`vad-betyder-alhamdulillah`, whose title carries all three) and it ranks
p4–8 on every one of them: *inshallah betyder* 473i p8, *mashallah betyder* 303i p7, *mashallah*
240i p4, *vad betyder inshallah* 223i p7, *vad betyder mashallah* 182i p5, *alhamdulillah betyder*
606i p5. A pillar can hold the whole vocabulary the spoke has no room for — subhanallah,
bismillah, astaghfirullah, salam alaikum, takbir, jazakallah — plus when each is actually said.
**Spokes:** `vad-betyder-alhamdulillah`, `vad-betyder-al-fatiha`, `trosbekannelsen-shahada`.
⚠️ The `/svar/` backlog wanted to *split* the three-phrase page (its N4/N5). Don't do both: a pillar
above it plus a split beneath it makes the cannibalisation unreadable. Pillar first, measure, then
decide about the split.

### P2 · Moskén som institution — 1 685i / 17c / p12 → **+30–50c**

The bare head term **`moske` sits at p15 with 327i** — the worst-placed high-volume noun on the
site. Around it: *hur många moskeer finns det i sverige* 60i p7, *moskeer i sverige* 42i p7, plus a
long tail of town+moské queries the directory serves. **This candidate has the largest internal-link
surface of any on the list** — the `/moskeer/` directory can point every one of its pages at the
pillar, which is also the cheapest available fix for the crawl problem at the top of this file.
**Spokes:** `vad-ar-en-moske`, plus the directory. Angle: the mosque as building, institution and
Swedish legal fact (bygglov, böneutrop, MUCF-statistik) — the directory keeps the addresses.

### P3 · Sunni och shia — 1 290i / 15c / p8 → **+30–45c**

128 distinct queries, so the demand is broad rather than spiky: *shia* 134i p9, *sunnimuslimer*
87i p3, *shiamuslimer* 60i p5, *sunni och shia* 52i p6, and the comparison intent the answer page
misses entirely — *är sunni eller shia strängast* 53i p7. `/svar/sunni-och-shia/` already takes
3 207i at p7 for **21 clicks**, which is the same thin-page-on-a-broad-topic pattern as the phrases
above. **Spokes:** `sunni-och-shia`, `de-rattledda-kaliferna`, `vad-ar-sufism`, `vad-ar-sunna`.

### P4 · Bönen (salat) — 850i / 29c / p10 → **+25–40c**

Already converts at 3,4 %, the best of any uncovered cluster — the intent is unusually good, so a
position gain pays more here than the impression count suggests. *hur ber man islam* 53i p4,
*bönen islam* 68i p10, *bönen islam steg för steg* 45i p4, *när ber muslimer* 42i p7, *hur ofta ber
muslimer* 39i p9. **Structural value is the real argument:** bönetiderna are the site's dominant
surface at well over 100 000 impressions and have no editorial text to link into. The calendar
page's fasting-length section (2026-08-15) is the first link of that kind; a pillar completes it.
**Spokes:** `sa-ber-man-steg-for-steg`, `tvagning-wudu`, `islams-fem-pelare`, `vad-ar-en-moske`.

### P5 · Historia och kaliferna — 855i / **1c** / p11 → **+20–35c, hög osäkerhet**

⚠️ **Crossword-driven, like the kadi page.** *helgedom i mecka* 239i p9, *den andre av kaliferna*
160i p8, *kalif nr 4* 148i p8 are Swedish korsord clues. The 2026-08-08 decision on `vad-ar-en-kadi`
was to write it as genuine reference anyway — the answer-first bold definition wins both the
crossword click and the AI-Overview citation. Same call here, but the estimate carries the widest
error bars in this file: one click on 855 impressions is either a huge opportunity or an audience
that never clicks anything. **Measure the kadi page first** (28 days from 2026-08-08 = 2026-09-05);
it is the cheapest available read on whether crossword traffic converts at all.
**Spokes:** `de-rattledda-kaliferna`, `den-islamiska-guldaldern`, `det-muslimska-spanien-al-andalus`,
`erovringen-av-mecka`, `vad-var-hijra`, `vad-ar-en-kadi`.

### P6 · Koranen som bok — 697i / 5c / **p21** → **+15–25c, sannolikt underskattat**

The largest orphaned spoke cluster on the site — **six answer pages, no pillar** — and the worst
positions: the bare term **`koranen` sits at p31**, *när skrevs koranen* p23, *vem skrev koranen*
146i p8. GSC can only report queries the site is already visible for, so a term we hold at p31 is
one where the measured impressions understate real Swedish demand badly. Angle: the book — its
compilation, language, dating, manuscripts, translation history into Swedish — not its theology,
which the answer pages hold. **Spokes:** `vad-ar-koranen`, `vad-betyder-al-fatiha`,
`forsta-uppenbarelsen`, `skrev-muhammed-koranen`, `koranen-och-tidigare-skrifter`,
`koranen-och-embryologi`.

### P7 · Domedagen och livet efter döden — 541i / 3c / p7 → **+10–18c**

⚠️ Scope this away from `/fordjupning/doden`, which owns burial, barzakh, the grave and Swedish
funeral law. This one is eschatology: the signs, the resurrection, the judgement, paradise and
hell. If the two cannot be told apart in one sentence, don't write it — make it a rescue pass on
`doden` instead. Note also that *den dagen är domedagen* (360i p5, 3 clicks) reads like a phrase or
lyric query rather than a religious one; verify the intent before building the page around it.
**Spokes:** `vad-ar-domedagen`, `vad-sager-islam-om-livet-efter-doden`, `vad-ar-odet-qadar`.

### P8 · Konvertering och shahada — 423i / 6c / p11 → **+10–15c**

*shahada* 94i p8, *shahada islam* 61i p5, *trosbekännelsen islam* 61i **p14**, *hur blir man
muslim* 38i p6. Modest volume but the highest-intent audience the site has — people deciding
something — and squarely the site's purpose. **Spokes:** `hur-blir-man-muslim`,
`trosbekannelsen-shahada`, `islams-fem-pelare`, `vad-ar-tawhid`.

### P9 · Profeten Muhammed — 410i / 2c / **p21** → **+8–15c, underskattat**

Same invisibility argument as Koranen, more extreme: **`profeten muhammed` p26, `muhammed` p21**.
A site about islam that does not rank for the Prophet's name is missing a load-bearing entity, and
entity coverage now matters more for AI citation than the impression count does. **Spokes:**
`vem-var-profeten-muhammed`, `forsta-uppenbarelsen`, `vad-var-hijra`, `erovringen-av-mecka`,
`vad-ar-sunna`, `skrev-muhammed-koranen`.

### P10 · Jihad — 237i / 3c / p9 → **+5–10c**

Smallest of the ten and the most sensitive. It earns its place because it is the question the
Swedish public actually asks about islam and because the answer page is thin against it. Factual
and fair, not polemical, per the orthodoxy guardrail. **Spokes:** `vad-ar-jihad`,
`vad-sager-islam-om-hedersmord`, `vad-ar-sharia`.

**Next tier, not in this series:** Kvinnan i islam (156i p18 — six spokes but the cleaned demand is
small once slöja and ghusl queries come out), Jesus och Bibeln (383i, heavily crossword:
*jesus i islam 3 bokstäver*), Zakat (82i p23).

---

## Not a pillar — but bigger than every pillar on this list

- **`islam`, the head term: 1 470i / 13c / p10.** The single largest editorial query on the site,
  and the fix is ownership, not a new page: the homepage takes it at p9,9 while
  `/vad-ar-islam` sits at p39,1. Two pages competing, both losing. Resolve which one is the hub
  before writing anything else — a pillar would make it three.
- **`/det-islamiska-aret`: 13 354i / 74c at p4.** Rewritten 2026-08-15 (title now leads with the
  dates, meta carries the fasting-length gap, and a computed per-city fasting table delivers it).
  **Measure from 2026-09-12.** If that rewrite moves CTR from 0,55 % to 2 %, it is worth more than
  the top three pillars on this list combined — and it took an afternoon.
- **Internal linking, the prerequisite.** Each pillar has **3–8 inbound internal links** on a
  2 464-page site, while `/fordjupning/` itself is linked from all 2 465 pages (the footer). The
  four uncrawled pillars are among the thinnest linked. Wiring spoke → pillar links across the 64
  answer pages costs one pass and plausibly fixes the crawl problem that makes this whole backlog
  hypothetical.

## Measurement

Baseline (90d to 2026-08-12): `/fordjupning/` = **2i / 0c**. `/svar/` = 34 462i / 453c.
The ten target clusters together = **9 440i / 90c**.

Re-derive this file when `ramadan` and `halal` pass 28 days indexed (~2026-08-30) — that is the
first honest read on what a pillar earns, and every estimate above should be corrected against it.

```bash
gsc query --dim page  --filter "page contains /fordjupning/" --start <ship+28d> --end <ship+56d>
gsc query --dim query --filter "query includingRegex <cluster>" --start <ship+28d> --end <ship+56d>
```

Helper: `~/.claude/skills/google-search-console/scripts/gsc` — it appends an `HTTP 200` line after
the JSON, so pipe through `head -n -1` before `jq`.
