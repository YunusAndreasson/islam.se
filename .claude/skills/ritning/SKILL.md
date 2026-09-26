---
name: ritning
description: Make a new drawing in islam.se's own series — Turner-sketchbook graphite with one ochre accent, drawn as a pair (graphite on white for the light theme, white chalk on black for the dark) — and place it on the site by the rules in DESIGN.md »The Drawings«. Covers choosing the place and whether a drawing belongs there at all, the motif and its one ochre thing, generating with Codex's image tool, processing, registering in lib/ritningar.ts, placing with <Ritning>, and measuring that it stands on its lines in both themes. Use when asked for "en illustration", "en ritning", "en teckning", "en bild till sidan/sektionen", "illustrera X", "rita något till …", or to replace or redo one of the existing drawings. Not for essay or fördjupning hero photographs (those are photographs, from the article pipeline), and not for charts in a text (article-charts).
---

# Ritningar — the site's own drawings

The essays and the fördjupningar carry photographs; the site's own sections speak through
a series of pencil drawings in one hand. The series began 2026-09-26 and the user shaped
every rule in it by review, so the rules below are decisions, not taste:

- **One hand:** graphite in the manner of J. M. W. Turner's sketchbook studies — quick,
  searching, redrawn lines, soft hatching only where form needs weight, much open paper —
  and **one** ochre pencil for the one thing that is gold (the ribbon, the barometer's
  needle, the new crescent, the lamp's flame).
- **Two papers, no frame:** each drawing exists twice, `<namn>.webp` (graphite on white)
  and `<namn>-mork.webp` (the same drawing in white chalk on black, made as an edit of the
  light one). `Ritning.astro` multiplies the white paper into its ground and screens the
  black one, so the drawing lies straight on the page in both themes.
- **What may be drawn:** things, buildings, landscape, plants. **Never people, never
  animals** — the classical position the site takes on drawn images of living beings. The
  Turner reference page is all figures; it is a style reference only.

Read `DESIGN.md` »The Drawings« (the contract) and `apps/web/src/assets/ritningar/README.md`
(how the pixels are made) before placing one. `apps/web/src/lib/ritningar.ts` lists every
drawing and where it stands.

**One drawing per request, shown to the user before it is committed. Never commit or
deploy unasked.**

---

## ⭐ First: the place — and whether a drawing belongs there

A drawing is placed by one of three rules, never by feel — the user's words were "make sure
it doesn't just look like something we threw at the pages". Decide the place before the
motif, because the place sets the format.

| Place | Rule | Format |
|---|---|---|
| **A section opening** — a hub's `PageHead`, a section's prose page, a front-page movement's head | Beside the ingress, in the column beyond the measure, **exactly as tall as the opening** (title's top line → the last line of its words), never under 7rem. Flush with the frame's right edge — or, in a movement built on its own grid, on that grid's line (Grunden: its third line). | **liggande** (3:2) — the space beside an opening is wider than tall |
| **Beside words in a band** (the podcast and app band, the barometer's introduction) | A 10rem column, flush right, the words starting on x 295 at 1440. A matched pair shares one 10rem box; a drawing alone is as tall as its words. | **staende** or **kvadrat** |
| **A centred page** (404) | On the page's axis, above the words. | **kvadrat** |

**Say no when the place is wrong** — and tell the user why:

- **A tool page** (/bonetider/, /moskeer/, a finder) opens on its tool. A drawing there
  floated over the tool's first button and pushed the title below every other section's.
  Its section's drawing goes to the section's prose page instead (/bonetider/metod/).
- **Next to photographs** (/moskeer/om/ opens on a gallery of real mosques; essay pages):
  a drawing competes with them. The mosque drawing (`RITNINGAR.moskeer`) exists and waits
  for a page that opens with words.
- **No words to stand beside:** a drawing opens a section that opens with words.

Size is never a free choice: it follows the words (visual hierarchy, common region). A
short opening gets a small drawing, a long one a large one. Proportion follows the place:
an upright object at an opening leaves an empty field beside it — make a landscape
composition instead (the hub's barometer stands beside a window; the upright one lives in
the front page's narrow column).

## The motif

- Say what the section **is**, as a thing in a Swedish room or landscape: a window at
  first light with a prayer rug (prayer times), the new crescent over a lake shore (the
  islamic year), a writing desk with an oil lamp (thinkers), open books joined by a
  thread (threads), the Quran on its wooden stand (the pillars and faith).
- **One ochre thing**, named in the prompt, and it should be the point of the drawing.
- **No text, no letters, no imitation Arabic.** A mushaf's lines are suggested by soft
  hatching only — generated pseudo-script on a Quran page would be disrespectful.
- **Don't repeat a motif** already in `lib/ritningar.ts` (two lake windows is one too many
  unless there is a reason).

Write the motif file — two lines:

```text
Subject: an open Quran resting on a carved wooden folding stand (rahle) on a low table by a window, soft morning light across the pages. The lines of script are only suggested by soft grey pencil hatching — no letters, no legible or imitation Arabic writing.
The only ochre: the small gilded headpiece ornament at the top of the right-hand page.
```

## Making it

The machine may be busy (the user runs heavy jobs): two variants in parallel is the
default, and every other step runs one at a time.

```bash
S=.claude/skills/ritning/scripts
$S/rita.sh ljus  <namn> liggande /path/motiv.txt 2   # → ~/.cache/islam-se-ritningar/<namn>/kontakt.png
$S/rita.sh mork  <namn> <variant>                    # → …/<namn>/par.png (light and dark side by side)
$S/rita.sh spara <namn>                              # → apps/web/src/assets/ritningar/<namn>(-mork).webp
```

**Look at every image before the next step** (Read the PNG). Reject and rerun when:
a person or animal appears; there is text or pseudo-letters; more than one thing is ochre;
it looks like clip-art or a polished render instead of a sketch; the paper has a frame or
texture. For the dark one: it must draw the *light* (pages bright, a dark screen stays
dark) — a photographic negative is a reject. `spara` prints the corners: 255 for the
light file, 0 for the dark one, or the paper will show as a square on the page.

`<namn>` is a short Swedish slug (`aret`, `vilse`, `barometern-bred`); the files overwrite
an existing pair of that name.

## Placing it

1. Register the pair in `apps/web/src/lib/ritningar.ts` — the two imports and a doc
   comment saying what it shows and where it stands.
2. Place it by its rule:
   - **A hub opening:** `<PageHead title="…" ritning={RITNINGAR.<namn>}>ingress</PageHead>`,
     or `ritning={…}` on `CollectionIndexPage`. More opening text under the ingress (a
     verse, a measurement line) goes in the `efter` slot so the drawing counts it:
     `<div slot="efter">…</div>`. PageHead draws only beside an ingress.
   - **Another opening** (a front-page movement's head, a prose page's header): copy
     PageHead's grid — the measure, then the drawing's column; a cell spanning the
     opening's rows with `position: relative; align-self: stretch; min-block-size: 7rem`,
     and inside it `<Ritning {...RITNINGAR.x} fyll sizes="…" />` (add `ankare="vanster"`
     to stand on a grid line). Keep any bottom margin out of the last row, or the cell
     runs past the text. `sizes` = the column's width.
   - **The band:** `<Ritning {...RITNINGAR.x} hojd={[7, 10]} bredd={[7, 10]} />` for a
     matched pair; `fyll` in a stretched cell for a lone drawing.
3. Update DESIGN.md »The Drawings« if the placement adds a case the rules did not cover.

## Checking it

```bash
cd apps/web && pnpm dev:stop && pnpm dev:bg      # ALWAYS after rewriting a component
node ../../.claude/skills/ritning/scripts/kolla.mjs /the/page/
```

`kolla.mjs` prints, for every drawing on the page, in both themes at 1440 and 390: the
image shown and its blend, whether its ground matches the ground under it, the drawn box,
and the first and last line of the words beside it. Read it as the rule says:

- **Opening:** drawn `y` top = words' top (±4), drawn bottom = words' last line (±4), or
  7rem when the words are shorter; right edge = the frame's edge (x 1323 on the 76rem
  canvas at 1440), or the grid line it stands on.
