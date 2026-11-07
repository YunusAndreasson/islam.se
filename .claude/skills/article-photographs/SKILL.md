---
name: article-photographs
description: Find free photographs and reproductions for islam.se texts — essays (data/articles/*.md), svar (data/svar/*.md), fördjupningar (data/fordjupning/*.md) — and set them inside the text as documentary figures. Script-first, no search agents: name the things the text names, query Wikimedia Commons by script, look through contact sheets yourself, hold every picture to the site's gates (Islamic appropriateness, photographic quality, free licence), crop and encode, let the user choose on a review page, then place with caption, credit and licence data. Use when asked for "bilder till texten/essän", "hitta fria bilder", "free images", "fotografier till fördjupningarna", "illustrera essän med foton", "en bild på X i texten", or to find a picture for a Pelare & tro card. Not for the site's own drawings (ritning), not for charts, tables or timelines (article-charts, article-tables), and not for the photograph that opens an essay or a Fördjupning page (feature-image).
---

# Photographs in the texts

Every essay, fördjupning and Pelare & tro card already has a picture at its top. What the
texts lack is the documentary figure **inside** the prose: the wall the paragraph describes,
the manuscript it names, the place where it happened. This skill finds those under a free
licence and sets them in.

It was built over two passes, and the method below is the one that worked:

| | Pass 1, 2026-10-10 | Pass 2, 2026-10-11 |
|---|---|---|
| How | 52 Haiku search agents | one script, my own eyes on contact sheets |
| Cost | about 5.8M Haiku tokens | about 40 contact sheets |
| Result | 101 proposals, 22 kept after I redid the judging, 20 used | 7 proposed, 7 used |

**Do not fan out search agents.** Given a whole text an agent proposes »a Qur'an folio« for
everything; its identifications are wrong often enough that each must be redone (an Abbasid
dinar called Umayyad, a grammar called fiqh, »1280« that was 1280 AH); and you only ever see
what it chose to keep. The script shows everything that passes licence and size, with dates
and coordinates, and the looking is the part that cannot be delegated anyway.

**Nothing is placed before the user has chosen. Never commit or deploy unasked.**

---

## ⭐ First: what the text names

A figure is of **the very thing its paragraph names**, or it is decoration. Read the text
and list the named things: a place and a date (al-Shifa, Beit Lahia, Bokmässan 2016), an
object (the Birka ring, the Birmingham leaves, 1734 års lag), an event (the tent, the
hearing). Those are the targets. A picture that is merely on the subject is a no.

Say no, and tell the user, when:

- **The text names nothing that can be photographed.** An essay of argument may want none.
- **Nothing free exists.** Say so on the review page under »Not found«; do not substitute
  something nearby without saying what it really is. (The famine of summer 2025 had no
  free picture; a boy carrying food in January 2025 went in with that date in its caption.)
- **The section is full.** One figure a section is plenty; never two with fewer than two
  paragraphs of prose between them, and never against a chart, a table or a timeline.

## The gates — every picture, no exceptions

**A. Appropriate.** The user's first condition was that each picture is *looked at* for this.

- No drawn, painted or sculpted living beings: no miniatures, no murals of people, no
  hand-painted portraits on placards, no statues. Photographs of people are allowed when
  they are at a distance or plainly documentary; a person is never the ornament.
- No depiction of prophets, their families or the companions, in any form.
- Nothing shia or sufi: shrines, Ashura, grave veneration, and objects whose inscriptions
  you cannot read with certainty (an Ilkhanid coin of Öljaitü, a Qajar contract). No
  Ahmadiyya mosques. Coins only when purely epigraphic.
- No AI-generated images, ever, in this series.
- **Gaza and the genocide:** ruins, objects, writing on walls, people seen from behind or
  far off. No bodies, no shrouds, no wounded, however free the licence. Nothing credited to
  the Israeli army or a government press office (`exclude` in the target). Nothing with a
  news agency's logo burnt into the frame.

**B. Good enough for the page.** At least 1400 px on the long side. No display-case
glare, no snapshots of signs, no watermarks, no tilted phone pictures of a framed print.
Be harsh: the page is better without a figure than with a weak one.

**C. Free.** Public domain, CC0, CC BY, CC BY-SA. Never NC or ND. The licence is read back
from the Commons API by `prepare.mjs`, never taken from a search result or a description.

## Finding them

Work files live in `~/.cache/islam-se-bilder/<run>/` (`BILDER_WORK` to move it) and are
never committed. Give the run a short name (`gaza-essaer`, `fordjupningar-2`).

```bash
S=.claude/skills/article-photographs/scripts
mkdir -p ~/.cache/islam-se-bilder/<run>
python3 -I $S/commons.py cats "Al-Shifa Hospital" "Göteborg Book Fair 2016"   # which categories exist
# write ~/.cache/islam-se-bilder/<run>/targets.json: one target per named thing
python3 -I $S/commons.py harvest <run>                                        # query, filter, thumbnails
python3 -I $S/commons.py sheets  <run> <target> …                             # → sheets/<target>-N.jpg
python3 -I $S/commons.py list    <run> <target> 3 17-21                       # what those numbers are
python3 -I $S/commons.py look    <run> <name> <target>:3 <target>:17           # finalists at 960 px
python3 -I $S/commons.py exif    <run> <target>:3                             # date, coordinates
```

`targets.json` (every field is explained at the top of `commons.py`):

```json
[{"id": "ord-sjukhus", "what": "al-Shifa, Nassersjukhuset",
  "sources": [{"cat": "Al-Shifa Medical Complex", "depth": 1},
              {"q": "Shifa hospital Gaza destroyed"}],
  "since": "2023-10-07", "cap": 60,
  "exclude": "idf|israel defen[cs]e forces|spokesperson|government press office"}]
```

**Read every sheet** (the Read tool, one image per 48 pictures at the default cell). Note
numbers, then `list` them: titles are often »IMG 3876« and the description is all you get.

What two passes taught about searching:

- **A category must be the subject.** Walking a broad parent (»Humanitarian crises of the
  Gaza war«, depth 2) read 1,200 files about something else. Use the subject's own
  category, a photographer's category, or a named search.
- **Search fails on specifics.** »Belongings in rubble« returns nothing; the picture existed
  under the title »IMG 3876«. When a subject's free pictures are one archive, harvest the
  whole archive (`cap` high, no `must`) and look through all of it. For Gaza that archive
  is *Photographs by Jaber Jehad Badwan*: 721 files, CC BY-SA 4.0, dated and often
  geotagged. All but one of Hla Bashbash's 458 uploads are under 1400 px.
- **Start from the collection for objects.** What has held up: the Khalili Collections
  (Sadiq Bey's 1880 photographs), Chester Beatty, Cadbury Research Library (the Birmingham
  leaves), the American Numismatic Society, the V&A, the Library of Congress (American
  Colony), Statens historiska museer and Nordiska museet. Find the file on Commons and
  credit the collection.
- **Not on Commons, checked 2026-10-11:** the famine of summer 2025, the ICJ hearings, the
  NAZA premiere, Demokratitorget; Swedish Qur'an translations' title pages, Muslim burial
  quarters in Sweden, a Nordic new moon, the bright night at Kiruna. The Göteborg Book Fair
  categories are almost all author portraits. Tell the user; their own camera or a request
  to the institution is the way to those.

## Proving a picture is what the caption will say

Before a picture goes on the review page:

- **Date and place from the file, not the title:** `commons.py exif`. Coordinates settled
  al-Shifa, Beit Lahia and Deir al-Balah; a date settled »four months before the programme
  was known«. No EXIF means the caption claims only what the description states.
- **Read what is written in it.** Open the full frame from `look/big/` (fetch a larger one
  with `--width 1920`) and read the inscription, the page, the sign. The wall read »Where
  is my father«; the leaf was sura Yā Sīn 36:13–26. Never caption text you have not read.
- **Distrust the identification.** Dynasty, date, manuscript and place are what goes wrong:
  check a coin's caliph and mint, whether a year is hijri, whether a »close-up of the Kaaba«
  is the Kaaba.
- **The caption says only what this proves.** Place, date, what is seen. A picture made at
  another time than the event the paragraph describes says its own date.

## Processing

Write `<run>/final.json` (fields at the top of `prepare.mjs`), then:

```bash
node $S/prepare.mjs <run>          # → final/<id>.webp, final/forslag.json
```

- `id` is the file name: Swedish, lowercase, what it shows and when
  (`al-shifa-sjukhuset-februari-2025`).
- 1400 px wide; an upright picture 1100; a card picture 1800. WebP q80: 90–370 kB.
- `crop` is fractions of the frame. Crop to the subject and away from window smears,
  mounts and passers-by who are not the picture.
- `saturation` only to pull back a colour cast (a phone through tinted glass: 0.78).
  No other grading: these are documents.
- **Alt text** describes what is seen, for someone who cannot see it. No » « in it (the
  house linter reads it as prose) and no double quotes.
- **Caption:** place and date first, then the one thing the reader needs. In the Gaza
  texts never »krig«. A translation of writing in the picture is given plainly.
- `verdict`: `use` for what you recommend, `maybe` for what the user should weigh; put
  the reason in `note` (»gives the paper's banner room on the page; your call«).

## The user chooses

```bash
# write <run>/page.json: this round's words — what was cut, what was not found (format: top of gallery.py)
python3 -I $S/gallery.py <run>                     # → <run>/bildforslag.html
```

Publish it with the Artifact tool (`capabilities: {"db": {}}`, private) and give the link.
Each picture stands beside the paragraph it would follow, with caption, alt text, credit,
source, and Use / Maybe / No. The margin says **what was cut and why** and **what was not
found**; that honesty is what lets the user trust the rest. The user pastes back a list.

Two offered as alternatives for one place may both be taken. Find the second place rather
than asking, and say where it went.

## Placing

```bash
python3 -I $S/place.py <run> --dry-run <id> <id>   # read what it prints
python3 -I $S/place.py <run> <id> <id>
```

`place.py` copies the file to `apps/web/src/assets/images/inline/`, sets the figure line
after the anchor paragraph, and adds the licence to `apps/web/src/data/image-credits.json`.
A card picture goes to `images/fakta/<slug>.webp`; the file is the whole wiring.

- **Read the paragraph the figure will stand before.** `place.py` prints it. A figure must
  not split a thought: one stood between »Kanske är hon …« and »I så fall …« and had to move.
- **Write the credit by hand**, in the page's own source apparatus, never under the picture:
  - an essay: in the note that already credits pictures, else note 1. »Bilderna i texten:
    Jaber Jehad Badwan, Gaza, [22 februari 2025](commons-url), licens [CC BY-SA 4.0](deed-url);
    … Samtliga via Wikimedia Commons, beskurna eller färgbearbetade.« Say what was changed.
  - a svar or a fördjupning: a `sources:` entry, `name: "Bild: tältstaden Mina, november
    2011. Foto Arisdp, Wikimedia Commons, licens CC BY-SA 3.0"` with the Commons page as
    `url`; »Bild överst:« for the card picture; »(fri från upphovsrätt)« for public domain.
- Everything else is automatic for a file under `images/inline/`: the `<figure>` and its
  caption, a `srcset` (480/720/960/1400), the ImageObject with licence in the structured
  data, the entry in `sitemap-images.xml`, the published URL in the Markdown twins.

**Set `updatedAt` on every page you change.** The sitemap's `<lastmod>` and the page's visible date read it. The 2026-09-25 language pass and two photograph rounds did not, and 88 of 89 pages told Google they had last changed months before they had.

## Checking

```bash
pnpm -w test --project web && pnpm -w lint:house           # registry test, house rules on alt and caption
cd apps/web && pgrep -fa "astro.*build"                    # nobody else building? then:
BONETIDER_SAMPLE=12 pnpm exec astro build --outDir dist-bild
python3 -I ../../$S/check.py dist-bild /<essay-slug>/ /svar/<slug>/ /fordjupning/<slug>/
rm -r dist-bild
node ../../$S/shots.mjs /<essay-slug>/                     # then Read the screenshots
```

`check.py` holds each figure to a caption, a srcset, licence data, the image sitemap, no
pull quote against it and no repository path in the output. `shots.mjs` shows each figure
with the paragraphs around it at 1280 and 390: look at them. Numbers can pass while a
figure sits on top of a display quote.

Run `pnpm -w verify` before finishing when no other session is building in the tree.

## Pitfalls, each paid for once

- **Judging »absent« from cut output.** I told the user seven photographs had no credit;
  the credit sat at the end of a long footnote and my grep was piped through `cut`.
  Read the whole note before saying a credit is missing.
- **A credit line under the picture.** Built, then removed: the house puts it in the notes.
- **A pull quote against a photograph.** `rehype-pull-quote` now refuses a gap beside a
  lone image, but a page rendered before that fix keeps its old markup until the text
  changes or the content cache is cleared; `check.py` finds it.
- **The dev server lies about plugins.** It keeps the rehype chain it started with and is
  shared with other sessions: never restart it, and judge plugin behaviour in a build of
  your own (`--outDir dist-bild`, 15 seconds with the sample), never in `dist`.
- **A generator batch without imageinfo.** The Commons API can list a page before its
  metadata arrives; `commons.py` waits for the complete copy. Do not »simplify« that.
- **Thumbnail widths.** Commons serves fixed steps (330, 960, 1280, 1920, 3840). Other
  widths are refused or throttled.
- **The user's address is not a User-Agent.** The scripts identify as the site.
