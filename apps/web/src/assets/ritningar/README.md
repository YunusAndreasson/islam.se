# Ritningar

The site's own drawings — engraved vignettes in one hand: wood engraving in the manner of
19th-century book and catalogue xylography, printed in the type's own ink, with one flat
brass tint per drawing for the one thing that is gold. Each is one thing that is its
section, seen whole and standing alone on a short strip of hatched ground: headphones for
the podcast, a card drawer for the answers. `src/lib/ritningar.ts` lists them,
`src/components/Ritning.astro` draws them, and DESIGN.md (»The Drawings«) says where one
may stand, why the hand is engraving and why one object. Things and buildings only: no
people and no animals.

Each is drawn twice: `<name>.webp`, ink on white paper, for the light theme, and
`<name>-mork.webp`, the same vignette cut as a white-line engraving on black, for the
dark. On the page each paper is blended away into its ground (white multiplied, black
screened), so there is no frame in either theme. Never invert one for the other: a
tonal drawing inverted is a negative (the dark screen turns white).

One drawing also goes to print: `aret-tryck.jpg` is `aret.webp` (the telescope turned to
the new crescent) as a 760 px JPEG for the Ramadan sheet (`lib/bonetider/ramadan-pdf.ts`,
which sizes it by the opening's height). Typst embeds a JPEG as it is but unpacks a WebP,
43 kB against 385 kB in each of 272 PDFs. Remake it from the light drawing whenever that
changes:
`magick aret.webp -resize 760x -quality 82 -sampling-factor 4:2:0 -strip aret-tryck.jpg`.

## Making one

The `ritning` skill (`.claude/skills/ritning`) runs the whole chain; this is what it does
and why.

1. **Four to a sheet, one call.** Codex's image tool draws a landscape 3:2 sheet with
   four vignettes in an invisible 2×2 grid (768×512 cells). Four drawn together share
   one hand; drawn one by one they drift in weight. The reference attached to every call
   is a sheet of the front page's closing band (podden, appen, boken, skarmen: the
   drawings the user held up as the model on 2026-11-21), `-i`, so the prompt goes on
   stdin with `-`. A drawing that is shown large is made alone at 1:1 with the same
   reference: the Quran stand is about 500px wide on /vad-ar-islam/.

   ```bash
   codex exec --skip-git-repo-check -s read-only -C <tmpdir> -i <reference-sheet>.png - < prompt.txt
   # → ~/.codex/generated_images/<session id>/exec-*.png
   ```

2. **The brief.** Every prompt carries this block, then one line per cell naming the
   object and its one brass thing:

   ```text
   Create exactly one image with your image generation tool, then stop and reply with one short line.
   Use case: illustration-story
   Input images: Image 1 is a SHEET OF THIS SERIES — four engraved object vignettes (headphones on an open book, a phone, a closed book on loose sheets, a television in an entrance hall). Match its hand exactly: the same crisp wood-engraved line of even, deliberate weight, the same fine parallel-line tone, the same clean white lights, the same single flat brass accent — and above all the same way each drawing is ONE clear object (or a small group that reads as one thing) standing alone on the white paper, on a short strip of hatched ground with its soft cast shadow. Do not repeat its subjects.
   Asset type: more small engraved object vignettes in the same series, for the section openings of a calm Swedish literary website about Islam, set in a warm serif typeface. Each is shown between 110 and 230 pixels tall beside the section's title, so it must read at a glance as the thing it is.
   Style/medium: wood engraving in the manner of 19th-century book and catalogue xylography. Black ink on pure white paper. Crisp engraved lines of even weight; tone by fine parallel lines and short flicks; the lightest areas left clean white; a clean, bold silhouette that holds when small.
   The object (important): each vignette shows its object seen whole, in a gentle three-quarter view at eye level, with NO setting: no landscape, no room, no wall, no window, no trees, no grass or flowers, no sky, no horizon. Under it only a short strip of hatched ground or table top with its cast shadow, fading out to the sides, exactly as in Image 1. Nothing else around it.
   Restraint: engraved tone covers at most about half of the object; large surfaces stay mostly white with a few lines; never a dense hatched field.
   Accent: exactly ONE flat muted brass-ochre (#b8862f) laid as a flat tint under the engraved lines, like a hand-coloured print, on the one small thing named for each drawing — not metallic, no shine, no highlight, no glow, no light rays, never a solid block — and nowhere else.
   Everywhere: no people, no figures, hands or faces, no animals, birds or insects. No text, letters, numbers, signature, monogram or logos; anything that would carry writing or numerals is suggested by plain even strokes or plain tick marks only, never imitation letters or script. No paper texture, no paper edge, no border.
   Composition: ONE landscape 3:2 sheet divided into four equal cells in a 2×2 grid. The grid is invisible: no lines, no borders. Each cell holds one separate vignette centred in it, filling it generously but with clear white margin; nothing crosses the sheet's vertical or horizontal centre line. Compose each object wider than it is tall where the object allows it. All four by the same hand, at the same scale of mark and density: a matched series.
   Top left: … The <thing> alone is brass.
   ```

3. **The dark sheet** is an edit of the light one, so every line keeps its place. The
   band's own dark drawings, on a sheet, go with it as the second image:

   ```text
   Use case: style-transfer
   Input images: Image 1 is the EDIT TARGET — wood-engraved object vignettes in black ink on white paper. Image 2 is a sheet of the same series already cut as white-line engravings on black — match its translation exactly.
   Primary request: redraw Image 1 as the same vignettes engraved as WHITE-LINE engravings printed in warm white ink on pure black paper, by the same hand … keep each one standing on its short strip of hatched ground.
   How to translate: the engraved lines now carry the LIGHT, not the shadow. Lit surfaces are fine white lines laid close; shadows are left as black paper; hollows, undersides and dark screens stay black; open pages and paper are the brightest things … This is NOT a photographic negative. <what stays dark and what is brightest, per vignette>
   ```

4. **A detail is fixed by editing the cell**, not by drawing again: crop the cell, attach
   it, name the change and say »keep everything else exactly«. The phone's screen
   (near-black, the heaviest mark in the band, re-cut as a mid-tone, 2026-11-07) and the
   sundial (a row of letter-like marks on its plinth removed, and engraved lines laid over
   its gnomon, a flat brass cut-out that read as a sticker, 2026-11-21) were made this way.

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
   and screened on `#1d1912`, and then swapped into the real page. Reject a person or
   animal, letters or pseudo-script (zoom on plinths, labels and page headings: the
   sundial's plinth carried a row of them), more than one brass thing, brass as a solid
   block or as metal, scenery around the object, and anything that reads as clip-art.
   Mean ink belongs inside the series' band (6.6–18.7 % for the light files on
   2026-11-21).

## Before: the scenes (2026-11-07 – 2026-11-21)

The openings first carried engraved scenes after Bewick's tailpieces, each dissolving into
the paper in a soft oval: a fieldstone bridge between birches, a farmhouse door with the
key in its lock, a farmyard well, a gravel road with milestones, the new crescent over a
lake, a writing desk, a barometer by a rainy window, the Quran's stand on a table by a
window, a window with a prayer rug, a bench by a forest path. The user kept the closing
band and found these did not look good; DESIGN.md says why. The mosque drawing and the
upright barometer, both unplaced, are still in that manner. The files are in git history.

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
