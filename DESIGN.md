# Design Principles — islam.se

This document defines the visual and interaction philosophy for islam.se. Every design decision flows from these principles. When in doubt, return here.

Everything here is a current rule. How a rule came about — dated decisions, the forms that came before, measurements, review quotes — is in `docs/design-history.md`; record new history there and keep this file to the rule.

## What This Site Is

islam.se publishes long-form literary essays that place Islamic intellectual tradition in conversation with Swedish cultural heritage. The primary audience is Swedish readers unfamiliar with Islam — people who read DN Kultur or SvD Under Strecket, who value careful prose, and who will leave the moment something feels preachy, amateurish, or cluttered.

The content does the heavy lifting. The design's job is to set the mood and then disappear.

## The Single Design Metric

**Time spent reading.**

Not time on page (that rewards confusion). Not pages per session (that rewards clickbait). The design succeeds when a reader starts an essay and finishes it — when nothing in the visual environment pulled them out of the text.

Every element must answer: *does this help the reader stay in the essay, or does it interrupt?*

## Lineage

Two designers stand behind these principles. When a case is not written down here, reason from them.

- **Dieter Rams: *Weniger, aber besser*, less but better.** Good design is honest, unobtrusive and as little design as possible. Principles 2–5 (typography, restraint, reduction, whitespace) are his ten principles applied to a page of prose.
- **Don Norman: *The Design of Everyday Things*.** A control signals what it does, answers when it is used, and fits the model the reader already holds: signifiers, feedback, mapping, conceptual model. Principle 6 (discoverability) is his.

When they pull apart, Rams decides what stays on the page and Norman decides how what stays is found and used.

---

## Principle 1: Artwork Opens the Publication

Artwork gives each essay its emotional register. Preserve the commissioned, essay-specific imagery and its Swedish cultural setting. Text-only essays must feel equally complete.

### The Startpage — »Dagen och texten«

The front page's identity is what no other Swedish publication has: the islamic day (prayer times, the hijri date, the sun) and the conversation between two traditions (tänkare × essäer × trådar). The wordmark holds the idea: ISLAM●SE, a sun between two words. The failure to avoid is a page correct everywhere and memorable nowhere: every movement in one tempo, each under the same kicker and over the same hairline.

The sequence, top to bottom: an opening, two chapters on paper each followed by a tinted room, and a close:

1. **The orientation line** — one sentence saying what the site is, becoming »Fortsätt läsa …« for a returning reader with an unfinished essay.
2. **The lead as one package, beside a rail** — on desktop two columns that start and end on the same lines. Two thirds hold the lead: kicker, headline, deck and date, and directly under them its photograph at the same width. The last third, behind a hairline, is a rail of the six essays before it, titles and dates only, a rule between each. **Level by construction:** the picture's row is the flexible one, so the photograph is as tall as the rail needs and never flatter than 5:2; when the rail is the shorter column its list spreads to the foot. Nothing is measured in script. On a phone and a tablet: kicker, headline, photograph, deck, then the first three of the rail. A headline past 50 characters steps down a size on desktop. The six doorways follow only at widths ≤900px, matching the mast's collapsed navigation; wide touch devices keep the inline mast links without duplicating the doorways.
3. **The news bar** (`Nyheter.astro`) — at the foot of the opening, under one hairline: the kicker »Nyheter«, the credit »från zuhd.news«, »Alla nyheter«, and **six notices, each a headline with its stamp under it** (»I går 23:48«), never the clock in front, which narrows the headline into an ellipsis. It is newest, so it stands first; it is not the site's own, so it is set smallest, in the sans that marks it as reported elsewhere. Six, because a »senaste nytt« block is five or six rows wherever a Swedish reader has met one; three reads as a list cut short. One column under 48rem, halves from 48rem, thirds from 72rem: in columns every headline must fit one line, because **the bar holds its place before the news is known**. The rows come from a fetch in the browser; the bar is in the layout from the first paint and made visible only when it has rows, so nothing moves when they land (layout shift 0, also with the fetch late). With no news it is taken out; without scripts it is never in the layout. Six is therefore a layout contract as well as a count (`RAIL_ANTAL`, pinned by a test, with `--remsa-rader` in `nyheter.css`).
4. **The essays by ämne** — the first chapter's first section, because a reader who has just met the lead looks for more essays: the kicker »Essäer efter ämne«, tabs for the six ämnen, the chosen one's framing line and three essays, each with a 3:2 photograph, sharing rows so pictures, titles and separators align. The lead and the rail's six are excluded. Below the thirds the three are a shelf's, newest first: one above the other on a phone, a lead above a pair on a tablet.
5. **The essäserier, in the same design** (`TradarHome`) — the kicker and »Alla essäserier«, a tab for each of three series, the chosen one's framing line, its **three newest parts**, newest first, as picture cards, and »Hela essäserien« with »6 delar · lästid 65 min« on that line. The one difference is a series' one difference: **every card says which part it is** (»Del 1«, »Del 2«, »Del 3« over the title, in the brass every ordinal on the page is set in; »Del 2 · läst« and a muted title once read, from localStorage). Below 60rem the three parts keep one row and scroll it sideways, the next one's edge showing: parts are equals in an order, and a lead above a pair would rank »Del 1« over the rest. One rule draws that row for the essäserier and for Fördjupning (`editorial.css`, »A row of cards that scrolls sideways«).
6. **AI-barometern, the first room** (`BarometerRail`) — on tint: the room's own words in the first third (kicker, what is asked of whom and how often, »Till AI-barometern«, the drawing under them) and **a finding drawn as a table** across the other two. Three findings stand behind tabs; a panel is the answers themselves, the statements side by side and the five models under each other. **The table explains itself, or it is the wrong table.** The column heads are statements put to a model, in »…« under the label »Påstående«; where two statements are one sentence about two subjects the subject is the only bold thing in the row (»**Palestinierna** har rätt till väpnat motstånd« beside »**Ukrainarna** …«). An answer is a meter of four blocks, as many filled as the model agrees (four for »instämmer helt«, none for »tar helt avstånd«), with its word beside it as its key; where a model took no position there is no meter, so »avstår« is never read as a low score. The sentence saying what the table shows is only its caption, for a reader who cannot see it. With two statements the table's last column is the canvas's last third. The panels lie in one cell, the unchosen ones invisible and not removed, so nothing under the room moves when a tab is chosen. Only findings of two or three statements are drawn here; a set of five is the hub's.
7. **Grunden** — »Vad är islam?«, the second chapter's first section, on paper, **one box in three columns** from 60rem: the opening (kicker, title, one sentence, the two ways on, the drawing under them), the five pillars as a numbered list, the six articles of faith as a list, the three labels on one line. Each term is the Swedish name with its transliteration on the same line and the gloss under it. The two lists do not end together and are not made to. Below 60rem the three stack, the articles in pairs. No Arabic script at the ends of the rows: it adds weight without adding meaning beyond the transliteration.
8. **Fördjupning** — straight after Grunden (introductory facts, then depth), under its own rule: the head row with »Alla fördjupningar«, **the Fördjupning page's own ingress as a framing line** (so the name explains itself), and **three picture cards on the page's thirds** in the card chapter 1 uses, column for column under Grunden's three columns. The curated list's order is the order on the page (`FordjupningHome.astro`). **A list on the front page is set as items — a title with something under it, on the grid — never as a run of links.** A phone and a tablet scroll the three sideways, in the essäserier's row. The framing line owns the gap above the cards; card padding must not double it.
9. **Praktiskt, the second room: time and place** (`PraktisktHome`) — on tint: **two lines in one hand** across the first two thirds and the mosques' map in the last. *Bönetider* (`PrayerHorizon`): today from midnight to midnight, the six times as ticks with the prayer's name and clock under each, daylight drawn heavier, the islamic date turning at maghrib's tall brass tick, the sun at the current minute. *Det islamiska året* (`Arslinje`, `lib/arslinje.ts`): the coming twelve months as ticks, Ramadan drawn heavier, the two eids and Ashura as marks with name and date, the islamic year turning at 1 Muḥarram's tall brass tick, the sun on today. The year's line opens on the first day of the current month, so every yearly observance lies ahead on it once. Each line has a head row (its destination's name, the way further in on that line) and one live sentence (»Nästa bön Fajr 05:21 i Stockholm.«, »**Ramadan** 8 februari – 8 mars 2027 · om 121 dagar«). Which labels fit is measured in the browser on the line as drawn; the build's estimate is the answer without scripts. The room shows the day and the year as they stand this minute, not lists retelling what the promotions under it say. »Bönetider under året« is the day's way further in, not a tool of its own; Moskéskärm stands only in the close.
10. **The closing promotions** (`Promo.astro`, one component for all four, on one grid of two halves) — podcast and app, then the book and the mosque screen, on paper under the second room, the footer's rule under them; the wrapper owns one `--space-section` gap between rows. Keep each promotion's heading, drawing, copy and destinations. From 64rem each half is two sixths of words and a sixth of drawing, flush right, so the words stand on the page's left line and on its centre line (where the footer's »Praktiskt« stands) and the four drawings end on two lines. Each half's links stand on its foot, so the two rows of links meet across the gutter; there is as much air under the last row as over the first. On a phone they stack, each drawing half a step over its own kicker; from 48rem two stand abreast. Where the drawing stands at each width: »The Drawings«, rule 2.

