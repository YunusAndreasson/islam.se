# Design Principles — islam.se

This document defines the visual and interaction philosophy for islam.se. Every design decision flows from these principles. When in doubt, return here.

## What This Site Is

islam.se publishes long-form literary essays that place Islamic intellectual tradition in conversation with Swedish cultural heritage. The primary audience is Swedish readers unfamiliar with Islam — people who read DN Kultur or SvD Under Strecket, who value careful prose, and who will leave the moment something feels preachy, amateurish, or cluttered.

The content does the heavy lifting. The design's job is to set the mood and then disappear.

## The Single Design Metric

**Time spent reading.**

Not time on page (that rewards confusion). Not pages per session (that rewards clickbait). The design succeeds when a reader starts an essay and finishes it — when nothing in the visual environment pulled them out of the text.

Every element must answer: *does this help the reader stay in the essay, or does it interrupt?*

---

## Principle 1: Artwork Opens the Publication

Artwork gives each essay its emotional register. Preserve the commissioned, essay-specific imagery and its Swedish cultural setting. Text-only essays must feel equally complete.

### The Startpage — »Dagen och texten« (product decision, 2026-09-25)

The front page was correct everywhere and memorable nowhere: ten movements in one tempo, each opened by the same tracked-caps kicker and closed by the same hairline (48 rules, 66 capitalised labels on one page), inside a 64rem column that left half a wide screen empty. The site's two assets no other Swedish publication has — the islamic day (prayer times, the hijri date, the sun) and the conversation between two traditions (tänkare × essäer × trådar) — were drawn as grey lists. The redesign makes those two things the page's identity. The wordmark already held the idea: ISLAM●SE, a sun between two words.

The sequence, top to bottom (new-reader priority, product decision 2026-09-26):

1. **The orientation line** — one sentence saying what the site is, becoming »Fortsätt läsa …« for a returning reader with an unfinished essay.
2. **The lead and an index** — preserve the full-width 5:2 desktop cover and its two-thirds lead / one-third recent-essay index. On a phone: kicker, headline, photograph, deck, then the index. The six doorways follow only at widths ≤900px, matching the mast's collapsed navigation; wide touch devices keep the inline mast links without duplicating the doorways.
3. **Grunden** — »Vad är islam?« immediately follows the opening group, on its own tinted ground: the five pillars as full-width glossary rows (number, Swedish name, transliteration and gloss), then the six articles of faith. No Arabic script at the ends of the rows: it added competing weight without adding meaning beyond the transliteration (user review, 2026-09-25). It shared one tinted region with Fördjupning until 2026-09-27; that read as one crammed 2 550px block straight after the cover (»intryckt«, user review), so the two are now adjacent movements on two grounds.
4. **Fördjupning** — immediately follows Grunden (introductory facts, then depth), as its own movement on paper. Four illustrated cards, two by two on desktop and a sideways row on a phone; the user likes these pictures at this size (2026-09-27), so the separation is made by ground, not by shrinking them. The heading owns one `--space-unit` gap above the cards; card padding must not double it. Desktop card rows retain twice `--space-unit` between entries.
5. **The live row** — news and the Islamic year side by side, on one tint. Preserve the sans voice for quoted news, Literata for the site's own writing and three phone headlines. With no news (a blocker, no JavaScript) the year takes the whole row, its three dates in thirds. The live row precedes the departments in both DOM and visual order, with no CSS reordering.
6. **The departments** — three ämnen, each with a 3:2 photograph and two essays, sharing rows so pictures, titles and separators align. The lead and recent essays remain excluded.
7. **Teman as routes** (code: `TradarHome`) — ordered stops for the essays, with read stops filled from localStorage.
8. **Tänkare as a dialogue** — the two traditions in facing columns joined by their shared essays; preserve the existing diagram and hover behavior.
9. **AI-barometern** — its own movement on paper: the introduction with the barometer drawing beside three findings, one finding on a phone. It stood under the news and the year until 2026-09-27; three voices on one tint read as crammed. It sits here, before Praktiskt, because the mast groups it with Bönetider and Moskéer.
10. **Praktiskt** — the four tools beside the static map of Sweden; the prayer-day horizon stays beside Bönetider.
11. **The closing promotions** — podcast and app in the first row, the book and the mosque screen in the second (the screen beside the book since 2026-10-04, on the same two halves), on one ground: paper since 2026-09-27, the last step of the alternation, with the footer's rule under it. The wrapper owns one `--space-section` gap between rows. Keep each promotion's heading, drawing, copy and destinations. This shared region groups ways to take the publication and tools elsewhere. On phones the promotions stack; at 768–1023px podcast/app remain two columns with drawings above the words; from 1024px their 10rem drawing columns sit beside the text. This avoids the previous 147px text columns at 768px. The book retains its full-width row.

**Why this order.** At 390px, the previous page placed »Vad är islam?« around 6,374px down, after the promotions, live material and topic collections. The agreed priority is new readers. Keep the distinctive editorial opening, then place foundations and deeper explanations together before secondary discovery and promotions. Proximity communicates the relationship between introduction and depth; order communicates priority. This supersedes the earlier decision to promote podcast/app directly under the cover.

