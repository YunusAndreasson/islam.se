# Ritningar

The site's own drawings — engraved vignettes in one hand: wood engraving in the manner of
Thomas Bewick's tailpieces and the Swedish book xylography after him, printed in the
type's own ink, with one flat brass tint per drawing for the one thing that is gold.
`src/lib/ritningar.ts` lists them, `src/components/Ritning.astro` draws them, and
DESIGN.md (»The Drawings«) says where one may stand and why the hand is engraving.
Things, buildings, landscape and plants only: no people and no animals.

Each is drawn twice: `<name>.webp`, ink on white paper, for the light theme, and
`<name>-mork.webp`, the same vignette cut as a white-line engraving on black, for the
dark. On the page each paper is blended away into its ground (white multiplied, black
screened), so there is no frame in either theme. Never invert one for the other: a
tonal drawing inverted is a negative (the dark doorway turns white).

One drawing also goes to print: `aret-tryck.jpg` is `aret.webp` (the new crescent) as a
760 px JPEG for the Ramadan sheet (`lib/bonetider/ramadan-pdf.ts`). Typst embeds a JPEG
as it is but unpacks a WebP, 43 kB against 385 kB in each of 272 PDFs. Remake it from the
light drawing whenever that changes:
`magick aret.webp -resize 760x -quality 82 -sampling-factor 4:2:0 -strip aret-tryck.jpg`.

## Making one

The `ritning` skill (`.claude/skills/ritning`) runs the whole chain; this is what it does
and why.

1. **Four to a sheet, one call.** Codex's image tool draws a landscape 3:2 sheet with
   four vignettes in an invisible 2×2 grid (768×512 cells). Four drawn together share
   one hand; drawn one by one they drift in weight. A sheet of the series is always
   attached as the reference (`-i`, so the prompt goes on stdin with `-`). A drawing
   that is shown large is made alone at 1:1 with the same reference: the Quran stand is
   about 500px wide on /vad-ar-islam/.

   ```bash
   codex exec --skip-git-repo-check -s read-only -C <tmpdir> -i <reference-sheet>.png - < prompt.txt
   # → ~/.codex/generated_images/<session id>/exec-*.png
   ```

2. **The brief.** Every prompt carries this block, then the composition and one line per
   cell naming the subject and its one brass thing:

   ```text
   Create exactly one image with your image generation tool, then stop and reply with one short line.
   Use case: illustration-story
   Input images: Image 1 is the FIRST SHEET of this series — match its hand exactly: the same crisp wood-engraved line of even, deliberate weight, the same fine parallel-line tone, the same clean white lights, the same soft irregular oval in which each scene dissolves into the paper, the same single flat brass accent. Do not repeat its subjects.
   Asset type: more small engraved vignettes in the same series, for the section openings of a calm Swedish literary website about Islam, set in a warm serif typeface — the kind of tailpiece a fine book prints at the end of a chapter, so the picture belongs to the typography. Shown between 130 and 230 pixels tall.
   Style/medium: wood engraving in the manner of Thomas Bewick's tailpiece vignettes and 19th-century Swedish book xylography. Black ink on pure white paper. Crisp engraved lines of even weight; tone by fine parallel lines and short flicks; the lightest areas left clean white; simple, clear masses that read when small.
   Restraint (important): engraved tone covers at most about half of each vignette. Skies, walls, table tops and backgrounds are left white or carry only a few widely spaced lines — never a dense hatched field behind an object. Every vignette dissolves on ALL sides into the white paper in a soft irregular oval: no straight cut edge, no rectangle, no border, no drawn oval line.
   Accent: exactly ONE flat muted brass-ochre (#b8862f) laid as a flat tint under the engraved lines, like a hand-coloured print, on the one small named thing per drawing — not metallic, no shine, no highlight, no glow, no light rays — and nowhere else.
   Everywhere: no people, no figures, hands or faces, no animals, birds or insects. No text, letters, numbers, signature, monogram or logos; anything that would carry writing is suggested by plain even strokes only, never imitation letters or script. No paper texture, no paper edge.
   Composition: ONE landscape 3:2 sheet divided into four equal cells in a 2×2 grid. The grid is invisible: no lines, no borders. Each cell holds one separate vignette centred in it with generous empty margin; nothing crosses the sheet's vertical or horizontal centre line. All four by the same hand, at the same scale of mark and density, eye level, middle distance: a matched series.
   Top left: … The <thing> alone is brass.
   ```

3. **The dark sheet** is an edit of the light one, so every line keeps its place:

   ```text
   Use case: style-transfer
   Input images: Image 1 is the EDIT TARGET — wood-engraved book vignettes in black ink on white paper.
   Primary request: redraw Image 1 as the same vignettes engraved as WHITE-LINE engravings printed in warm white ink on pure black paper, by the same hand …
   How to translate: the engraved lines now carry the LIGHT, not the shadow. Lit surfaces are fine white lines laid close; shadows are left as black paper; the sky is dark and quiet … This is NOT a photographic negative. <what stays dark and what is brightest, per sheet>
   ```

4. **A detail is fixed by editing the cell**, not by drawing again: crop the cell, attach
   it, name the one change and say »keep everything else exactly«. The milestone's brass
   (a flat slab that read as a sticker, laid under the stone's lines instead) and the
   phone's screen (near-black, the heaviest mark in the band, re-cut as a mid-tone) were
   made this way on 2026-11-07.

5. **Processing**, per cell (`spara` in the skill): flatten on white (black for the dark),
   re-ink the engraving in the type's own colour — the grey to `+level-colors
   '#1a1914',white` after `-level 0%,93%,0.95`, the dark sheet to `black,'#e8e5e0'` after
   `-level 6%,100%,1.15` — and lay the brass back over it unchanged (the pixels with HSL
   saturation over 24 %, opened and feathered); `-fuzz 3% -trim`; a 32px border in the
   paper's colour; WebP q86. The corners must read 255 and 0, or the paper shows as a
   square on the page. The four drawings of the front page's closing band (podden, appen,
   boken, skarmen) are then stood on a square of their own paper, on their foot
   (`-gravity south -extent`), so the four share one box and one foot line.

6. **Look before saving**, at the size it is shown: 135px tall multiplied on `#fff6e8`,
   and screened on `#1d1912`. Reject a person or animal, letters or pseudo-script, more
   than one brass thing, brass as a solid block or as metal, a hatched field behind an
   object, a hard edge, and anything that reads as clip-art. Mean ink belongs inside the
   series' band (9.7–18.9 % in November 2026).

## Before: the graphite series (2026-09-26 – 2026-11-07)

The first drawings were graphite after a page of Turner's sketchbook
(<https://kooness.com/wp-content/uploads/2025/05/unnamed-39.jpg>, Tate), each with a
white-chalk-on-black twin; one-ink line drawings traced to SVG and pencil after Carl
Larsson, Anders Zorn and John Bauer had been tried first and dropped. Made one or two at
a time over three weeks, they drifted into two hands (sparse in September, dense in
October), and at the size the pages give them the fine hatching read as grey fuzz. On
2026-11-07 three replacements were drawn as sheets of the same four subjects — the
Turner brief taken literally, pen and wash after Elias Martin, and the engraving — and
judged at 135px on the paper and in the real pages; the engraving held best at size and
in both themes, and the series was redrawn in it. The graphite files are in git history.