**Tänkare is not on the front page.** It stands on /essaer/ (»The Essäer Page«): its own words in the first third and the drawing across the other two, the two traditions in facing columns joined by the essays they share. Preserve the drawing and its hover behavior.

**Why this order.** What the site writes, then what it measures; what Islam is, then what the day and the year are; then the ways to take it all elsewhere: *read* (the lead, the latest essays, the news, the essays by ämne and by essäserie), *measure* (AI-barometern, monthly), *learn* (what Islam is, then depth), *practise* (the day, the year, the mosques), *the close*. New readers find »Tro och lära« first in the mast and, on a phone, the doorways under the opening. The rules: **what goes stale soonest stands highest** (the news under the newest essay, the monthly measurement before the standing reference, today's line over the year's); **what belongs together stands together** (the year under the day; facts beside depth; the essays' two shelvings one under the other, in one design); and **size follows rank, not freshness** (the news is newest and smallest, because it is not the site's own).

**Every section opens the same way: a rule, its kicker, the way on**, so a reader going down the page always knows where they are and what belongs together.

- *A rule opens a section that follows another on the same paper* (`editorial.css`; a chapter is a `.home-chapter` in `index.astro`), and the head row stands one group-space under it. What stands under a rule belongs to that rule's kicker, down to the next rule. **A room keeps the same vertical grammar**: its upper line is the cornice, its kicker one group-space under it; its lower line is a rule along the room's foot, and the next section opens under it at the same distance. The news bar opens under one rule like any section; a rule under it would belong to both it and the next section.
- *A kicker has one of two jobs and is set by which* (`layout.css`). It **heads** a section or a list (»Senast publicerat«, »Nyheter«, »Essäer efter ämne«, »Essäserier«, »AI-barometern«, »Fakta om islam«, »Fördjupning«, »Praktiskt«): then it is the heading, in ink and at weight 600 behind the brass point. Or it stands **over a title** and names its kind (the lead's ämne; »Podd«, »App«, »E-bok«, »Moskéskärm«): then the title is the heading and the label keeps the quiet form.
- *One title.* The page has one serif title under the lead's headline: »Vad är islam?«, the question the site answers and the page's head term, set as the first of Grunden's own words under its kicker. A section does not take a title to gain rank (a title over »Essäer efter ämne« read as the parent of the sections after it): its position and its content carry that.
- *The way on stands in one of two places.* A section that is a row of items has it on the head row, at the right (the rail, the news, the essäserier, Fördjupning, the two lines in Praktiskt). A section that opens with words of its own in the first third (AI-barometern, Grunden) closes those words with it.
- *One tab grammar* (`layout.css` `.home-tabs`, `.home-cards`; `scripts/home-tabs.ts`). The essays by ämne, the essäserier and the barometer's findings show one of several behind the same tabs: links on one base rule, the chosen one in ink over the accent, arrow keys between them, and without scripts the links they are written as, the first panel open.

**Pace: no movement taller than a screen, and none taller than the lead's rank allows.** Nothing is taller than the opening with its news bar. Looking and reading alternate (picture, line of news, pictures, pictures, table, reference, pictures, two lines and a map, drawings); the photographs come as the lead and then three rows of cards at one size, so the lead's is the one large picture on the page. Measure a movement's height before and after changing it; a movement that grows past ~800px at 1440 says why.

**One pair of margins — the mast's — and two rooms.** Keep the 76rem canvas (`--canvas-width`), existing warm paper and one `--ground-tint`, with content aligned to the mast. **Paper is for what is written and the tint for what is measured**: AI-barometern's answers, and the day, the year and the map. Everything else stands on paper, so the page reads paper, room, paper, room, paper, and a change of ground says a different *kind* of thing has begun. A ground follows what a section is, never its position: grounds alternating by movement make every movement a room, so none is. **No tint holds two sections**: a tint has edges, and two things inside one are pressed together; paper holds a chapter, whose sections are told apart by the rule each opens under. A new movement goes on paper, in a chapter, unless it is a third thing that is measured; a third room needs a reason this paragraph does not have. Preserve the restrained palette and artwork; no dark band, new color or new ornamental divider — the one ornament a room carries is its cornice (»Stuckatur« below).

**One grid: twelve columns, one gutter.** The canvas is twelve columns behind one gutter, `--grid-gutter` (3rem); at 1440 a column is 57px and the column edges fall on 107, 212, 318, 423, 528, 634, 739, 844, 950, 1055, 1160 and 1266. Every section is a division of the twelve, so every block on the page starts on one of those edges:

| Division | Columns | Where |
|---|---|---|
| thirds | 4 + 4 + 4 | the news bar, the essays by ämne, the essäserier, Grunden, Fördjupning |
| two thirds and one | 8 + 4 | the lead and its rail; Praktiskt's two lines and its map |
| one third and two | 4 + 8 | AI-barometern's words and its figure (the table's last column is the page's last four) |
| halves, each words and drawing | (4 + 2) + (4 + 2) | the four promotions |
| quarters | 3 + 3 + 3 + 3 | the footer, »Läs« in the first two |

From the news bar to the second room everything stands on the thirds; the close turns on the centre line (739), which the promotions and the footer share. No component keeps a gap of its own, and a hairline's width does not push words off a line: a few pixels off the grid reads as a mistake. What is inside an item is the item's own (a table's column of names, the map beside its words); its outer edges are the grid's. A new movement takes the gutter and a division of the twelve, or says why not.

**Under 60rem, one gutter to a width.** Where the page stands in halves (from 40rem: the ämne's pair, the news, the six beliefs in pairs, the promotions) the gutter is the page's own, so every second column is on one centre line, and the doorways' three stand on the thirds AI-barometern's opening turns on. A phone's two-ups (the doorways, the six beliefs, the footer) share one group-space, their second columns on one line. The footer takes the page's gutter between its two halves only from 48rem (between all four columns »Redaktionella principer« would break), which keeps »Praktiskt« on the centre line.

**One set of vertical steps.** Down the page a section is: a section space (4rem at 1440), its line, one group-space (1.5rem), its kicker, one group-space, its content — a room's included (tabs under a kicker have a 12px margin, because their own padding is the other 12). Two smaller steps exist and each has one job: 15px between a label and the title it stands over (the lead's ämne, the four promotions), and the news bar's own half-steps, because it is the one thing on the page set at the smallest size.

**One rank, one ink, one size per role.** Card and list titles are `--color-text` whether the component is the page's own or a shared list (editorial.css); essay meta lines are `--step--3` everywhere on the page; a head-row link (beside a kicker or a department name) is `--step--3` muted, a link that closes a block is a `.section-link` at `--step--2` — never the two sizes side by side for the same job. Literata's discretionary ligatures (c‿h, c‿t, s‿t) belong to a page's title: the lead's headline and every h1, at every width, switched on with `font-feature-settings: "dlig" 1` (a tracked title drops them under `font-variant-ligatures`). Section headings and card and list titles do without: at their size the swash reads as a rendering fault. Kickers are one box whether `<p>` or `<h2>`, so kickers set side by side meet on one line. **A role is written once**: the picture card's inside is four numbers in `tokens.css` (`--card-*`), read by both card markups; the sentence a section opens with (the lead's deck, AI-barometern's, Grunden's) is `.home-ingress`; and a framing line is set in the ink of the blurbs it introduces, a size above them, never the meta grey of the unchosen tabs.

Do not replace this publication with a generic promotional landing page or reorder its priorities without a product decision.

**The Homepage Image Treatment.** Use two image roles on the front page: the lead's photograph (two thirds of the canvas, under the lead's words, as tall as the rail beside it and never flatter than 5:2 — the only picture on the first screen of a laptop, and the widest on the page) and the 3:2 card (one picture per department, Fördjupning), always at the full width of its column with its title beneath. No thumbnails hung off the side of a text row on the front page: rows of small dark boxes look pasted on. The collection pages (an ämne, an essäserie, a tänkare) show their essays as the front page and /essaer/ do, picture cards and then rows. Keep consistent crops within each role. The photograph has its own space; titles and introductions remain readable outside it. The tonal wash is the one treatment (Principle 4, »A documentary photograph …«): nothing lies over a picture — no grain, no vignette — and on hover nothing lifts, zooms or darkens; the wash eases to full colour and that is all.