**One pair of margins — the mast's — and one tint, alternating.** Keep the 76rem canvas (`--canvas-width`), existing warm paper and one `--ground-tint`, with content aligned to the mast. The grounds alternate by movement: paper (the cover), tint (Grunden), paper (Fördjupning), tint (the live row), paper (Ämnen and Teman), tint (Tänkare), paper (AI-barometern), tint (Praktiskt), paper (the closing promotions, then the footer under its rule). Every change of ground is a boundary, so no rule or ornament is needed between movements, and **no tint holds two sections** — the one exception is the closing wrapper, which gives the podcast/app row and the book one ground because they are one group. Two shared tints (Grunden + Fördjupning, 2 550px; Ämnen + Teman + Tänkare, 1 750px) and the barometer as a third voice in the live row were removed on 2026-09-27 for reading as crammed. A new movement takes the next ground in the alternation or says why not. Preserve the restrained palette and artwork; no dark band, new color or new ornamental divider — the one ornament a room carries is its cornice (»Stuckatur« below), which marks the room the tint already marks.

**One grid.** Every multi-column movement uses one gutter, `--grid-gutter` (3rem), so the columns fall on shared lines: halves turn at the canvas's centre (the podcast and app band, the live row, the barometer, Fördjupning, Praktiskt's second tool column), thirds at a third (the lead's index, Ämnen, Grunden, Teman). Three gutters were in use until 2026-09-26 and put the thirds of three movements 5–10px apart. A new movement takes the gutter and one of the two lines, or says why not.

**One rank, one ink, one size per role.** Card and list titles are `--color-text` whether the component is the page's own or a shared list (editorial.css); essay meta lines are `--step--3` everywhere on the page; a head-row link (beside a kicker or a department name) is `--step--3` muted, a link that closes a block is a `.section-link` at `--step--2` — never the two sizes side by side for the same job. Literata's discretionary ligatures (c‿h, s‿t) belong to the lead's display headline only; at card-title size they read as a rendering fault. Kickers are one box whether `<p>` or `<h2>`, so kickers set side by side meet on one line.

Do not replace this publication with a generic promotional landing page or reorder its priorities without a product decision.

Use two image roles on the front page: the cover (5:2 across the canvas, the lead's words under it — the only picture on the first screen) and the 3:2 card (one picture per department, Fördjupning), always at the full width of its column with its title beneath. No thumbnails hung off the side of a text row on the front page — rows of small dark boxes were the one place the pictures looked pasted on (user review, 2026-09-25). Collection pages keep their compact thumbnails. Keep consistent crops within each role. The photograph has its own space; titles and introductions remain readable outside it. Quiet tonal treatment is sufficient: no competing lift, zoom, and vignette animation.

### Article Openings

Title, introduction, metadata, artwork, and optional listening controls lead into the prose. Heroes are responsive and optional; they do not occupy a mandatory full viewport. Caption spacing belongs to the image. Artwork never follows the reader down the page.

### The Drawings — the site's own hand (2026-09-26)

Photographs belong to the essays and the fördjupningar; the site's own sections speak through a series of pencil drawings, one hand throughout: graphite in the manner of J. M. W. Turner's sketchbook studies, quick and searching, much open paper, and **one** ochre pencil per drawing for the one thing that is gold (the ribbon, the app's arc, the barometer's needle, the new crescent, the lamp's flame). `src/components/Ritning.astro` draws them; `src/lib/ritningar.ts` lists them; `src/assets/ritningar/README.md` holds the prompts and the processing, so a new one is made in the same hand (always with an existing drawing of the series attached as reference).

- **What may be drawn.** Things, buildings, landscape, plants. **No people, no animals** — the classical position the site takes on drawn images of living beings. Swedish where the subject allows it (the lake at first light, the farmhouse barometer, birches and pitched roofs).
- **Two papers, no frame.** Each drawing exists twice: graphite on white for the light theme, the same drawing in white chalk on black for the dark (an edit of the light one, so the composition holds). The white paper is multiplied into its ground and the black one screened, so the drawing lies straight on the page in both themes. The drawing carries its own ground (`--color-bg`, which the tinted bands re-point) because blending needs one inside its stacking context. Inverting one drawing for both themes made a negative, a light sheet on the dark page "doesn't work", and chalk at reduced opacity was "too dark" (user review, 2026-09-26).
- **Where, and on which line.** A drawing is placed by one of three rules, never by feel ("so it doesn't look like something we threw at the pages", 2026-09-26):
  1. *A section opening* — a hub's PageHead, a section's prose page (/bonetider/metod/), Grunden on the front page: the drawing stands in the column beyond the measure, flush with the frame's right edge (the edge the content below ends on). A movement built on a grid of its own stands it on that grid instead: Grunden's drawing starts on its third line (x 950 at 1440, where the articles' third column starts below) — on the canvas edge it hung 400px from its words on a line nothing near it drew (user review, 2026-09-26). **Only beside an ingress:** a tool page (/bonetider/, /moskeer/) opens on its tool, and there the drawing floated over the tool's first button and pushed the title below where every other section's stands.
  2. *A drawing beside words* — the podcast and app band, the AI-barometern's introduction, and the book and the mosque screen at the page's close on the front page: a 10rem column, the drawing flush right in it, the words starting on the same line (x 295 at 1440) down the page; on a phone the drawing stands above the words at 7rem. The band's two are a matched pair, one 10rem box for both; a drawing alone beside its words is as tall as they are, like an opening's — the upright barometer then fills its column from the ingress's first line to the link's, on the kicker's line (in a 10rem box it stood 96px wide, 64px in from that line: "doesn't look correctly aligned", 2026-09-26). The book shares the closing region with the podcast and app, so it takes the pair's box, not its words' height: the same desktop column and drawn-object grammar. At tablet widths the paired promotions place their drawings above the words to preserve a useful text measure.
  3. *A centred page* (404): on the page's own axis, above the words.
- **Size follows the words (visual hierarchy, common region).** In an opening the drawing is exactly as tall as the opening: from the title's (or kicker's) top line to the last line of its words — the ingress, and on /vad-ar-islam/ the verse, on /ai-barometern/ the measurement line, which is why PageHead has an `efter` slot. It is never under 7rem. Drawing and words then share their top and bottom lines and read as one unit, and a short opening gets a small drawing, a long one a large one, so the page's own hierarchy sets the size: Teman's one-line ingress 112px, Tänkare's three lines 166px, /vad-ar-islam/'s title, ingress and verse ~500px. Built exactly: the drawing fills a cell spanning the opening's rows (`Ritning fyll`, `object-fit: contain`) and adds no height of its own. A fixed 11rem box outweighed a one-line ingress, stopped halfway down a five-line one, and left a third of /vad-ar-islam/'s opening empty ("consider the size … visual hierarchy, gestalt … so it looks balanced", 2026-09-26). Keep any bottom margin out of the opening's last row, or the cell runs past the text (/bonetider/metod/'s lead had one).
- **Proportion follows the place.** The space beside an opening is wider than tall, so an opening's drawing is composed landscape (about 4:3 to 3:2). The upright barometer stood 140px wide there with a 400px empty field beside it; the hub has its own landscape version (the barometer beside a window, weather moving in), and the upright one stays in the front page's 10rem column, where upright fits.
- **Not placed:** the mosque drawing (`RITNINGAR.moskeer`) — /moskeer/ opens on its tool and /moskeer/om/ on a gallery of real mosques, where a drawing would compete with the photographs. It waits for a page that opens with words.

### Stuckatur — the Swedish room (2026-09-27)

The user asked for "a little feeling, only extremely subtly, something typically Swedish, stucco-like". The answer is the ornament of the Swedish flat the site is read in: a Gustavian ceiling rosette (*takrosett*, eight pointed leaves in a ring of sixteen pearls) and the bead-and-reel moulding (*pärlstav*). Drawn as stucco is — relief in the ground's own colour, a few per cent off it (darker on paper, lighter in the dark theme), **never brass, never ink** — so it is read when looked for and not before. The rosette's eightfold figure is also the Islamic tradition's: one form both houses know.

Three places, no more: the **section ornament** (rosette between two short runs of pärlstav, `/ornament.svg`), which is also the **closing vignette** of every essay (the last `<hr>`) and the book cover's mark; and the **cornice** (*taklist*, `/taklist.svg`: a fillet, a bead, a run of pärlstav) flush along the top edge of each tinted room on the front page. A lone row of pearls floating below the edge read as a perforation, »cut here«; flush, in two members, it reads as a moulding. Not on kickers, not on photographs, not as a divider between paper sections.

## Principle 2: Typography Is the Design

This is a reading site. Typography is not one component among many — it is the primary design medium. Get the type right and the site is 90% designed. Get it wrong and nothing else matters.

### The Measure

Optimal line length for Swedish prose with its compound words: **60–70 characters per line**. Non-negotiable. A paragraph that spans the full viewport on a wide screen is unreadable — the eye loses its place on the return sweep.

### The Scale

Every font size on the site must belong to a single coherent scale — no ad-hoc sizes. The reader should perceive a natural hierarchy where each level feels proportionally larger, never arbitrary.

The scale has **two halves**, both in `tokens.css`. Reach for a token; never type a new rem value.

| token | px | role |
|---|---|---|
| `--font-headline` | 40–67 | display only: the lead headline, movement titles, the Grunden numerals |
| `--step-4` | 39.4 | essay h1 |
| `--step-2` | 27.4 | h2 (essay register) |
| `--step-1` | 22.8 | h3, list and card titles |
| `--step-0` | 19 / 17 mobile | body prose |
| `--step--1` | 16.9 | secondary prose: leads, blurbs, card copy |
| `--step--2` | 15.0 | dense prose: descriptions, table cells |
| `--step--3` | 13.3 | labels, meta lines, chips (`.label`) |
| `--step--4` | 11.9 | micro meta: attribution, dense map/prayer UI |
| `--step--5` | 10.5 | the smallest marks |

Above body the ratio is 1.2; below it 1.1250 — finer because rank down there is also carried by caps, weight and colour. The sub-body half did not exist until the components had already invented thirteen ad-hoc sizes for it (13px and 13.12px and 13.6px and 13.79px all meaning "label"); that is the failure this table prevents.

Deliberate exceptions are allowed and must say so in a comment at the call site: display type composed for one place (the feature headline, the pull-quote, the Arabic verse, the book-cover artwork) and the 16px floor on form inputs, below which iOS Safari auto-zooms on focus.

**Body text** must be generous: 18–20px on desktop, 17–18px on mobile. Anything smaller signals that you do not respect the reader's time.

**Line height** must give long-form prose room to breathe: 1.5–1.6 for body text.

**Paragraph rhythm:** Preserve the existing literary paragraph indentation and spacing rules. Reference-page grouping and interface spacing must not alter the prose rhythm.

### The Typeface

Serif for body text. Serif typefaces guide the eye along the baseline — this is why every serious book, newspaper, and literary journal uses them for long-form reading.

Criteria:
- **Large x-height** for screen readability
- **Open apertures** (the spaces inside letters like 'e', 'a', 'c') for legibility at body sizes
- **Swedish diacritical support** (å, ä, ö must feel native, not afterthoughts)
- **True italics** (not slanted roman — italics carry meaning in literary text)
- **Multiple weights** for hierarchy (regular, medium/semibold, bold minimum)

Literata carries editorial headings and prose; Source Sans carries navigation, controls, and metadata. Amiri Quran is reserved for Arabic verse — with one deliberate exception, the eleven Arabic terms of the Grunden band on the front page. Use the font roles and type scale in tokens.css.

**The display cut.** The body files carry Literata's optical-size axis only from 12 to 24, so every headline above 24px was the text design enlarged. `--font-headline` (»Literata Display«, astro.config.ts) is the same OFL family instanced at opsz 72, weight 400–700, 50 kB, not preloaded. Use it only at ≥ ~40px; at h2/h3 sizes the text cut is the right drawing.

### Vertical Rhythm

All spacing on the page — margins, padding, gaps — should derive from the body line height. This creates an invisible baseline grid that the eye perceives as order even without consciously noticing it. When spacing feels arbitrary, the page feels arbitrary.

---

## Principle 3: Visual Hierarchy Through Restraint

### Hierarchy of Content Elements

The essay contains these elements, in order of importance:

1. **Body text** — the essay itself. Everything else serves this.
2. **Block quotes** — Islamic and Swedish sources woven into the argument. See styling details below.
3. **Section headings** — (h2 only, no deeper levels) wayfinding within the essay. Much more space above than below — the gap above says "new section," the tightness below binds the heading to its content.
4. **Footnotes** — scholarly apparatus. See styling details below.
5. **Article title** — (h1) seen once, at the top. It sets expectations and steps aside.
6. **Deck / subtitle** — an optional italic tagline immediately after the frontmatter, before the first heading. Larger than body text, lighter weight, muted color. It previews the essay's angle without being a heading.
7. **Drop cap** — the first letter of the first body paragraph is set as a large serif initial. Decorative, not structural — it signals "the essay begins here" and adds a touch of print tradition. Same typeface as body (Literata), normal weight — the size alone carries it.
8. **Metadata** — date, reading time, topic. Smallest, most muted.

Blur the page and you should still see the structure.

### Block Quotes

Block quotes are a core content element — every article weaves in Islamic and Swedish sources. They must feel embedded in the argument, not decorative.

- **Not diminished.** Same typeface and size as body text. These quotes carry the argument's weight — shrinking them signals they are secondary. They are not.
- **Visually distinct but not loud.** A subtle left border is enough. No background color boxes, no heavy indentation. The reader should recognize "this is a source" without the styling shouting it.
- **Breathing room.** More space above and below than between regular paragraphs, but not so much that the quote floats free of the argument. It is part of the text, not an island.
- **Attribution**, if present, should be understated — smaller, muted, below the quote.

### Footnotes

Every article uses footnotes (typically 5–12 per essay) for scholarly apparatus: source citations, Quran verse references, clarifications. They serve two reading modes: the reader who ignores them entirely on first pass, and the reader who checks every source.

- **Invisible on first read.** Inline reference marks must not disrupt the line rhythm. They signal "there is a source here" without demanding attention.
- **Findable on second read.** The footnote section at the bottom must be clearly separated from the essay body, with smaller and more muted type. The reader must be able to jump to a footnote and jump back without losing their place in the essay.
- **Progressive enhancement.** Preserve real footnote and return anchors. Desktop sidenotes and the existing popovers support source checking; footnotes remain accessible without JavaScript.

### What Gets No Hierarchy

- Navigation (minimal, tucked away — the reader came for the essay)
- Social sharing buttons (if present at all, after the essay, never floating)
- Related articles (after the essay, understated)
- Author bio (unnecessary — the content earns trust, not a headshot)
- Comments (none — this is a publication, not a forum)

---

## Principle 4: Reduction

Every element on the page must pass this test: **if I remove this, does the reading experience get worse?** If the answer is no, or "I'm not sure," remove it.

- **No sidebar.** Sidebars split attention. The essay is the page.
- **No stock images, no generic illustration.** On a reading page the hero is the one image; beyond it, no images unless integral to the essay's argument. The front page and collection pages are the deliberate exception — there, essays' own hero images are reused as art-directed doorways (see *The Homepage Image Treatment*), never decorative stock.
- **No color for color's sake.** The palette is: text color, background color, one accent (for links and interactive elements), and muted tones for secondary elements. Four colors maximum. On the front page one tinted ground alternates with the paper; no second ground, and never a dark one (see »The Startpage«).
- **No borders or dividers unless encoding meaning.** Use whitespace for separation, not lines. On the front page this is a budget, counted in the DOM: **≤ 16 hairlines and ≤ 20 labels in tracked capitals** (from 48 and 66). Capitals name a movement — the kickers — and nothing else; meta lines, »Alla … →« links, counts and categories read in sentence case. Count again before adding one.
- **No animations on content.** Text does not fade in, slide up, or parallax. The reader chose to be here. Present the text immediately. No page-level transitions either — prefetch-on-hover makes navigation near-instant without injecting transition JS.
- **No dark patterns.** No newsletter popups. No cookie banners beyond legal minimum. No "read more" truncation on the article page.

---

## Principle 5: Whitespace Is Structure

Whitespace is not empty space. The space around an element defines the element more than the element itself.

### Margins

Generous side margins that frame the text column. On desktop, the text column occupies roughly 60% of the viewport width, centered. The remaining 40% is whitespace — it is what makes the text readable.

### Section Spacing

The space above a section heading should be noticeably larger than the space between paragraphs — large enough that the reader perceives structure without explicit dividers.

### Page Breathing

Generous space before the title at the top. Generous space after the last line at the bottom. The text should feel like it rests on the page, not crammed into a container.

---

## Principle 6: Discoverability Without Distraction

The reader must be able to find essays without the interface competing with the essays themselves.

### Navigation

At widths above 900px the header exposes Pelare & tro, Frågor & svar, and Essäer, followed by the quieter practical links, next prayer, and search. Width controls navigation availability; a touch-capable laptop must not lose its links. At compact widths show an explicit Meny control and a labeled next-prayer time.

The search/menu dialog uses a bounded desktop panel with reading and utility columns. Mobile uses a full-height single column. The title bar, close control, and search field remain accessible while content scrolls. Preserve keyboard shortcuts, native dialog focus handling, query retention, fuzzy matching, and error/retry feedback.

The footer groups real links under Läs, Praktiskt, and Om islam.se. It is the navigation backstop without JavaScript. Current-page markers use weight and a visible rule, not color alone.

### The Browse Axes

Essays are cross-cut by three curated axes, each a first-class collection surface:

- **Ämnen** — seven topics in a fixed order (foundational theology first, the Swedish reader's meeting-point last). Each essay carries exactly one.
- **Teman** (code and URLs: `tradar`) — hand-curated reading paths: an ordered sequence of essays around a single line of argument.
- **Tänkare** — the recurring interlocutors, in two facing columns: the classical Islamic tradition and the Swedish/Western voices that meet it. The composition itself is the argument — a dialogue shown, not declared.

These are glimpsed on the startpage and browsable in full at `/amnen/…`, `/tradar`, and `/tankare`. They never harden into a top-level menu; they are reached through the palette, the footer, and the homepage movements.

### Names — one name per destination (2026-09-27)

islam.se stands beside DN, SvD, Bokmässan and NE, so its chrome speaks their language: every destination has **one** name, used in the mast, the footer, the palette, the page's h1 and the front page alike, and every name was checked against how those institutions and Isof (Språkrådet) write the same thing.

| Destination | Name | Not |
|---|---|---|
| /vad-ar-islam/ | Tro och lära (NE's own tab) | Pelare & tro |
| /svar/ | Frågor och svar (Isof advises against »&« in headings; NE writes »och«) | Frågor & svar |
| /tradar/ | Teman (DN, Bokmässan); one is a *tema* | Trådar — forum/social-media register, used by no serious site |
| /ai-barometern/ | AI-barometern, always with the article (as Konjunkturbarometern) | Barometer |
| /podcast/ | Podd (DN, Dagen, Isof); the show is *islam.se: essäer, inlästa*, as its cover reads | Podden, Andliga essäer |
| /det-islamiska-aret/ | Det islamiska året | Kalender |
| the pillars / the articles of faith | Islams fem pelare · Trons sex pelare (*arkān al-islām / al-īmān*); the sixth is *Förutbestämmelsen* | trosartiklarna as a heading (NE uses it only for the Christian creed; it stays in prose as a synonym), Ödet |
| ämnen | Swedish usage, each word in its own heading form: the unique and proper definite (Skapelsen, Koranen, Själen, Norden), general ideas bare (Rättvisa, Samhälle, Livsfrågor — the curriculum's word). The »essäer om …« phrase is written per ämne (`omForm`: »om rättvisa«, »om samhället«, »om Koranen«), never derived. Slugs unchanged. | an all-definite set (»Rättvisan«, »Samhället«) — a calque of the Arabic al-; Skriften (reads as the Bible); Sökandet (English »The Search«) |
| tänkare | full names (NE, Litteraturbanken, DN): August Strindberg, Erik Gustaf Geijer | surname alone |

Onward links carry **no counts** (»Alla frågor och svar«, not »Alla 53 …«): no publication measured does it. Reading time is **»lästid 13 min«**, never the translated »13 min läsning«. No »Utforska …« (marketing register, used only on product pages). Page titles take the Swedish spaced en dash: `Sida – islam.se`, never the English em dash.

### The Essäer Page

The essay archive at `/essaer` lists every published essay — title, date, reading time, and description. Use the existing editorial card and row variants; titles, imagery, and metadata have a consistent hierarchy. By default the list is grouped by **ämne** in the canonical order (each heading links to its ämne page); one quiet toggle re-groups it **chronologically** by year. A filter row (ämnen / trådar / tänkare / längd) opens a calm overlay for jumping to a section or narrowing by length — none of it required to read the list. Essays the reader has finished shift value in place (a muted title and a "läst" mark) rather than splitting off into a separate section, and a small ring shows how much of the archive is read. All of this is `localStorage`, no account.

The list is ordered newest-first within each group. No pagination — the full archive on one page. If it grows to hundreds of essays, reconsider — but not before.

The archive is accessible from the navigation ("Essäer") and from the end of every essay. Astro's prefetch-on-hover strategy makes navigation feel instant — clicking a title loads nearly immediately because the page was prefetched when the reader hovered.

### Within an Essay

Keep the text column at its current comfortable measure. Essays, answers and deep-dives all render their h2 contents list through one shared `ArticleBody` component: a collapsed disclosure on mobile, an inline list at intermediate widths, and a sticky left rail at 90rem and above, where the section being read is marked (full text colour plus a short bar — never weight, which rewraps the rows). The rail must not overlap the right-hand sidenotes or reduce prose width. Anchor offsets clear the header.

The existing reading-resume offer identifies the essay and includes dismissal. It never scrolls automatically. Audio remains continuous through client navigation and all fixed controls respect its reserved space.

### After an Essay

Keep onward-reading links, newer/older essays, sources, and correction links. Group them consistently with shared section spacing and hairline boundaries. Preserve source anchors and their return path.

### Reference and Practical Pages

Frågor & svar opens with search and category navigation followed by question groups. Its six illustrated deep dives follow the questions. Keep query URLs and filtering behavior.

Mobile prayer pages show a compact next-prayer summary and today's schedule before the solar map. Wide layouts retain the map beside the schedule. Recompute visible and accessible labels together for the selected place and next-prayer target, including tomorrow's Fajr.

The mosque directory retains its desktop list/map layout. Mobile has Lista/Karta controls, initially Lista. Switching views preserves filters and selection. Show map loading and failure states; the directory and links must work without MapLibre. Existing location feedback and query URLs remain available.

The same map carries Sweden's Muslim burial grounds (muslimska gravkvarter), on the web and in the app. They wear the mosques' brass and differ only in shape: a humped grave with one plain stone, never a crescent (`apps/web/src/lib/begravningsplatser/glyph.ts` holds the one path both maps draw). They draw beneath the mosque markers, so a mosque wins any overlap. They share the callout, search and län filter but not the list, which stays the mosque directory; a legend checkbox beside the count names them and hides them. Every burial ground links the source that confirms it.

---

## Principle 7: Color and Contrast

### Background

Warm off-white or very light warm gray. Pure white (#fff) is harsh on screens. A subtle warmth (toward cream or parchment) reduces eye strain. The current light ground is visibly warm (#fff6e8); retain its relationship to the artwork. The dark ground is warm near-black (#1d1912).

### Text

Near-black, not pure black. Dark charcoal (#1a1a1a to #2d2d2d range) on warm off-white is easier on the eyes while maintaining WCAG AAA contrast compliance.

### Accent

One color. Used for links and interactive elements only. Muted, not saturated — this is a literary publication, not a SaaS landing page. The accent should feel inevitable, like it belongs to the palette.

### The Text Ramp

Secondary prose is not a new colour; it is a step down the same one. Four ranks, in `tokens.css`:

| token | role | light L\* | contrast |
|---|---|---|---|
| `--color-text` | body prose, titles | 8.7 | 16.4 |
| `--text-body` | leads, decks, framing | 18.8 | 12.7 |
| `--text-quiet` | descriptions, blurbs, captions | 29.6 | 8.8 |
| `--color-muted` | meta labels | 42.5 | 5.5 |

Space the steps by **perceived lightness (L\*), not by mix percentage** — roughly ΔL\* 11 apart, which is what the eye actually reads. The earlier ramp mixed 88/80/72 % and the components hand-mixed 70/75/78/82/85 % besides, which put seven prose tiers inside ΔL\* 12.3 — steps of under 1 L\* in places, all beneath the just-noticeable difference. Nine shades that read as one, and then a 25-point void down to muted. Never hand-mix a new percentage at a call site; if a tier is missing, add it here and justify it in L\*.

Muted carries margin on purpose: at 5.5:1 it still clears AA on every tint the site puts under it (a raised surface, a hovered row, a selected control). It once sat at 4.7:1, and each of those tints pushed it under 4.5 — which is how two components came to carry private workarounds.

A colour that encodes data (the brass on the mosque map's markers and bars) earns its place by encoding something. The moment it is used for ordinary text it is just a fifth colour. Where a figure *must* set words in brass — the emphasised row of a table, the emphasised entry of a timeline — it uses `--color-brass-ink`, a darker cut of the same hue that clears 4.5:1; the mark itself is 3:1 on the light ground and is a fill, never an ink. Hover and focus on ordinary text take the accent, everywhere.

### Washes and Surfaces

Two more families in `tokens.css`, and no percentages at call sites:

| token | role |
|---|---|
| `--wash-hover` | the translucent warm tint under a hovered row or result |
| `--wash-selected` | the same, under a selected control or the marked row |
| `--surface-1` | an opaque panel one step off the ground: a card, an input, a book cover, a quoted block |
| `--surface-2` | a control or a marked table row sitting on such a panel |

Before these existed the components mixed 8, 10, 16 and 18 % of warm for the same two hover states, and six different recipes for a raised panel. None of those differences were visible on one screen; all of them were visible across two. `src/styles/tokens.test.ts` measures the palette in both schemes and fails if any text tier, wash or surface drops under its floor.

### Dark Mode

Dark mode is implemented and is not an inversion. Dark mode is a separate palette: dark warm background (not pure black), light warm text (not pure white), adjusted accent. The typographic scale, spacing, and hierarchy remain identical. Only the palette changes.

---

## Principle 8: Responsive as Reflow, Not Redesign

The essay is the same on every device. What changes is the container, not the content.

### Breakpoints — one scale, in rem (2026-09-27)

Every media query and every `matchMedia` is written in **rem**, never px. The same line used to be written both ways (`768px` and `48rem` in 31 places, `480px`/`30rem`, `640px`/`40rem`): identical at the browser's default text size, but a reader who has enlarged their text saw half the page turn at one width and half at another. A rem query scales with that setting, so the whole page turns together.

The front page turns in three coordinated steps, each for a reason:

| Line | What turns | Why there |
|---|---|---|
| **48rem** (768px) | Fördjupning two by two; podcast and app side by side | two cards fit abreast |
| **56.25rem** (900px) | the mast's links unfold and the front page's doorways go; the six pillars of faith take three columns | the mast's six links fit on one line; Fakta turned at 56rem until 2026-09-27, 4px apart |
| **60rem** (960px) | the live row in halves; AI-barometern side by side with all three findings; Ämnen in thirds | halves and thirds on the one gutter |

### The mast (2026-09-27)

Three groups in one row: the wordmark, the six links (sections, a hairline, utilities), and the next prayer with the search pill. The rules, each measured:

- **The wordmark is the heaviest thing in the mast.** It scales from 18px on a phone to 26px on the canvas (`clamp(1.125rem, 0.5rem + 1.6vw, 1.625rem)`), growing with the room the links leave it. At the nav's own 16.9px it was 88 × 18px beside a 650px link row, and the eye found the menu before the name.
- **The links centre between the wordmark and the chip, not on the viewport.** Equal `1fr` side tracks put them 150px from the wordmark and 23px from »Maghrib 18:33« at 1440px, closer to the chip than to each other. The air either side of the links is now equal and always wider than the air between them.
- **One fluid gap** (`--mast-gap`) for every space in the link row, 12px at 901px to 25.6px on the canvas. There is no fixed override for a band.
- **The shortcut hint names the reader's key:** ⌘K on Apple and Ctrl K elsewhere, stamped before paint by Base.astro.
- **On a phone the chip names the prayer** (»Maghrib 18:33«). Under 360px it shows the sun or moon with the time, which is what fits one row at 320px.
- **Labels say »och«, never »&«.** The ampersand saves 17px a label (34px across the row), and the row does not need it. Språkrådet keeps `&` for company names and tight tables, not for a publication's chrome.

A component that decides both its layout and how much it shows asks **one** condition for both: AI-barometern asked the container for its columns and the viewport for its finding count, and from 700 to 959px stood in two columns with one finding, 127px beside a 658px introduction. A new breakpoint takes one of these lines or says why not.

### Mobile

- Text fills more of the viewport (less side margin, but never edge-to-edge text)
- Font size drops slightly (17–18px), never below 16px
- Line height may tighten slightly (1.45–1.5)
- The measure naturally shortens on narrow screens — do not fight it
- Block quotes reduce their left indentation to preserve reading width

### Tablet

- The sweet spot. A centered text column at optimal measure with generous margins on both sides
- This should look and feel like a well-designed e-reader page

### Desktop

- The text column must be constrained. `max-width` on the content container is mandatory
- The surrounding whitespace is a feature, not a bug

---

## Principle 9: Performance Is a Design Decision

A page that loads in 3 seconds has already lost the reader.

- **No web fonts that block rendering.** Use `font-display: swap` at minimum. Self-host fonts with aggressive caching.
- **No JavaScript required for reading.** The essay is HTML and CSS. If JS fails to load, the reader should notice nothing. Astro's prefetch-on-hover makes navigation feel instant without requiring client-side transitions.
- **No layout shift.** Reserve space for dynamic elements so text does not jump.
- **Optimized images.** The hero image must be served in modern formats (AVIF/WebP), responsive sizes (`srcset`), and aggressively compressed. Target: hero image under 150KB at desktop resolution. Astro's built-in `<Image>` component handles format conversion, responsive `srcset`, and compression automatically.
- **Minimal asset weight beyond the hero.** HTML + CSS should remain under 30KB. Self-hosted fonts (Literata roman + italic, ~230KB total) are cached after first visit and preloaded to avoid layout shift.

---

## Principle 10: Arabic and Transliteration Typography

### Transliterated terms in body text

The body text uses transliterated Arabic terms (tawakkul, ubudiyyah, dhikr). These terms must feel like natural parts of the Swedish text, not foreign intrusions.

- **Italicize transliterated terms** on first use (standard academic convention). Subsequent uses in the same essay: roman (upright).
- **No special styling** (no bold, no color, no background highlight). The term earns its place through the prose, not through visual emphasis.
- **The typeface must handle diacritical marks** used in academic transliteration (macrons, dots below: ā, ī, ū, ḥ, ṣ, ṭ, ḍ, ẓ, ḏ, ṯ, ġ). Test the chosen typeface against a full transliteration set before committing.

### Arabic script in block quotes

Block quotes frequently contain Arabic script — Quran verses, hadith, and classical scholarly citations — typically followed by a Swedish translation in italic. Preserve the Quran components, Amiri Quran font, and their Arabic direction and recitation behavior. Do not restyle Arabic verses as ordinary Swedish interface text.

---

## Principle 11: Social Sharing Meta

When someone shares an article link, the preview is the first impression for most new readers. This must be designed, not left to defaults.

- **Open Graph image:** The article's hero image, cropped to 1200x630 for OG and 1200x675 for Twitter/X. Generate these crops at build time. If no hero image exists, use a branded fallback (site name + article title on a solid warm background).
- **OG title:** The article's title, unmodified.
- **OG description:** The first ~160 characters of the article body (first paragraph), stripped of markdown. No generic site description.
- **OG site_name:** islam.se
- **Twitter card:** `summary_large_image`.
- **RSS auto-discovery:** `<link rel="alternate" type="application/rss+xml">` in the `<head>` of every page.

---

## Principle 12: The Islamic Year

The homepage shows a quiet preview of upcoming observances, the first of them counting down (»om 136 dagar«, »pågår« through a period); the calendar page contains the full year. Preserve the existing date calculations, source policy, and client date refresh. There is no daily-verse homepage module in the current composition.

**The islamic day begins at maghrib.** A date shown for an *instant* (the horizon in the front page's Praktiskt) turns over at the day's maghrib, not at midnight: `hijriAt()` in lib/markesdagar.ts. A date shown for a *calendar day* (a table row, an observance) stays the civil Umm al-Qura date. The footer's colophon is the build date and says so (»uppdaterad …«).

## Shared Implementation Contracts

Use tokens.css for values; editorial.css holds the shared UI presentation contracts that refine the existing layout and scoped components. The reading measure is 42rem and the prose measure remains unchanged.

**Two frames (2026-09-26).** *The canvas* (`--canvas-width`, `.home`) is the mast's: 76rem of content plus the mast's padding. The front page, every index, directory and tool page, and the footer on every page use it. *The reading frame* (`--reading-frame`, 64rem) holds the pages people read through: essays, svar and fördjupningar (`.reading`), and the browse-shell pages that are mostly one column of running text (`.home.home--text`: the two bönetider guides, the mosque guide, the AI-barometern method and question pages, the podcast episode list, Nyheter). An index used to share the reading frame so nothing "flicked" between index and article; the mast is what holds still now, and an index set 12rem narrower than the menu over it looked shrunk (user review, 2026-09-26). The lines never grow: on the canvas, prose keeps the measure and **the width goes to the things that are many** — cards in thirds (never five or six across: "very small and tight"; never stretched to fill a row: "drawn out"), directories in columns read down then across, a picture beside its list rather than under it, a table beside the text that explains it. A page whose content is a single measure-bound column belongs on the reading frame, not on the canvas with an empty half beside it.

Use --space-control for compact interface gaps, --space-group within related content, and --space-section between editorial sections. Retain the larger prose spacing tokens where they already carry meaning. Inputs are at least 16px; principal touch controls are at least 44px high. Focus indicators, selected states, loading, empty, and error states belong to the shared design.

Check 390px, 768px, and 1440px, both themes, long titles, absent images, Arabic, 200% zoom, reduced motion, keyboard navigation, failed third-party resources, and back navigation. Run repository verification before release. Compare representative loading and layout behavior with the previous version; do not add a framework or backend for presentation changes.

## Summary of Constraints

| Element | Constraint |
|---|---|
| Typefaces | Literata, Source Sans, and Amiri Quran for Arabic |
| Colors | 4 maximum (text, background, accent, muted) |
| Body font size | 18–20px desktop, 17–18px mobile |
| Line length | 60–70 characters |
| Line height | 1.5–1.6 body text |
| Hero image | Optional, responsive, essay-specific artwork |
| JS for reading | Zero required (prefetch-on-hover for fast navigation) |
| Animations on content | None |
| Sidebar | Contents rail on every essay, answer and deep-dive on sufficiently wide screens; preserve sidenotes |
| Startpage | »Dagen och texten«: the intro line, the lead with an index of the next three, the podcast and app band, then movements on alternating paper and tint inside the mast's canvas; not a single screen, not a feed |
| Front-page budget | ≤ 16 hairlines, ≤ 20 tracked-caps labels, one tint and no dark band |
| Decks in lists | whole sentences only: the deck's opening sentence (`leadSentences`, lib/format.ts), never a line clamp ending in »…« and never the full deck side by side |
| Dates | without the current year (»23 september«); another year is printed (`formatDate`) |
| Navigation | Width-based header, search/menu dialog, grouped footer |

Performance and weight budgets are in `TECHNICAL_SPEC.md`.