- **Band:** words start at x 295; the pair's two drawings share a height.
- `grund` must be `ok` everywhere, `bild` must be `laddad`.

Then **look** at the screenshots it writes (`~/.cache/islam-se-ritningar/_kolla/`), light
and dark: is the drawing on a line the eye can see, does it outweigh the title, is there an
empty field beside it? Numbers can be right and the page still wrong — the Grunden drawing
measured exactly on the canvas edge and still hung 400px from its words on a line nothing
near it drew. Show the user; mention the dev server was restarted.

Before a commit: `pnpm check`, `pnpm typecheck:web`, `pnpm test`. The production build and a
Zen check (the user's browser; `~/.claude/rules/browser.md`) when the machine is free.

## Pitfalls, each paid for once

- **Stale CSS:** the dev server paints a rewritten component's old styles — once the
  user judged "too dark" off a black-paper image multiplied by stale rules. Restart it.
- **A blend needs something under it** in its own stacking context: `Ritning` paints
  `--color-bg` under the image. A hover `transform` creates a context and flashes the
  paper as a square — no hover lift on drawings.
- **`fyll` sizes by `object-fit`, not auto + max-size:** with `srcset` an image's natural
  size is the `sizes` estimate, and a max-size only limits — the drawing stopped at
  288px in a 519px opening.
- **content-visibility:** a drawing in a front-page movement measures 0×0 until the
  movement is near the viewport; `kolla.mjs` scrolls to the movement first.
- **Codex:** the prompt goes on stdin (`-`), because `-i` swallows a trailing prompt as an
  image; stdin must never be left open or it waits forever. Never `pkill -f` a pattern
  that appears in your own command line.
- **Inverting a tonal drawing** for the dark theme makes a negative, and a light sheet on
  the dark page "doesn't work" — always the chalk edit.