### Article Openings

Title, introduction, metadata, artwork, and optional listening controls lead into the prose. Heroes are responsive and optional; they do not occupy a mandatory full viewport. Caption spacing belongs to the image. Artwork never follows the reader down the page.

### The Drawings — the site's own hand

Photographs belong to the essays and the fördjupningar; the site's own sections speak through a series of engraved vignettes, one hand throughout: wood engraving in the manner of Thomas Bewick's tailpieces and the Swedish book xylography after him — crisp lines of even weight, tone in fine parallel lines, clean white lights, each scene dissolving into the paper in a soft oval, the vignette a book prints at the end of a chapter — printed in the type's own ink (`--color-text`), with **one** flat brass tint per drawing, laid under the lines as on a hand-coloured print, for the one thing that is gold (the keystone, the key, the new crescent, the app's arc, the barometer's needle, the lamp's flame). `src/components/Ritning.astro` draws them; `src/lib/ritningar.ts` lists them; `src/assets/ritningar/README.md` holds the brief and the processing, so a new one is made in the same hand.

- **Why engraving (2026-11-07).** The first series (2026-09-26) was graphite after Turner's sketchbook. It drifted into two hands — mean ink from 3.8 % to 17.7 % of a drawing — and, drawn at 900px, its hatching turned to grey fuzz at the 112–226px an opening gives it; re-inking the graphite in the site's ink changed nothing, so the fault was the mark-making, not the colour. An engraved line has a fixed weight, so the hand repeats from sheet to sheet; it is a print form made to be reproduced small; and in the text's ink it sits on the page as the essay's closing ornament does, with a weight that matches the title beside it. Tried beside it and not taken: the Turner brief drawn literally (faint at size) and pen and one wash after Elias Martin (on paper the best blend, on the night ground plain grey).
- **Drawn for its size.** Every brief says the drawing is shown 130–230px tall and asks for firm marks; engraved tone covers at most half a vignette, and skies, walls and table tops stay white or carry a few spaced lines — never a hatched field behind an object. Mean ink stays within a 2× band across the series (9.7–18.9 % in November 2026); `spara` prints it.
- **One sheet, one hand.** Drawings are made four to a sheet, one Codex call, with a sheet of the series attached as the reference; a drawing made alone (the Quran stand, shown 500px wide on /vad-ar-islam/) still takes the sheet as its reference. A detail is corrected as an edit of the cell, so the composition holds (the milestone's brass, the phone's screen).
- **The brass.** `#b8862f`, flat, under the engraved lines, on one small thing. Never metal, shine, glow or light rays, and never a solid block: a flat brass rectangle on a milestone read as a sticker.

- **What may be drawn.** Things, buildings, landscape, plants. **No people, no animals** — the classical position the site takes on drawn images of living beings. Swedish where the subject allows it (the lake at first light, the farmhouse barometer, birches and pitched roofs).
- **Two papers, no frame.** Each drawing exists twice: in ink on white for the light theme, the same vignette cut as a white-line engraving on black for the dark (an edit of the light sheet, so the composition holds; the lines carry the light, so the doorway stays dark and the open pages are the brightest thing). The light file is re-inked to the text colour and the dark one to the night text colour. The white paper is multiplied into its ground and the black one screened, so the drawing lies straight on the page in both themes. The drawing carries its own ground (`--color-bg`, which the tinted bands re-point) because blending needs one inside its stacking context. Never one drawing inverted for both themes (a negative), never the dark file at reduced opacity.
- **Where, and on which line.** A drawing is placed by one of three rules, never by feel:
  1. *A section opening* — a hub's PageHead, a section's prose page (/bonetider/metod/), Grunden and AI-barometern on the front page: the drawing stands in the column beyond the measure, flush with the frame's right edge (the edge the content below ends on). A movement built on a grid of its own stands it on that grid instead: Grunden's drawing, and the barometer's in its room, stand in the opening's own column, under its words, on the column's left edge, taking the height the lists or the table leave and no more than 17rem (the barometer's 13). **Only beside an ingress:** a tool page (/bonetider/, /moskeer/) opens on its tool and takes no drawing, which would float over the tool's first button and push the title down.
  2. *A drawing beside words* — the four promotions at the front page's close: the words first, on the half's left edge, and the drawing beyond them in a column a sixth of the canvas wide, flush with the half's right edge, as an opening's drawing stands beyond its words (rule 1). All four share one 10rem box: each file is a square of its own paper with the drawing standing on its foot, so the four end on one line whatever their proportion (the closed book is low, the phone tall). At tablet widths the drawings stand above the words, each in the whole 10rem box and on its foot, so the kickers of two promotions abreast meet on one line; on a phone above the words at 7rem, flush left.
  3. *A centred page* (404): on the page's own axis, above the words.
