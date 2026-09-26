# Ritningar

The site's own drawings — one hand throughout: graphite in the manner of J. M. W.
Turner's sketchbook studies, one ochre pencil per drawing for the one thing that is
gold. `src/lib/ritningar.ts` lists them, `src/components/Ritning.astro` draws them, and
DESIGN.md (»The Drawings«) says where one may stand. Things, buildings, landscape and
plants only: no people and no animals.

Each is drawn twice: `<name>.webp`, graphite on white paper, for the light theme, and
`<name>-mork.webp`, the same drawing in white chalk on black paper, for the dark —
Turner's own practice on toned paper. On the page each paper is blended away into its
ground (white multiplied, black screened), so there is no frame in either theme. Tried
and dropped for the dark theme: inverting the graphite (a negative — the dark screen
went white, the shadows glowed) and the graphite on a light sheet ("doesn't work").

## A new drawing

Generate the light one with the Turner page (below) and an existing drawing of the
series attached, so the hand carries over; then the dark one as an edit of it, with the
series' chalk drawing attached. `-i` takes several files, so the prompt goes on stdin.
Single drawings are square (1024 or 1254), one per call; three parallel runs take ~2 min.

```bash
codex exec --skip-git-repo-check -s read-only -C <tmpdir> -i turner.jpg -i podden.png - < light.txt
codex exec --skip-git-repo-check -s read-only -C <tmpdir> -i <light>.png -i podden-mork.png - < dark.txt
# → ~/.codex/generated_images/<session id>/exec-*.png  (may carry alpha: flatten first)
```

Light prompt, with the subject and its one ochre thing as the last line:

```text
Create exactly one image with your image generation tool, then stop and reply with one short line.
Use case: illustration-story
Input images: Image 1 is a STYLE reference — a page of J. M. W. Turner's pencil sketchbook. Image 2 is an existing drawing from the SAME SERIES this one belongs to — match its hand exactly: its loose, searching, redrawn contours, its soft hatching only where form needs weight, its amount of detail, its restraint and its single ochre accent. Do not copy either image's subject.
Asset type: a spot illustration that opens a section of a Swedish literary website about Islam; shown about 180 pixels tall beside the page title, on a warm paper-coloured page. The paper must be pure white so it can be multiplied away.
Style/medium: graphite pencil, quick and observed, unfinished at the edges, lots of open paper. Graphite only, plus exactly ONE warm ochre-gold coloured pencil used only where stated. Pure white paper, no texture, no paper edge, no border, no rectangle: the drawing fades out into the white. No people, no human figures, hands or faces, no animals or birds anywhere — only things, buildings, landscape and plants. No text, letters, numbers, signature or logos.
Composition: square 1:1, one drawing centred with generous white margin all around.
Subject: … The only ochre: …
```

Dark prompt (the edit): the same as the pair's below, with »Composition: square 1:1,
exactly as Image 1.«

Processing, as for the pair: flatten (white / black), `-fuzz 1% -trim`, `-level
0%,95%,0.8` for the graphite (paper haze to pure white, midtones deepened) and `-level
4%,100%,1.35` for the chalk (haze to pure black, midtones lifted), a 24px border in the
paper's colour, `-resize 'x720>'`, WebP q88. Check the corners read 255 and 0.

## How the podcast and app pair was made (2026-09-26)

Tried and dropped the same day: one-ink line drawings traced to SVG ("too simple"), and
graphite after Carl Larsson / Anders Zorn / John Bauer. The user then pointed to a page
of Turner's sketchbook (<https://kooness.com/wp-content/uploads/2025/05/unnamed-39.jpg>,
Tate) and asked for the phone to show the real app.