- **Size follows the words (visual hierarchy, common region).** In an opening the drawing is exactly as tall as the opening: from the title's (or kicker's) top line to the last line of its words — the ingress, and on /vad-ar-islam/ the verse, on /ai-barometern/ the measurement line, which is why PageHead has an `efter` slot. It is never under 7rem. Drawing and words share their top and bottom lines and read as one unit, so the page's own hierarchy sets the size. Built exactly: the drawing fills a cell spanning the opening's rows (`Ritning fyll`, `object-fit: contain`) and adds no height of its own; never a fixed box. Keep any bottom margin out of the opening's last row, or the cell runs past the text.
- **Proportion follows the place.** The space beside or under an opening's words is wider than tall, so an opening's drawing is composed landscape (about 4:3 to 3:2). The barometer's landscape version (beside a window, weather moving in) serves the hub and the front page's room; the upright one is not placed.
- **Not placed:** the mosque drawing (`RITNINGAR.moskeer`) — /moskeer/ opens on its tool and /moskeer/om/ on a gallery of real mosques, where a drawing would compete with the photographs. It waits for a page that opens with words.
- **The hubs.** A hub that opens on words and has photographs below it (/essaer/, /tradar/, /vad-ar-islam/, /svar/, /fordjupning/) takes a drawing beside its ingress by rule 1; only a page that *opens* on photographs does not. **Essäer** (`RITNINGAR.essaer`): an old fieldstone arch bridge over a river between birches, the keystone alone in brass — two banks and one passage. **Frågor och svar** (`RITNINGAR.svar`): a farmhouse's plank door standing ajar, a lilac by the wall, the key in the lock alone in brass — a question is a door and its answer the key. **Fördjupning** (`RITNINGAR.fordjupning`): a fieldstone well under its windlass, the bucket on the rope alone in brass — what is drawn up from the depth.

### Stuckatur — the Swedish room

Something typically Swedish, stucco-like, only extremely subtly: the ornament of the Swedish flat the site is read in, a Gustavian ceiling rosette (*takrosett*, eight pointed leaves in a ring of sixteen pearls) and the bead-and-reel moulding (*pärlstav*). Drawn as stucco is — relief in the ground's own colour, a few per cent off it (darker on paper, lighter in the dark theme), **never brass, never ink** — so it is read when looked for and not before. The rosette's eightfold figure is also the Islamic tradition's: one form both houses know.

Three places, no more: the **section ornament** (rosette between two short runs of pärlstav, `/ornament.svg`), which is also the **closing vignette** of every essay (the last `<hr>`) and the book cover's mark; and the **cornice** (*taklist*, `/taklist.svg`: a fillet, a bead, a run of pärlstav) flush along the top edge of each tinted room on the front page — flush and in two members, since a lone row of pearls below the edge reads as a perforation. Not on kickers, not on photographs, not as a divider between paper sections.

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
| `--step-4` | 39.4 | every page's title, in the display cut from 48rem |
| `--step-2` | 27.4 | h2 (essay register) |
| `--step-1` | 22.8 | h3, list and card titles |
| `--step-0` | 19 / 17 mobile | body prose |
| `--step--1` | 16.9 | secondary prose: leads, blurbs, card copy |
| `--step--2` | 15.0 | dense prose: descriptions, table cells |
| `--step--3` | 13.3 | labels, meta lines, chips (`.label`) |
| `--step--4` | 12.0 | micro meta: attribution, dense map/prayer UI. **The text floor** |
| `--step--5` | 10.5 | marks inside artwork and maps only |

Above body the ratio is 1.2; below it 1.1250 — finer because rank down there is also carried by caps, weight and colour. The sub-body half exists so that components never invent sizes of their own (13px, 13.12px, 13.6px and 13.79px all meaning "label").

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

Literata carries editorial headings and prose; Source Sans carries navigation, controls, and metadata, and a field a reader types in is a control. Amiri Quran is reserved for Arabic verse. The two honorifics, ﷺ and ﷻ, have a 2 kB font of their own, cut from Amiri, so the sign is the same on every device (`.honorific`, its box fixed so nothing moves when the font lands). Use the font roles and type scale in tokens.css.

**The transliteration is the type's business.** ʿ and ʾ stand on the width of the mark, not on Literata's half an em, which put a hole on both sides of it in »al-Baqīʿ och« (`scripts/tighten-modifier-letters.py`, held by `fonts.test.ts`), and every letter the corpus transliterates with is in both faces' core files, so a prayer's name is never set partly in a system font.

**Numbers do not part.** A number's groups, a number and what it counts (»12 %«, »30 kronor«), a date (»31 oktober«) and a reference (»nr 977«, »Koranen 59:10«) stay on one line: `noBreak` (`lib/no-break.ts`) puts the no-break space in on the way to the page, in markdown and in text from data. Never in a heading, whose text is its `#fragment`.

**The display cut.** The body files carry Literata's optical-size axis only from 12 to 24, so every headline above 24px was the text design enlarged. `--font-headline` (»Literata Display«, astro.config.ts) is the same OFL family instanced at opsz 72, weight 400–700, 50 kB. It sets the lead and every page's title from 48rem, so one role has one drawing wherever a reader goes in from; a phone's smaller title keeps the text cut. Use it only at ≥ ~40px; at h2/h3 sizes the text cut is the right drawing.

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
7. **Drop cap** — the first letter of the first body paragraph is set as a large serif initial. Decorative, not structural — it signals "the essay begins here" and adds a touch of print tradition. Same typeface as body (Literata), normal weight — the size alone carries it. Essays only: an answer and a fördjupning open on their bold answer sentence or bold headword, which is emphasis enough. Where a browser cannot drop the letter (Gecko has no `initial-letter`), the small-capital first line opens the essay alone; the letter is never merely set heavier than its neighbours.
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
- Social sharing: one quiet »Dela« on an essay, beside the back-to-top circle in the bottom-right corner, at its height and in sentence case. No row of network buttons anywhere.
- Related articles (after the essay, understated)
- Author bio (unnecessary — the content earns trust, not a headshot)
- Comments (none — this is a publication, not a forum)

---

## Principle 4: Reduction

Every element on the page must pass this test: **if I remove this, does the reading experience get worse?** If the answer is no, or "I'm not sure," remove it.