1. **Generated as a pair on one sheet** (separate calls drift in hand and weight) with
   Codex's built-in image tool, the Turner page and `../app/app-tider.png` attached as
   references. `-i` takes several files, so the prompt goes on stdin:

   ```bash
   codex exec --skip-git-repo-check -s read-only -C <tmpdir> \
     -i turner.jpg -i src/assets/app/app-tider.png - < prompt.txt
   # → ~/.codex/generated_images/<session id>/exec-*.png (1536×1024)
   ```

   The prompt (these are the first of two runs of it; a third, with the qibla
   compass on the screen, read more clearly at 70px but less like the app):

   ```text
   Create exactly one image with your image generation tool, then stop and reply with one short line.
   Use case: illustration-story
   Input images: Image 1 is a STYLE reference only — a page from J. M. W. Turner's pencil sketchbook. Image 2 is a CONTENT reference only — a screenshot of the real mobile app whose screen appears in the right-hand drawing. Do not copy either image's subject or layout beyond what is stated.
   Asset type: two spot illustrations for a literary website, in a band promoting a podcast of read-aloud essays (left) and the site's prayer-times app (right). Shown about 160 pixels tall on a warm paper-coloured page; the paper must be pure white so it can be multiplied away.
   Style/medium: graphite pencil in the manner of Image 1, Turner's sketchbook studies: quick, searching, slightly broken contour lines drawn and redrawn, soft loose hatching only where the form needs weight, the lightest touch elsewhere, lots of open paper, an unfinished, observed, living quality. Not a polished rendering. Graphite only, plus exactly ONE warm ochre-gold coloured pencil used only where stated. Pure white paper, no paper texture, no sketchbook page, no edges, no border, no ground rectangle; each drawing fades out into the white. No legible text, no letters, no numbers, no signature, no logos.
   Composition: landscape 3:2 sheet with exactly TWO separate drawings side by side, each centred in its own half with generous white margin, same scale, same hand: a matched pair. Nothing crosses the centre.
   Left drawing: a pair of over-ear headphones resting across the pages of an open book on the corner of a table; a narrow ribbon bookmark hangs from the spine, touched with the ochre-gold pencil.
   Right drawing: a modern smartphone standing upright, drawn in the same loose hand, its screen showing the app from Image 2 as a quick sketch: the map of Scandinavia's coastline, a long curved line sweeping across it, and below it a rounded card with a short list of six rows (rows suggested by small marks, no readable text). The screen is shaded with loose graphite for the app's dark theme, its lines left light. Only the curved line and one highlighted row of the list are touched with the ochre-gold pencil.
   ```

2. **Split and cleaned** with ImageMagick: flatten on white; cut at the sheet's empty
   column gap (not at the middle); `-fuzz 1% -trim` so only pure white goes (a wider
   fuzz shaved the vignette's faintest strokes into a straight edge); `-level
   0%,95%,γ` so the paper haze (245–254) becomes pure white — multiplied, the haze
   showed as a faint square on the tint — and the graphite's midtones deepen (γ 0.7
   for the book, 0.8 for the phone, whose dark screen already carries weight); a
   24px white border.

3. **One height, own widths**: the book is padded to a square, the phone keeps its
   width, both at the book's height, WebP q90. The component sizes them by height.

4. **The dark pair** is an edit of the chosen light sheet, so the composition holds:
   the light sheet as the edit target, the Turner page as style reference, three runs,
   the first kept. Processed the same way with black for white: flatten on black, cut
   at the gap, `-level 4%,100%,1.35` so the near-black haze is pure black (screened,
   it would show as a square) and the chalk's midtones lift (thin strokes at 160px read
   dimmer than text; at plain levels and 0.85 opacity the phone sank into the band), a
   24px black border, the book square.

   ```bash
   codex exec --skip-git-repo-check -s read-only -C <tmpdir> \
     -i light-sheet.png -i turner.jpg - < prompt-dark.txt
   ```

   ```text
   Create exactly one image with your image generation tool, then stop and reply with one short line.
   Use case: style-transfer
   Input images: Image 1 is the EDIT TARGET — a pair of pencil sketches: headphones on an open book on a table corner (left), and a smartphone showing a prayer-times app (right). Image 2 is a style reference only: a page of J. M. W. Turner's sketchbook.
   Primary request: redraw Image 1 as the same pair drawn with white and light-grey chalk on pure black paper, by the same hand, in the same loose, searching Turner-sketchbook manner. Keep the composition, the objects, their positions, sizes and angles as in Image 1.
   How to translate: with chalk on black paper you draw the LIGHT, not the shadow. Lit surfaces, edges catching the light and highlights are white chalk; shadows and dark areas are left as the black paper. The tonal relationships stay natural — this is NOT a photographic negative: the phone's screen stays dark (the app is in dark mode) with the map's coastlines, the list's rows and small icons picked out in thin light lines; the headphones' dark cushions stay mostly dark with their rims and the headband catching the light; the book's open pages are the brightest thing; the table corner is a few light strokes.
   Colour: the same single warm ochre-gold pencil as in Image 1, on exactly the same things — the ribbon bookmark, the curved line across the map, the highlighted row of the list — and nowhere else.
   Paper: pure flat black (#000000), no texture, no paper edge, no border, no vignette glow; each drawing simply fades out into the black at its edges. No text, no letters, no numbers, no signature, no logos.
   Composition: landscape 3:2, exactly the two drawings side by side as in Image 1, nothing crossing the centre.
   ```