- **No sidebar.** Sidebars split attention. The essay is the page.
- **No stock images, no generic illustration.** On a reading page the hero is the one image; beyond it, no images unless integral to the essay's argument. The front page and collection pages are the deliberate exception — there, essays' own hero images are reused as art-directed doorways (see *The Homepage Image Treatment*), never decorative stock.
- **A documentary photograph is shown as it was taken.** Every essay picture carries a tonal wash in CSS (`EssayImage.astro`: saturation 0.72 and a little sepia, eased back to full colour on hover) so that pictures made for the site read as one set. A photograph of a real place by a named photographer is not such a picture: an essay whose hero is one sets `imageDocumentary: true`, credits it in its first note (»Bilden överst: …«), and the wash stays off. Its file is cut from the original with no colour change — never desaturated in the file, never washed on top. A test holds the flag and the credit together (`lib/documentary-heroes.test.ts`).
- **No color for color's sake.** The palette is: text color, background color, one accent (for links and interactive elements), and muted tones for secondary elements. Four colors maximum. On the front page one tinted ground marks the two rooms of what is measured; no second ground, and never a dark one (see »The Startpage«). A third party's mark beside its name (the AI models' logos) is drawn in ink: the name already says whose it is.
- **Only what stands above the page casts a shadow** (the search dialog, a note's popover, a panel over a map). A map or a picture lying on the page has its hairline or nothing.
- **No borders or dividers unless encoding meaning.** Use whitespace for separation, not lines. On the front page this is a budget, counted in the DOM: **≤ 16 hairlines and ≤ 20 labels in tracked capitals**. A hairline there is one of three things: the rule a section opens under (a room's lower line is the next section's), the rule between the rail's titles, or the rule under a table's heads. A tab bar's own line and the chosen tab's underline are the control, like a pill's outline, and are not counted. Capitals name a section or a kind — the kickers — and nothing else; meta lines, »Alla … →« links, counts and categories read in sentence case. Count again before adding one.
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

The footer groups real links under Läs, Praktiskt, and Om islam.se, from 60rem on the page's one gutter, so its four columns are the canvas's quarters and »Praktiskt« stands on the centre line every halved section turns on. From 48rem to 60rem the gutter stands between the footer's halves only (four columns on it would break »Redaktionella principer«), which is enough to keep »Praktiskt« on that line. It is the navigation backstop without JavaScript. Current-page markers use weight and a visible rule, not color alone.

### The Browse Axes

Essays are cross-cut by three curated axes, each a first-class collection surface:

- **Ämnen** — seven topics in a fixed order (foundational theology first, the Swedish reader's meeting-point last). Each essay carries exactly one; `lib/amnen.test.ts` fails when one carries none, since such an essay stands in no ämne list anywhere.
- **Essäserier** (code and URLs: `tradar`) — hand-curated reading orders: an ordered sequence of essays around a single line of argument, read part by part.
- **Tänkare** — the recurring interlocutors, in two facing columns: the classical Islamic tradition and the Swedish/Western voices that meet it. The composition itself is the argument — a dialogue shown, not declared.

**An ämne is a shelf; an essäserie is a reading order — and the page must say which is which without being asked.** Every essay stands on one shelf, the shelves are permanent, and inside one the newest comes first. A series is a selection (half the essays are in none), it is made when there is a reason (an election, a war, one book read through), and its order is the argument. Named as near-synonyms (»Ämnen« and »Teman«) the two read as one list of topics shown twice, the more so as a series can lie wholly inside one ämne. So the second axis is named for what it is, and **every place a series appears shows its order**: the front page's cards are headed »Del 1«, »Del 2«, »Del 3«, the series page heads each part »Del 1«, »Del 2« in the same brass (on picture cards where every part has a picture, on rows where any part lacks one — never a half-pictured row), the essay's own page says »del 3 av 6« and offers the next part first at its end (»Nästa del«), and a series counts its *delar*, never its essäer, and says how long it is (»6 delar · lästid 65 min«) wherever it is listed. A series shown without its numbers is an ämne again.

Ämnen and essäserier are glimpsed on the startpage, in one design, and tänkare on /essaer/, under the essäserier; all three are browsable in full at `/amnen/…`, `/tradar`, and `/tankare`. They never harden into a top-level menu; they are reached through the palette, the footer, and the homepage movements.

### Names — one name per destination

islam.se stands beside DN, SvD, Bokmässan and NE, so its chrome speaks their language: every destination has **one** name, used in the mast, the footer, the palette, the page's h1 and the front page alike, and every name was checked against how those institutions and Isof (Språkrådet) write the same thing.

| Destination | Name | Not |
|---|---|---|
| /vad-ar-islam/ | Tro och lära (NE's own tab) | Pelare & tro |
| /svar/ | Frågor och svar (Isof advises against »&« in headings; NE writes »och«) | Frågor & svar |
| /tradar/ | Essäserier; one is an *essäserie*, read in *delar* (DN Kultur: »den tredje och avslutande delen av … essäserie«) | Teman (in everyday Swedish a synonym of ämne; beside »Essäer efter ämne« the two names read as one list twice); Trådar — forum/social-media register, used by no serious site; Serier alone (comics) |
| /ai-barometern/ | AI-barometern, always with the article (as Konjunkturbarometern) | Barometer |
| /podcast/ | Podd (DN, Dagen, Isof); the show is *islam.se: essäer, inlästa*, as its cover reads | Podden, Andliga essäer |
| /det-islamiska-aret/ | Det islamiska året | Kalender |
| /nyheter/ | Nyheter, on the front page with its source: »Nyheter från zuhd.news« | Senaste nytt (a second name for one destination, and under the rail's »Senast publicerat« the two read as one label); Världen just nu |
| the pillars / the articles of faith | Islams fem pelare · Trons sex pelare (*arkān al-islām / al-īmān*); the sixth is *Förutbestämmelsen* | trosartiklarna as a heading (NE uses it only for the Christian creed; it stays in prose as a synonym), Ödet |
| ämnen | Swedish usage, each word in its own heading form: the unique and proper definite (Skapelsen, Koranen, Själen, Norden), general ideas bare (Rättvisa, Samhälle, Livsfrågor — the curriculum's word). The »essäer om …« phrase is written per ämne (`omForm`: »om rättvisa«, »om samhället«, »om Koranen«), never derived. Slugs unchanged. | an all-definite set (»Rättvisan«, »Samhället«) — a calque of the Arabic al-; Skriften (reads as the Bible); Sökandet (English »The Search«) |
| tänkare | full names (NE, Litteraturbanken, DN): August Strindberg, Erik Gustaf Geijer | surname alone |

Onward links carry **no counts** (»Alla frågor och svar«, not »Alla 53 …«): no publication measured does it. Reading time is **»lästid 13 min«**, never the translated »13 min läsning«. No »Utforska …« (marketing register, used only on product pages). Page titles take the Swedish spaced en dash: `Sida – islam.se`, never the English em dash.

### The Essäer Page

The essay archive at `/essaer` lists every published essay — title, date, reading time, and description. Use the existing editorial card and row variants; titles, imagery, and metadata have a consistent hierarchy. By default the list is grouped by **ämne** in the canonical order (each heading links to its ämne page); one quiet toggle re-groups it **chronologically** by year. A filter row (ämnen / trådar / tänkare / längd) opens a calm overlay for jumping to a section or narrowing by length — none of it required to read the list. Essays the reader has finished shift value in place (a muted title and a "läst" mark) rather than splitting off into a separate section, and a small ring at the end of the filter row shows how much of the archive is read. All of this is `localStorage`, no account, and one script for every list (`scripts/read-state.ts`). »Läst« means the prose was read: progress is measured on the essay's body, not the page (`proseProgress`), because the notes and onward links below the last line would keep a reader who has finished under the 0.85 that counts as read.

The list is ordered newest-first within each group. No pagination — the full archive on one page. If it grows to hundreds of essays, reconsider — but not before.

Before the shelves stand the two ways in that are not shelves: three essäserier as picture cards, and under them, behind a rule, **Tänkare**: its own words in the first third and the dialogue's drawing across the other two.

The archive is accessible from the navigation ("Essäer") and from the end of every essay. Astro's prefetch-on-hover strategy makes navigation feel instant — clicking a title loads nearly immediately because the page was prefetched when the reader hovered.

### Within an Essay

Keep the text column at its current comfortable measure. Essays, answers and deep-dives all render their h2 contents list through one shared `ArticleBody` component: a collapsed disclosure on mobile, an inline list at intermediate widths, and a sticky left rail at 90rem and above, where the section being read is marked (full text colour plus a short bar — never weight, which rewraps the rows). The rail's left edge stands on the mast's line on all three templates, its reach derived from the frames' tokens (`--rail-reach`, editorial.css), never a fixed distance from the column. The rail must not overlap the right-hand sidenotes or reduce prose width. A note's bare address shows its host in the margin (»svt.se«); the note at the foot keeps the whole address. Anchor offsets clear the header.

The existing reading-resume offer identifies the essay and includes dismissal. It never scrolls automatically. Audio remains continuous through client navigation and all fixed controls respect its reserved space.

### After an Essay

Keep onward-reading links, newer/older essays, sources, and correction links. Group them consistently with shared section spacing and hairline boundaries. Preserve source anchors and their return path. In order: a series part's »Nästa del« first (its number in brass over its title, as the front page sets a part); the encounter and the context rows; »Läs vidare«, three essays by verse, tänkare and ämne, never the essay's own series mates (the next part carries the order); »Alla essäer«; newer/older; the notes, under their own rule and »Noter« where the margin cannot hold them. The end matter of answers and fördjupningar opens like any section: a rule and its kicker one group-space under it (`ArticleSection`), and the sources in the apparatus' size and quiet ink, their underline faint until hovered. An essay's end-matter headings (»Nästa del«, »Mötet«, »Läs vidare«) are the same head kickers. »Alla essäer« stands a group-space under the list it closes and the newer/older pair a section away, so each link sits nearest what it belongs to.

### Reference and Practical Pages

Det islamiska året gives a year's observances the page's two halves from 72rem, read down and then across like a printed calendar, and the fast-length table beside its answer on the same centre line.

Frågor och svar opens with its category row (sticky, in sentence case) and then the question groups, each a section under its rule and kicker, its sentence as the framing line. Its six illustrated deep dives follow the questions, never before them, in the front page's Fördjupning form. The palette (⌘K) is the search. Keep query URLs and filtering behavior.

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

Space the steps by **perceived lightness (L\*), not by mix percentage** — roughly ΔL\* 11 apart, which is what the eye actually reads. Steps under the just-noticeable difference (~3 L\*) are shades that read as one. Never hand-mix a new percentage at a call site; if a tier is missing, add it here and justify it in L\*.

Muted carries margin on purpose: at 5.5:1 it still clears AA on every tint the site puts under it (a raised surface, a hovered row, a selected control). Closer to 4.5:1, those tints push it under AA and components start carrying private workarounds.

A colour that encodes data (the brass on the mosque map's markers and bars) earns its place by encoding something. The moment it is used for ordinary text it is just a fifth colour. Where a figure *must* set words in brass — the emphasised row of a table, the emphasised entry of a timeline — it uses `--color-brass-ink`, a darker cut of the same hue that clears 4.5:1; the mark itself is 3:1 on the light ground and is a fill, never an ink. Hover and focus on ordinary text take the accent, everywhere.

### Washes and Surfaces

Two more families in `tokens.css`, and no percentages at call sites:

| token | role |
|---|---|
| `--wash-hover` | the translucent warm tint under a hovered row or result |
| `--wash-selected` | the same, under a selected control or the marked row |
| `--surface-1` | an opaque panel one step off the ground: a card, an input, a book cover, a quoted block |
| `--surface-2` | a control or a marked table row sitting on such a panel |

Hand-mixed recipes for the same hover or panel differ invisibly on one screen and visibly across two. `src/styles/tokens.test.ts` measures the palette in both schemes and fails if any text tier, wash or surface drops under its floor.

### More Contrast

A reader who asks the system for more contrast (`prefers-contrast: more`, tokens.css) trades rank for legibility: the secondary tiers close up on the ink, every text tier clears 7:1, and the section rule clears 3:1. Forced colours replace the palette altogether (typography.css); this only moves it.

### Dark Mode

Dark mode is implemented and is not an inversion. Dark mode is a separate palette: dark warm background (not pure black), light warm text (not pure white), adjusted accent. The typographic scale, spacing, and hierarchy remain identical. Only the palette changes.

---

## Principle 8: Responsive as Reflow, Not Redesign

The essay is the same on every device. What changes is the container, not the content.

### Breakpoints — one scale, in rem

Every media query and every `matchMedia` is written in **rem**, never px. A rem query scales with the reader's text-size setting, so the whole page turns together; a px query beside a rem one turns half the page at one width and half at another for a reader who has enlarged their text.

The front page turns on five lines, each for a reason:

| Line | What turns | Why there |
|---|---|---|
| **48rem** (768px) | the four promotions two abreast; the news bar on halves; the barometer's three tabs on one line; every tick of the day's line named | two halves fit abreast (a half is 335px and the longest headline 357), and a line has room for six names |
| **56.25rem** (900px) | the mast's links unfold and the front page's doorways go | the mast's five links fit on one line |
| **60rem** (960px) | the essays by ämne, the essäserier and Fördjupning in thirds; AI-barometern's words beside its table; Grunden's three columns; Praktiskt's two lines beside its map | thirds on the one gutter |
| **64rem** (1024px) | the lead beside its rail, and the rail's six titles (three below) | a third of the canvas must hold a title of 22.8px: at 60rem it is 267px and the rail's titles run to four lines |
| **72rem** (1152px) | the news bar on the thirds | a third must hold a headline on ONE line, because the bar holds its place before the news arrives: at 72rem a third is 332px and almost every headline fits; at 60rem most do not. It is the line where the site's other lists go from two columns to three (the orter on the mosque pages) |

### The mast

Three groups in one row: the wordmark, the five links (sections, a hairline, utilities), and the next prayer with the search pill. The rules, each measured:

- **The wordmark is the heaviest thing in the mast.** It scales from 18px on a phone to 26px on the canvas (`clamp(1.125rem, 0.5rem + 1.6vw, 1.625rem)`), growing with the room the links leave it, so the eye finds the name before the menu.
- **The links centre between the wordmark and the chip, not on the viewport.** The air either side of the links is equal and always wider than the air between them (equal `1fr` side tracks put them closer to the chip than to each other).
- **One fluid gap** (`--mast-gap`) for every space in the link row, 12px at 901px to 25.6px on the canvas. There is no fixed override for a band.
- **The shortcut hint names the reader's key:** ⌘K on Apple and Ctrl K elsewhere, stamped before paint by Base.astro.
- **On a phone the chip names the prayer** (»Maghrib 18:33«). Under 360px it shows the sun or moon with the time, which is what fits one row at 320px.
- **Labels say »och«, never »&«.** The ampersand saves 17px a label (34px across the row), and the row does not need it. Språkrådet keeps `&` for company names and tight tables, not for a publication's chrome.
- **The tools are a rank below the sections**: one step smaller, regular weight, muted, behind the hairline, so Tro och lära, Frågor och svar and Essäer read as the publication and Bönetider and Moskéer as its tools. AI-barometern is not in the mast (2026-11-07: it did not blend beside the prayer clock and the map); it stands on the front page, as a room and as the sixth of the doorways, and in the footer and the palette. `.site-links--util a` must win over `.site-links a` on specificity, not source order. Mast links never wrap.

A component that decides both its layout and how much it shows asks **one** condition for both — never the container for one and the viewport for the other, which leaves widths where the two disagree. A new breakpoint takes one of these lines or says why not.

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
- **No layout shift.** Reserve space for dynamic elements so text does not jump. A picture states its width and proportions before its file lands, the site's drawings included, and what a script will close is drawn closed from the first paint: `data-js` is stamped before it.
- **Optimized images.** The hero image must be served in modern formats (AVIF/WebP), responsive sizes (`srcset`), and aggressively compressed. Target: hero image under 150KB at desktop resolution. Astro's built-in `<Image>` component handles format conversion, responsive `srcset`, and compression automatically.
- **Minimal asset weight beyond the hero.** HTML + CSS should remain under 30KB. Fonts are self-hosted and cached after the first visit.
- **Fonts: one table, three rules.** `apps/web/src/lib/fonts.ts` lists every font file; the config and the layout both read it.
  1. *Each text face is cut in two, and an ext range is the file's own coverage.* Core holds Latin-1, the punctuation, the arrows and the transliteration letters; ext holds the rest. Never write a range as »everything outside core«: a page with a character neither file draws (ﷺ) would fetch a file for nothing. `fonts.test.ts` holds each range to its file; `scripts/subset-fonts.ts` cuts them.
  2. *A font is preloaded only where it sets words above the page's first picture*, one file at a time, after the picture's own preload (`preloadFonts` in Base.astro). Words above a picture move it when their font lands; words below it can swap for free.
  3. *Every fallback is matched to the web font's width, on every system and at every weight.* `styles/font-fallbacks.css` holds one face per weight range for Times New Roman and Liberation Serif, Arial and Liberation Sans, Noto Serif and Roboto, written by hand because a web font runs wider as it gets heavier while its fallback does not, and sized on the site's own text at the size it is set in, since Literata's optical sizes make prose proportionally wider than a title. No bare »Georgia« or »system-ui« in a chain. The test of it: a heading measures the same height with the web fonts held back as with them loaded.

---

## Principle 10: Arabic and Transliteration Typography

### Transliterated terms in body text

The body text uses transliterated Arabic terms (tawakkul, ubudiyyah, dhikr). These terms must feel like natural parts of the Swedish text, not foreign intrusions.

- **Italicize transliterated terms** on first use (standard academic convention). Subsequent uses in the same essay: roman (upright).
- **No special styling** (no bold, no color, no background highlight). The term earns its place through the prose, not through visual emphasis.
- **The typeface must handle diacritical marks** used in academic transliteration (macrons, dots below: ā, ī, ū, ḥ, ṣ, ṭ, ḍ, ẓ, ḏ, ṯ, ġ). Test the chosen typeface against a full transliteration set before committing.

### Arabic script in block quotes

Block quotes frequently contain Arabic script — Quran verses, hadith, and classical scholarly citations — typically followed by a Swedish translation in italic. Preserve the Quran components, Amiri Quran font, and their Arabic direction and recitation behavior. Do not restyle Arabic verses as ordinary Swedish interface text.

### Arabic in running text

A run of Arabic in Swedish text, which is how the notes quote their sources, carries `lang="ar"` and `dir="rtl"` (`plugins/rehype-language-parts.ts`), so a screen reader changes voice for it and the punctuation beside it stays on its own side.

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

The homepage shows the coming twelve months as a line (»The Startpage«, item 9): Ramadan as a stretch, the two eids and Ashura as marks, the sun on today, and over it the next observance in a sentence, counting down (»om 136 dagar«, »pågår« through a period). The calendar page contains the full year. Preserve the existing date calculations, source policy, and client date refresh. There is no daily-verse homepage module in the current composition.

**The islamic day begins at maghrib.** A date shown for an *instant* (the horizon in the front page's Praktiskt) turns over at the day's maghrib, not at midnight: `hijriAt()` in lib/markesdagar.ts. A date shown for a *calendar day* (a table row, an observance) stays the civil Umm al-Qura date. The footer's colophon is the build date and says so (»uppdaterad …«).

## The Scorecard — against ft.com

islam.se shares the Financial Times' archetype: warm paper (ours `#fff6e8`, theirs `#fff1e5`, ΔE2000 2.95 apart at the same chroma), a serif display lead under a topic kicker, a hairline-divided rail of serif titles, a tracked-caps sans nav. A reader makes the comparison whether we invite it or not, so it is kept as a table and not as a feeling. The look stays; the site wins on execution, and on what FT cannot have: the day, the drawings, a dark theme, no advertising.

**How it is measured.** `pnpm bench` (`apps/web/scripts/bench/`): Lighthouse on the front page and the shared templates, a DOM probe of the first screen at the sizes readers have, and a layout trace, against a build served with the production `_headers`. Every Lighthouse figure is a median with its spread, never one run (one build can score 83 and 99 on consecutive runs). FT's column is the dated file beside the script. ft.com serves a bot check to scripted browsers; that check is not worked around, so FT is one run per form factor and is refreshed by hand. All of it is lab data from one machine: compare runs on one machine, never across two. The local server speaks HTTP/1.1, so its LCP reads over a second slower than production's: read a local LCP as before and after, and confirm with `pnpm bench --base https://islam.se` after a ship.

**What it holds.** The front page stays at or ahead of FT's column on performance, style and layout work, layout shift, accessibility, the first screen (see »First screen« in the summary), text under 12 px (none: the floor is `--step--4`), HSTS and COOP (`public/_headers`) and page weight. An in-page hero is preloaded (`lib/hero-preload.ts`): it is the LCP element and stands ~100 kB into the document. Fonts follow Principle 9. The mast chip's label contains its visible text; the lead's kicker link is clickable over its whole height; one region per name. Results and the before/after tables are in `docs/design-history.md`.

`scripts/assert-page-budgets.mjs` runs after every build in `verify` and `ship` and fails on the rows that can be read off the HTML.

**Still open.**

- *What the font preloads cost the cover.* They stay: without them layout shift and layout work fall back behind FT's, though LCP improves in the local (HTTP/1.1) lab. Measure the gap live with `--base` after a ship and reopen this if it is large there.
- *Font weight* is above FT's (290 kB against 247). Pinning the italic's optical-size axis would bring the first load to roughly 240 kB and change how italics are drawn at small sizes. A typographic decision, not taken.
- *Best practices on the live site* is 92, not the 100 a local build scores: Cloudflare injects a bot-detection script the CSP blocks. It is a zone setting (Bot Fight Mode / JavaScript Detections), not code.

## Shared Implementation Contracts

Use tokens.css for values; editorial.css holds the shared UI presentation contracts that refine the existing layout and scoped components. The reading measure is 42rem and the prose measure remains unchanged.

**Two frames.** *The canvas* (`--canvas-width`, `.home`) is the mast's: 76rem of content plus the mast's padding. The front page, every index, directory and tool page, and the footer on every page use it. *The reading frame* (`--reading-frame`, 64rem) holds the pages people read through: essays, svar and fördjupningar (`.reading`), and the browse-shell pages that are mostly one column of running text (`.home.home--text`: the two bönetider guides, the mosque guide, the AI-barometern method and question pages, the podcast episode list, Nyheter). The mast is what holds still between pages, so an index takes the canvas: set narrower than the menu over it, it looks shrunk. The lines never grow: on the canvas, prose keeps the measure and **the width goes to the things that are many** — cards in thirds (never five or six across: "very small and tight"; never stretched to fill a row: "drawn out"), directories in columns read down then across, a picture beside its list rather than under it, a table beside the text that explains it. A page whose content is a single measure-bound column belongs on the reading frame, not on the canvas with an empty half beside it.

**One grammar off the front page.** The front page's vocabulary holds on every page: a hub does not head its sections, draw its rules or set its cards its own way. A new page uses it:

- *A page's opening and close.* Every page on the shell (`main.home`) opens one group-space under the mast, whether a title, a kicker or a breadcrumb stands there, and closes a φ over the footer. The mast is what holds still between pages, so a title that starts somewhere else on each one jumps. A page's own `<style>` does not move either line.
- *A section* on any canvas page is a `.page-section` (layout.css): a section space, its rule, one group-space, the head row (`HomeHead`: the kicker and, at the right, the way on), one group-space, its content. The rule is drawn by default and the first section under a page's opening opts out with `.page-section--first`; never a sibling selector, which cannot see a section that starts a wrapper. An index section never takes `.home-movement` (its content-visibility placeholder throws anchor jumps). /essaer/'s ämnen and years, /svar/'s categories and its fördjupning band, /vad-ar-islam/'s clusters and »Läs vidare« open so; the tool pages keep their sans h2s, which carry search wording, under the same rules.
- *A kicker* is `Kicker.astro`, in one of two forms: `head` (it heads a section or a list: ink, 600) and `quiet` (it stands over a title and names its kind: the meta colour, 400), both behind the brass point. An essay's ämne, an answer's category, a fördjupning's »Fördjupning«, the collection pages' kind, /nyheter/'s »Världen« (which kept the retired dash) and the end matter's headings all wear it.
- *A picture card* is one object in two markups (the essay card, `CardList`; `FaktaCard` for the honorific it renders), all reading `--card-*`: the title in Literata at `--step-1` in ink, the line under it at `--step--2` in the quiet ink, whitespace between cards, never a hairline under each. A card's hover is tonal only.
- *A list of essays* shows each deck's opening sentence (`leadSentences`), on a row as on a card. Rows have a hairline between them and none under the last: the next section's rule, or the footer's, closes the list.
- *A count or a meta line* reads in sentence case (»6 delar«, »12 avsnitt«, the footer's colophon); so do the filter chips. Capitals name a section or a kind and nothing else.
- *Ways on* from a page are items on its grid (`OnwardLinks`, named and glossed from `lib/navigation.ts`'s `destinations()`; a tool page's `RelatedLinks` on its thirds), never rows across the canvas with the arrow at the far edge.
- *A phone's tabs* are one row that scrolls sideways under its own rule, never two stacked bars.
- *A note to a table or a figure* is `--step--2` in the quiet ink, a group-space or less under it, and never larger than what it explains. A way on is not repeated inside the note beside it.
- *A control's corner.* A pill is `--radius-pill`, whatever its height. A form's labels read in sentence case, and its one action is at least `--tap-target` high.
- *A table of figures* is `.data-table` (layout.css): the text face at `--step--2` with tabular figures set to the end of their column, the first column and its head at the start, the heads in the meta ink and in sentence case over the one rule, the rows parted by a fainter line and none under the last. A table adds only what is its own: a sticky head, today's row, a denser step where a phone needs it.

Use --space-control for compact interface gaps, --space-group within related content, and --space-section between editorial sections. Retain the larger prose spacing tokens where they already carry meaning. Inputs are at least 16px; principal touch controls are at least 44px high. Focus indicators, selected states, loading, empty, and error states belong to the shared design.

Check 390px, 768px, and 1440px, both themes, long titles, absent images, Arabic, 200% zoom, reduced motion, keyboard navigation, failed third-party resources, and back navigation. Run repository verification before release. Compare representative loading and layout behavior with the previous version; do not add a framework or backend for presentation changes.

## Summary of Constraints

| Element | Constraint |
|---|---|
| Typefaces | Literata, Source Sans, Amiri Quran for Arabic, and Amiri's two honorifics |
| Colors | 4 maximum (text, background, accent, muted) |
| Body font size | 18–20px desktop, 17–18px mobile |
| Line length | 60–70 characters |
| Line height | 1.5–1.6 body text |
| Hero image | Optional, responsive, essay-specific artwork |
| JS for reading | Zero required (prefetch-on-hover for fast navigation) |
| Animations on content | None |
| Sidebar | Contents rail on every essay, answer and deep-dive on sufficiently wide screens; preserve sidenotes |
| Startpage | »Dagen och texten«: the opening (the lead's words and photograph in two thirds beside a rail of six titles, level by construction; the news as one bar); chapter 1 on paper (the essays by ämne and by essäserie, in one design); a room on tint (AI-barometern, a finding as a table); chapter 2 on paper (the facts, then depth); a room on tint (the day and the year as two lines, the mosques' map); the promotions last; inside the mast's canvas; not a single screen, not a feed |
| Front-page headings | The lead's headline; one title, »Vad är islam?«; a kicker in ink at weight 600 heading every section and list; a quiet kicker only over a title |
| Front-page sections | Each opens the same way: a rule (on paper) or the room's edge (on tint), its kicker, the way on |
| Every other canvas page | The same grammar (`.page-section`, `HomeHead`, `Kicker`), one picture card, sentence-case meta and chips, ways on as items on the grid, one opening under the mast and one close over the footer (»One grammar off the front page«) |
| Reading templates | One kicker over the title; fördjupning on the essay's header with »lästid«; end matter under rules and kickers; the next part first at a series essay's end; the rail on the mast's line |
| Front-page grid | Twelve columns, one gutter (`--grid-gutter`); every block starts on a column edge; one set of vertical steps (section space, line, group space, kicker, group space) |
| Front-page grounds | Paper for what is written, one tint for the two rooms of what is measured; no tint holds two sections |
| News on the front page | Six notices, each a headline with its stamp under it, at the foot of the opening under one hairline, two to a third from 72rem (`RAIL_ANTAL`); place held before the fetch, layout shift 0; »Nyheter från zuhd.news«, never »Senaste nytt« |
| Front-page budget | ≤ 16 hairlines (a tab bar's own line is the control and is not one), ≤ 20 tracked-caps labels, one tint and no dark band |
| Decks in lists | whole sentences only: the deck's opening sentence (`leadSentences`, lib/format.ts), never a line clamp ending in »…« and never the full deck side by side |
| Dates | without the current year (»23 september«); another year is printed (`formatDate`) |
| Navigation | Width-based header, search/menu dialog, grouped footer |
| Text floor | 12 px (`--step--4`) on the front page and in the shared chrome; `--step--5` inside artwork and maps only |
| First screen | At 1280×720: the lead's headline and deck above the fold. At 1440×900: the whole lead, its photograph and all six rail titles |
| Pace | No front-page movement past ~800px at 1440 without a stated reason; measure before and after |
| Layout shift | ≤ 0.01 on the front page, essay, essay index and answer index, on a phone |
| Fonts | Cut into core and ext by coverage; preloaded per file, only above the first picture; every fallback width-matched |
| Scorecard | `pnpm bench` against the dated ft.com baseline; `assert-page-budgets.mjs` after every build |

Performance and weight budgets are in `TECHNICAL_SPEC.md`.
