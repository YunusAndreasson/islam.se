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

The sequence, top to bottom: an opening, two chapters on paper each followed by a tinted room, and a close (product decisions 2026-10-10; from 2026-09-26 until then the introduction to Islam stood second and the news in the page's last third, and until that day's last round the page ran in eleven movements on alternating grounds):

1. **The orientation line** — one sentence saying what the site is, becoming »Fortsätt läsa …« for a returning reader with an unfinished essay.
2. **The lead as one package, beside a rail** (product decision, 2026-10-10) — on desktop two columns that start and end on the same lines. Two thirds hold the lead: kicker, headline, deck and date, and directly under them its photograph at the same width. The last third, behind a hairline, is a rail of the six essays before it, titles and dates only, a rule between each. **Level by construction:** the picture's row is the flexible one, so the photograph is as tall as the rail needs and never flatter than 5:2; when the rail is the shorter column its list spreads to the foot. Nothing is measured in script. On a phone and a tablet: kicker, headline, photograph, deck, then the first three of the rail. A headline past 50 characters steps down a size on desktop (one title in the archive; at 64px it stood on four lines). Two arrangements came before it the same autumn. The photograph across the whole canvas on top, words under it: 486px tall from y=122, it cut the headline at 1280×720. Then the words and an index of three on top with the photograph across the canvas under both: in Chrome at 1440×900 the words ended at y=380 and the index at 450 with 100px of empty paper under the date, the photograph belonged to neither column, the fold cut it at every laptop size, and the first screen offered four essays (user review: "I hardly see any changes", "I don't think we are matching Financial Times"). The first screen now offers seven, in columns that end together. The six doorways follow only at widths ≤900px, matching the mast's collapsed navigation; wide touch devices keep the inline mast links without duplicating the doorways.
3. **The news bar** (code: `Nyheter.astro`, product decisions 2026-10-10 and 2026-10-11) — at the foot of the opening, under a hairline: the kicker »Nyheter«, the credit »från zuhd.news«, »Alla nyheter«, and **six notices, each a headline with its stamp under it** (»I går 23:48«), two to each of the page's thirds. It was a column of five under »Senaste nytt«, sharing a row with the Islamic year 4 600px down a 7 400px page: the one thing that goes stale by the hour, in the last third, under a label promising the opposite ("feels off … labeled like that and so far down", user review). News stands first on a front page because it is newest; this news is not the site's own, so it gets the newest position at the smallest size, in the sans that marks it as reported elsewhere. **Six, not three.** For a day it was three headlines on one line each, and three looked right and counted wrong: "i have never seen a site with that few items … either more or only one with a link to the news feed" (user review). A »senaste nytt« block is five or six rows wherever a Swedish reader has met one, so three read as a list cut short; one line with the way on was the other way out and was not taken, because one headline of fifty-five says nothing of the day. **A headline, then its stamp, never the clock in front.** With the clock first a third of the canvas left the headline 305px, and one headline in ten of the feed's ended in an ellipsis: every other visit, with six on the page (measured against 95 headlines; the longest is 357px). Under each other the headline has its whole column and none is cut; it is the order every other item on the page has (a title, a meta line), and it puts the headlines on the three column lines the rail's titles and the cards stand on. **Columns where a column holds a headline:** one column under 48rem (there a long headline takes a second line), halves from 48rem, thirds from 72rem. The thirds stood from 60rem with the cards', where a third is 269px and four headlines in five were cut; a card wraps its title and a headline that holds a place cannot. **Its place is held before the news is known:** the rows come from a fetch in the browser, in columns each headline is exactly one line, and the bar is in the layout from the first paint and only made visible when it has rows, so nothing moves when they land (measured 2026-10-11: layout shift 0 at 1152, 1280, 1440 and 1920 wide, on a tablet and on a phone, also with the fetch two seconds late; where a headline can wrap the bar stands below the first screen). With no news it is taken out; without scripts it is never in the layout. Six is therefore a layout contract as well as a count (`RAIL_ANTAL`, pinned by a test, with `--remsa-rader` in `nyheter.css`). It stood between two hairlines until 2026-10-10; see »A rule opens a section« for why it has one.
4. **The essays by ämne** — the first chapter's first section (product decision, 2026-10-10: "they connect better to the top essay"): the kicker »Essäer efter ämne«, tabs for the six ämnen, the chosen one's framing line and three essays, each with a 3:2 photograph, sharing rows so pictures, titles and separators align. The lead and the six essays of the rail remain excluded. Below the thirds the three are what a shelf's are, its newest first: one above the other on a phone, a lead above a pair on a tablet.
5. **The essäserier, in the same design** (code: `TradarHome`; product decision 2026-10-10: "we could use same design for ESSÄSERIER as we do for ESSÄER EFTER ÄMNE with possibly just small adjustments") — the kicker and »Alla essäserier«, a tab for each of three series, the chosen one's framing line, its **first three parts** as picture cards, »Hela essäserien« and, on that line, »6 delar · lästid 65 min«. The one adjustment is a series' one difference: **every card says which part it is** (»Del 1«, »Del 2«, »Del 3« over the title, in the brass every ordinal on the page is set in; »Del 2 · läst« and a muted title once read, from localStorage). The two sections are the same essays shelved two ways and now look it. Three forms came before, the same autumn: a line with a ring per part; the number inside the ring ("doesn't look polished"); and each series as a numbered list of all its titles, three lists side by side, which kept the order and read, under the picture cards, as a different kind of thing. Below 60rem the three parts keep one row and scroll it sideways, the next one's edge showing: a series' parts are equals in an order, and a lead above a pair, as a tablet set them until 2026-10-11, ranked »Del 1« over the two after it. One rule draws that row for the essäserier and for Fördjupning (`editorial.css`, »A row of cards that scrolls sideways«): each had its own, in its own file, and they had come apart (a card 85% and 78% of the row, a scrollbar drawn and hidden). Called Teman until 2026-10-10; see »The Browse Axes« for why the name and the numbers changed together.
6. **AI-barometern, the first room** (code: `BarometerRail`) — on tint, in the page's thirds: the room's own words in the first (kicker, what is asked of whom and how often, »Till AI-barometern«, the series' drawing under them) and **a finding drawn as a table** across the other two. Three findings stand behind tabs, one at a time; the tab is the finding's title and its panel is the answers themselves: the statements side by side, the five models under each other. **The table explains itself, or it is the wrong table** ("no need to explain the graph … if the graph needs an explanation, then the graph should be improved and made clearer", user review 2026-10-10): a sentence stood over it saying what it showed, and three things do that sentence's work. The column heads are set as what they are, statements put to a model: in »…«, under the label »Påstående«, and where two statements are one sentence about two subjects the subject is the only bold thing in the row (»**Palestinierna** har rätt till väpnat motstånd« beside »**Ukrainarna** …«). An answer is a meter of four blocks, as many filled as the model agrees (four for »instämmer helt«, none for »tar helt avstånd«), with its word beside it as its key; where a model took no position there is no meter at all, so »avstår« is never read as a low score. And a column is then read by its lengths before a word of it is read. The sentence is kept as the table's caption for a reader who cannot see it. With two statements the table's last column is the canvas's last third. The panels lie in one cell, the unchosen ones invisible and not removed, so the room is as tall as its tallest finding and nothing under it moves when a tab is chosen. It was an introduction beside three findings as sentences, a block of prose about a measurement that never showed one ("maybe we could make a better job of presenting the AI barometer"); before that the hub's chip matrix, »+ A + A +« under a key ("looked broken", "scattered", 2026-09-25); and the first table showed one finding with two more as sentences under it ("now we only show one question, could we do some smart tab bar to show at least 3?"). It stood last but one, under the prayer times, 5 100px down: the site's own reporting stands with the site's own writing, and the monthly before the evergreen. Only findings of two or three statements are drawn here; a set of five is the hub's.
7. **Grunden** — »Vad är islam?«, the second chapter's first section, on paper, **one box in three columns** from 60rem: the opening (kicker, title, one sentence, the two ways on, the drawing under them), the five pillars as a numbered list, the six articles of faith as a list, the three labels on one line. Each term is the Swedish name with its transliteration on the same line and the gloss under it. It was the opening over five full-width rows over a grid of six, 1 324px at 1440, the tallest movement on the page ("too high", user review 2026-10-10); the same words stand in 614px. The full-width rows had replaced five 173px columns that read as tight (2026-09-25); a third of this canvas is 373px, the width the articles always had. Two lists of five and six do not end together and are not made to. Below 60rem the three stack, the articles in pairs. No Arabic script at the ends of the rows: it added competing weight without adding meaning beyond the transliteration (user review, 2026-09-25).
8. **Fördjupning** — immediately follows Grunden (introductory facts, then depth), under its own rule: the head row with »Alla fördjupningar«, **the Fördjupning page's own ingress as a framing line** (the two card sections of chapter 1 each open with one, and this was the one section whose name a reader had to guess the meaning of), and **three picture cards on the page's thirds** (product decision, 2026-10-10: "it just look unbalanced with two large images then two without … maybe 3 images in one row for the most important, the link to the subpage"). The card is the one the essays by ämne and the essäserier are set in, so the page's three card rows are one kind of thing, and the three stand column for column under the three columns of »Vad är islam?«. The curated list's order is the order on the page (`FordjupningHome.astro`); the other twenty are the index page's. What came before, the same autumn: four in a row and thumbnails beside text, on a 64rem canvas, "small dark boxes" (2026-09-25); two by two, 1 103px, the tallest movement on the page, a second front page inside the first; two large pictures over an A–Ö run of every other title, "just like a list dumped there, not good looking at all"; and two large pictures over two topics in words, two at full weight and two at a fraction of it. A third of the 76rem canvas is 373px, the width the essay cards have had all along, which is what separates this from the four-in-a-row that failed. **A list on the front page is set as items — a title with something under it, on the grid — never as a run of links.** A phone and a tablet scroll the three sideways with their pictures, in the row the essäserier's parts scroll in. The framing line owns the gap above the cards; card padding must not double it.
9. **Praktiskt, the second room: time and place** (code: `PraktisktHome`) — on tint: **two lines in one hand** across the first two thirds of the canvas and the mosques' map in the last. *Bönetider*: today as a line from midnight to midnight (`PrayerHorizon`), the six times as ticks with the prayer's name and its clock under each, daylight drawn heavier, the islamic date turning at maghrib's tall brass tick, the sun at the current minute. *Det islamiska året*: the coming twelve months as a line (`Arslinje`, `lib/arslinje.ts`), the months as ticks, Ramadan drawn heavier, the two eids and Ashura as marks with name and date under each, the islamic year turning at 1 Muḥarram's tall brass tick, the sun on today. Each line has a head row (its destination's name, and on that line the way further in) and one live sentence (»Nästa bön Fajr 05:21 i Stockholm.«, »**Ramadan** 8 februari – 8 mars 2027 · om 121 dagar«). The year's line slides: it opens on the first day of the month we are in, so every yearly observance lies ahead on it once; a fixed hijri year would be eleven months of the past by Dhū al-ḥijja. Which labels fit is measured in the browser on the line as drawn (a phone names Ramadan and one eid; the build's estimate is the answer without scripts). It was four tools in two columns beside a map 136px wide and, under the room, a movement of three dates: two bands for one subject, 750px, mostly empty paper round four one-line descriptions. Then three columns of lists, which read as a third telling of what the drawn promotions under the room already say about prayer times ("PRAKTISKT and the beautiful illustrations below overlap a bit … maybe … the islamic year on a timeline which looks nice and with links to the pages"). The room now shows what a promotion cannot: the day and the year as they stand this minute. »Bönetider under året« is the day's way further in, not a tool of its own, and Moskéskärm stands only where it is drawn, in the close.
10. **The closing promotions** — podcast and app in the first row, the book and the mosque screen in the second (the screen beside the book since 2026-10-04, on the same two halves), on paper under the second room, with the footer's rule under it. The wrapper owns one `--space-section` gap between rows. Keep each promotion's heading, drawing, copy and destinations. This shared region groups ways to take the publication and tools elsewhere. **The words stand on the page's lines and the drawing to their right** (2026-10-10). From 64rem each half is two sixths of the canvas for the words and the third for the drawing, flush right: so the left-hand promotions' kicker, title and links stand on the page's left line (x 107 at 1440), where every section's kicker stands, and the right-hand ones' on its centre line (739), where the footer's »Praktiskt« stands under them; the four drawings end on two lines, the right-hand pair under the map. The drawing stood first until then, in a 10rem column, and pushed the words in to 295 and 927, on no line of the page: "the dot for PODD is pushed to the right compared to PRAKTISKT above so doesn't form a logical vertical line", and before that "PRAKTISKT and the illustrations don't land perfectly, then the footer … something doesn't feel balanced" (user review). Each half's links stand on its foot, so the two rows of links meet across the gutter whichever half has the longer line; and there is as much air under the last row (to the footer's rule) as over the first (from the room's edge). **One component draws the four** (`Promo.astro`, 2026-10-11), on one grid of two halves. It was written three times, each a copy of the one before, and the copies had drifted where nobody set them side by side: the book's two links stood 12px apart and the others' 8. On a phone the promotions stack, each drawing half a step over its own kicker and a section space under the links before it: a drawing has open paper round it, and at a whole step it hung midway between two promotions and belonged to neither. From 48rem two stand abreast, the drawings still above (beside the copy on a tablet a 10rem drawing left the words 147px): there every drawing gets the whole 10rem box and stands on its foot, so the two kickers of a row meet on one line whichever drawing is the taller. The book's kicker stood 34px above the mosque screen's beside it. From 64rem the drawing stands beside the words.

**Tänkare is not on the front page** (product decision, 2026-10-10: "let's move TÄNKARE into a suitable place in the ESSÄER subpage"). It stands on /essaer/, under the essäserier and before the shelves, in the form made for the front page that day: its own words in the first third (kicker, the Tänkare page's ingress, one sentence saying what the lines are, »Alla tänkare«) and the drawing across the other two thirds, the two traditions in facing columns joined by the essays they share. Until then /essaer/ had the same glimpse as a head row over a figure 46rem wide, centred in the 76rem canvas, last of all, 11 000px down. Preserve the drawing and its hover behavior.

**Why this order** (product decisions, 2026-10-10). What the site writes, then what it measures; what Islam is, then what the day and the year are; then the ways to take it all elsewhere.

- *The opening and chapter 1: read.* The lead and the latest essays; the day's news as one bar under them; then the essays two ways, by ämne and by essäserie. A reader who has just met the lead looks for more essays next. The introduction to Islam stood between the lead and the essays it leads from 2026-09-26 (the new-reader priority) and at 1440 put 2 500px of reference between the two; new readers still have »Tro och lära« first in the mast, and the doorways under the opening on a phone.
- *The first room: measure.* AI-barometern: the site's own reporting, monthly.
- *Chapter 2: learn.* What Islam is, then the same territory taken all the way down.
- *The second room: practise.* The day and the year as two lines, and the mosques.
- *The close.* The ways to take it all elsewhere.

The rules: **what goes stale soonest stands highest** (the news under the newest essay, the monthly measurement before the standing reference, today's line over the year's); **what belongs together stands together** (the year under the day; facts beside depth; the essays' two shelvings one under the other, in one design); and **size follows rank, not freshness** (the news is newest and smallest, because it is not the site's own).

**Every section opens the same way: a rule, its kicker, the way on** (product decision, 2026-10-10: "read each section from top to bottom to make sure they are consistent with a heading and easy to understand where you are and good separation").

- *A rule opens a section that follows another on the same paper* (`editorial.css`; a chapter is a `.home-chapter` in `index.astro`), and the head row stands one group-space under it. What stands under a rule belongs to that rule's kicker, down to the next rule. **A room keeps the same vertical grammar**: a section space, a line, one group-space, the kicker. Its upper line is the cornice, and its kicker hangs one group-space under that; its lower line is a rule like the sections', along the room's foot, and the section after the room opens under it at the same distance. Until the day's last round a room had a line above and none below, its kicker 5rem under the first, and the section after it began 4rem under a bare edge: »Fakta om islam« was the one section that opened without a line ("consider the horizontal lines below and above so the lines blend well with FAKTA OM ISLAM"). At 1440 every kicker on the page now stands 24px under a line. The news bar opens under one rule like any section. It stood between two; the lower one then lay between its last headline and the next section's label and belonged to both ("very tight in connection with news above … hard to see what belongs together"), and without rules the sections under »Essäer efter ämne« read as its contents ("it looks like ESSÄER EFTER ÄMNE contains almost everything").
- *A kicker has one of two jobs and is set by which* (`layout.css`). It **heads** a section or a list (»Senast publicerat«, »Nyheter«, »Essäer efter ämne«, »Essäserier«, »AI-barometern«, »Fakta om islam«, »Fördjupning«, »Praktiskt«): then it is the heading, in ink and at weight 600 behind the brass point. Or it stands **over a title** and names its kind (the lead's ämne; »Podd«, »App«, »E-bok«, »Moskéskärm«): then the title is the heading and the label keeps the quiet form. Before this the section kicker was quieter than the column labels set on its own line.
- *One title.* The page has one serif title under the lead's headline: »Vad är islam?«, the question the site answers and the page's head term, set as the first of Grunden's own words under its kicker. »Essäer efter ämne« was a second, at 33px over two tracked labels, and read as the parent of the two sections after it; it is a kicker like theirs now. A section does not take a title to gain rank: its position and its content carry that.
- *The way on stands in one of two places.* A section that is a row of items has it on the head row, at the right (the rail, the news, the essäserier, Fördjupning, the two lines in Praktiskt). A section that opens with words of its own in the first third (AI-barometern, Grunden) closes those words with it.
- *One tab grammar* (`layout.css` `.home-tabs`, `.home-cards`; `scripts/home-tabs.ts`). The essays by ämne, the essäserier and the barometer's findings show one of several behind the same tabs: links on one base rule, the chosen one in ink over the accent, arrow keys between them, and without scripts the links they are written as, the first panel open.

**Pace: no movement taller than a screen, and none taller than the lead's rank allows.** Heights at 1440 (2026-10-11): the lead 696 and the news bar 138, the essays by ämne 686, the essäserier 757, AI-barometern 492, Grunden 614, Fördjupning 492, Praktiskt 459, the promotions 512: a page of 5 926px, from 8 526 on the morning of 2026-10-10 (on a phone 9 846, from 10 105; on a tablet 7 534, from 7 780 before the essäserier kept one row there). Nothing is taller than the opening (866 with its news bar). Looking and reading alternate (picture, line of news, pictures, pictures, table, reference, pictures, two lines and a map, drawings), and the photographs come as the lead and then three rows of cards at one size, two under the opening and Fördjupning past the middle: the lead's is the one large picture on the page. Before it, the two tallest movements on the page (Grunden 1 324, Fördjupning 1 162) stood directly under the lead, and until the same day's third round Fördjupning's two rows (1 103) made a second, longer peak than the first. Measure a movement's height before and after changing it; a movement that grows past ~800px at 1440 says why.

**One pair of margins — the mast's — and two rooms.** Keep the 76rem canvas (`--canvas-width`), existing warm paper and one `--ground-tint`, with content aligned to the mast. **Paper is for what is written and the tint for what is measured**: AI-barometern's answers, and the day, the year and the map. Everything else stands on paper, so the page reads paper, room, paper, room, paper, and a change of ground says a different *kind* of thing has begun. Until 2026-10-10 the grounds alternated by movement, kept by position and not by name: nine stripes down the page, the tint falling on whatever stood in an even place, each stripe with a layout of its own. Every movement was then a room, so none was, and the page read as modules stacked: "it feels like we 'stuffed' much that might look good in isolation but doesn't read well as a whole" (user review). The alternation had itself replaced two shared tints (Grunden + Fördjupning, 2 550px; Ämnen + Trådar + Tänkare, 1 750px), removed on 2026-09-27 for reading as crammed (»intryckt«). What stands from that review: **no tint holds two sections.** A tint has edges, and two things inside one are pressed together; paper has none and holds a chapter, whose sections are told apart by the rule each opens under. A new movement goes on paper, in a chapter, unless it is a third thing that is measured; a third room needs a reason this paragraph does not have. Preserve the restrained palette and artwork; no dark band, new color or new ornamental divider — the one ornament a room carries is its cornice (»Stuckatur« below), which marks the room the tint already marks.

**One grid: twelve columns, one gutter.** The canvas is twelve columns behind one gutter, `--grid-gutter` (3rem); at 1440 a column is 57px and the column edges fall on 107, 212, 318, 423, 528, 634, 739, 844, 950, 1055, 1160 and 1266. Every section is a division of the twelve, so every block on the page starts on one of those edges:

| Division | Columns | Where |
|---|---|---|
| thirds | 4 + 4 + 4 | the news bar, the essays by ämne, the essäserier, Grunden, Fördjupning |
| two thirds and one | 8 + 4 | the lead and its rail; Praktiskt's two lines and its map |
| one third and two | 4 + 8 | AI-barometern's words and its figure (the table's last column is the page's last four) |
| halves, each words and drawing | (4 + 2) + (4 + 2) | the four promotions |
| quarters | 3 + 3 + 3 + 3 | the footer, »Läs« in the first two |

From the news bar to the second room everything stands on the thirds; the close turns on the centre line (739), which the promotions and the footer share. Measured in the browser on 2026-10-10: sixteen section-level grids, one column gap between them. Until then three things were off it. The promotions kept a gap of their own (1.75rem between drawing and words); the rail's words stood a pixel past the third line, by the width of its own hairline; and the footer had a 1.5rem gutter, which put its columns 12px off the centre line. Before 2026-09-26 three gutters were in use and put the thirds of three movements 5–10px apart. What is inside an item is the item's own (a table's column of names, the map beside its words); its outer edges are the grid's. A new movement takes the gutter and a division of the twelve, or says why not.

**Under 60rem, one gutter to a width** (measured 2026-10-11). Where the page stands in halves (from 40rem: the ämne's pair, the news, the six beliefs in pairs, the promotions) the gutter is the page's own, so every second column is on one centre line (403 at 768), and the doorways' three stand on the thirds AI-barometern's opening turns on (275 and 531). A phone's two-ups (the doorways, the six beliefs, the footer) share one group-space, their second columns on one line (202 at 390). Until then the beliefs' pairs kept a 24px gap at every width and stood 12px left of the centre line on a tablet, and the doorways had a fluid gap of their own (3vw), 4px off the two lists under them on a phone: the near-misses the desktop grid was cleared of the day before, left standing where nobody had measured. The footer cannot take the page's gutter between all four of its columns there (at 768 they would be 143px and »Redaktionella principer« breaks over two lines), so from 48rem, where the promotions over it stand in halves, it takes it between its own halves: »Praktiskt« on the centre line, 12px right of where it stood, the two columns of each half a group-space apart.

**One set of vertical steps.** Down the page a section is: a section space (4rem at 1440), its line, one group-space (1.5rem), its kicker, one group-space, its content. Measured the same day, every kicker stands 24px under its line and its content 24px under it, a room's included (tabs under a kicker have a 12px margin, because their own padding is the other 12). Two smaller steps exist and each has one job: 15px between a label and the title it stands over (the lead's ämne, the four promotions), and the news bar's own half-steps, because it is the one thing on the page set at the smallest size. Before this the distance from a kicker to its content came in five sizes (8, 12, 15, 24 and 30px).

**One rank, one ink, one size per role.** Card and list titles are `--color-text` whether the component is the page's own or a shared list (editorial.css); essay meta lines are `--step--3` everywhere on the page; a head-row link (beside a kicker or a department name) is `--step--3` muted, a link that closes a block is a `.section-link` at `--step--2` — never the two sizes side by side for the same job. Literata's discretionary ligatures (c‿h, s‿t) belong to the lead's display headline only; at card-title size they read as a rendering fault. Kickers are one box whether `<p>` or `<h2>`, so kickers set side by side meet on one line. **A role is written once** (2026-10-11): the picture card's inside is four numbers in `tokens.css` (`--card-*`), read by both card markups, which had drifted a pixel apart (a title's leading 1.22 and 1.2, a blurb's 1.45 and 1.5); the sentence a section opens with (the lead's deck, AI-barometern's, Grunden's) is `.home-ingress`; and a framing line is set in the ink of the blurbs it introduces, a size above them. At the meta grey it wore the unchosen tabs' colour, went with them by likeness, and was the faintest prose in its own section.

Do not replace this publication with a generic promotional landing page or reorder its priorities without a product decision.

Use two image roles on the front page: the lead's photograph (two thirds of the canvas, under the lead's words, as tall as the rail beside it and never flatter than 5:2 — the only picture on the first screen of a laptop, and the widest on the page) and the 3:2 card (one picture per department, Fördjupning), always at the full width of its column with its title beneath. No thumbnails hung off the side of a text row on the front page — rows of small dark boxes were the one place the pictures looked pasted on (user review, 2026-09-25). The collection pages (an ämne, an essäserie, a tänkare) show their essays as the front page and /essaer/ do, picture cards and then rows; their thumbnail rows had no caller left (2026-10-16, »One grammar off the front page«). Keep consistent crops within each role. The photograph has its own space; titles and introductions remain readable outside it. Quiet tonal treatment is sufficient: no competing lift, zoom, and vignette animation.

### Article Openings

Title, introduction, metadata, artwork, and optional listening controls lead into the prose. Heroes are responsive and optional; they do not occupy a mandatory full viewport. Caption spacing belongs to the image. Artwork never follows the reader down the page.

### The Drawings — the site's own hand (2026-09-26)

Photographs belong to the essays and the fördjupningar; the site's own sections speak through a series of pencil drawings, one hand throughout: graphite in the manner of J. M. W. Turner's sketchbook studies, quick and searching, much open paper, and **one** ochre pencil per drawing for the one thing that is gold (the ribbon, the app's arc, the barometer's needle, the new crescent, the lamp's flame). `src/components/Ritning.astro` draws them; `src/lib/ritningar.ts` lists them; `src/assets/ritningar/README.md` holds the prompts and the processing, so a new one is made in the same hand (always with an existing drawing of the series attached as reference).

- **What may be drawn.** Things, buildings, landscape, plants. **No people, no animals** — the classical position the site takes on drawn images of living beings. Swedish where the subject allows it (the lake at first light, the farmhouse barometer, birches and pitched roofs).
- **Two papers, no frame.** Each drawing exists twice: graphite on white for the light theme, the same drawing in white chalk on black for the dark (an edit of the light one, so the composition holds). The white paper is multiplied into its ground and the black one screened, so the drawing lies straight on the page in both themes. The drawing carries its own ground (`--color-bg`, which the tinted bands re-point) because blending needs one inside its stacking context. Inverting one drawing for both themes made a negative, a light sheet on the dark page "doesn't work", and chalk at reduced opacity was "too dark" (user review, 2026-09-26).
- **Where, and on which line.** A drawing is placed by one of three rules, never by feel ("so it doesn't look like something we threw at the pages", 2026-09-26):
  1. *A section opening* — a hub's PageHead, a section's prose page (/bonetider/metod/), Grunden and AI-barometern on the front page: the drawing stands in the column beyond the measure, flush with the frame's right edge (the edge the content below ends on). A movement built on a grid of its own stands it on that grid instead: Grunden's drawing, and the barometer's in its room, stand in the opening's own column, under its words, on the column's left edge, taking the height the lists or the table leave and no more than 17rem (the barometer's 13) (since 2026-10-10, when Grunden became three columns; before that it stood on the movement's third line, x 950 at 1440 — on the canvas edge it had hung 400px from its words on a line nothing near it drew, user review 2026-09-26). **Only beside an ingress:** a tool page (/bonetider/, /moskeer/) opens on its tool, and there the drawing floated over the tool's first button and pushed the title below where every other section's stands.
  2. *A drawing beside words* — the podcast and app band, and the book and the mosque screen at the page's close on the front page: the words first, on the half's left edge, and the drawing beyond them in a column a sixth of the canvas wide, flush with the half's right edge, as an opening's drawing stands beyond its words (rule 1). Until 2026-10-10 the drawing stood first, in a 10rem column at the half's left edge, and the words began 188px in from the page's line. On a phone the drawing stands above the words at 7rem, flush left. The band's two are a matched pair, one 10rem box for both. The AI-barometern's introduction stood by this rule until 2026-10-10, the upright barometer in a 10rem column beside its words; when the room took the page's thirds its words became an opening and its drawing went under them, by rule 1. The book shares the closing region with the podcast and app, so it takes the pair's box, not its words' height: the same desktop column and drawn-object grammar. At tablet widths the promotions place their drawings above the words to preserve a useful text measure, each in the whole 10rem box and on its foot, so the kickers of two promotions abreast meet on one line.
  3. *A centred page* (404): on the page's own axis, above the words.
- **Size follows the words (visual hierarchy, common region).** In an opening the drawing is exactly as tall as the opening: from the title's (or kicker's) top line to the last line of its words — the ingress, and on /vad-ar-islam/ the verse, on /ai-barometern/ the measurement line, which is why PageHead has an `efter` slot. It is never under 7rem. Drawing and words then share their top and bottom lines and read as one unit, and a short opening gets a small drawing, a long one a large one, so the page's own hierarchy sets the size: the essäserier hub's one-line ingress 112px, Tänkare's three lines 166px, /vad-ar-islam/'s title, ingress and verse ~500px. Built exactly: the drawing fills a cell spanning the opening's rows (`Ritning fyll`, `object-fit: contain`) and adds no height of its own. A fixed 11rem box outweighed a one-line ingress, stopped halfway down a five-line one, and left a third of /vad-ar-islam/'s opening empty ("consider the size … visual hierarchy, gestalt … so it looks balanced", 2026-09-26). Keep any bottom margin out of the opening's last row, or the cell runs past the text (/bonetider/metod/'s lead had one).
- **Proportion follows the place.** The space beside or under an opening's words is wider than tall, so an opening's drawing is composed landscape (about 4:3 to 3:2). The upright barometer stood 140px wide on the hub with a 400px empty field beside it; the hub has its own landscape version (the barometer beside a window, weather moving in), and since 2026-10-10 the front page's room uses the same one, under its words. The upright one is not placed.
- **Not placed:** the mosque drawing (`RITNINGAR.moskeer`) — /moskeer/ opens on its tool and /moskeer/om/ on a gallery of real mosques, where a drawing would compete with the photographs. It waits for a page that opens with words.
- **Essäer** (2026-10-16, `RITNINGAR.essaer`): an old fieldstone arch bridge over a river between birches, the keystone alone in ochre — two banks and one passage. Beside /essaer/'s ingress by rule 1. A hub that opens on words and has photographs below it (/essaer/, /tradar/, /vad-ar-islam/) takes a drawing; only a page that *opens* on photographs does not. Frågor och svar and Fördjupning, the other two hubs that opened beside empty paper, wait for theirs (a door with its key, a well with its bucket), one at a time and shown before they are placed.

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
| `--step--4` | 12.0 | micro meta: attribution, dense map/prayer UI. **The text floor** |
| `--step--5` | 10.5 | marks inside artwork and maps only |

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
- **A documentary photograph is shown as it was taken** (2026-10-11). Every essay picture carries a tonal wash in CSS (`EssayImage.astro`: saturation 0.72 and a little sepia, eased back to full colour on hover) so that pictures made for the site read as one set. A photograph of a real place by a named photographer is not such a picture: an essay whose hero is one sets `imageDocumentary: true`, credits it in its first note (»Bilden överst: …«), and the wash stays off. Its file is cut from the original with no colour change. The two Gaza heroes had been desaturated in the file and then washed on top: Jabalia's blue sky stood as grey, and the pictures read as "so faded … i do not like the desaturated look" (user review). A test holds the flag and the credit together (`lib/documentary-heroes.test.ts`).
- **No color for color's sake.** The palette is: text color, background color, one accent (for links and interactive elements), and muted tones for secondary elements. Four colors maximum. On the front page one tinted ground marks the two rooms of what is measured; no second ground, and never a dark one (see »The Startpage«).
- **No borders or dividers unless encoding meaning.** Use whitespace for separation, not lines. On the front page this is a budget, counted in the DOM: **≤ 16 hairlines and ≤ 20 labels in tracked capitals** (from 48 and 66; 13 and 15 after 2026-10-10). A hairline there is one of three things: the rule a section opens under (a room's lower line is the next section's), the rule between the rail's titles, or the rule under a table's heads. A tab bar's own line and the chosen tab's underline are the control, like a pill's outline, and are not counted. Capitals name a section or a kind — the kickers — and nothing else; meta lines, »Alla … →« links, counts and categories read in sentence case. Count again before adding one.
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

The footer groups real links under Läs, Praktiskt, and Om islam.se, from 60rem on the page's one gutter, so its four columns are the canvas's quarters and »Praktiskt« stands on the centre line every halved section turns on; it had a gutter of its own until 2026-10-10 and stood 12px off that line. From 48rem to 60rem the gutter stands between the footer's halves only (four columns on it would break »Redaktionella principer«), which is enough to keep »Praktiskt« on that line. It is the navigation backstop without JavaScript. Current-page markers use weight and a visible rule, not color alone.

### The Browse Axes

Essays are cross-cut by three curated axes, each a first-class collection surface:

- **Ämnen** — seven topics in a fixed order (foundational theology first, the Swedish reader's meeting-point last). Each essay carries exactly one; `lib/amnen.test.ts` fails when one carries none (three did until 2026-10-10, and stood in no ämne list anywhere).
- **Essäserier** (code and URLs: `tradar`) — hand-curated reading orders: an ordered sequence of essays around a single line of argument, read part by part.
- **Tänkare** — the recurring interlocutors, in two facing columns: the classical Islamic tradition and the Swedish/Western voices that meet it. The composition itself is the argument — a dialogue shown, not declared.

**An ämne is a shelf; an essäserie is a reading order — and the page must say which is which without being asked.** Every essay stands on one shelf, the shelves are permanent, and inside one the newest comes first. A series is a selection (half the essays are in none), it is made when there is a reason (an election, a war, one book read through), and its order is the argument. Under the names »Ämnen« and »Teman« the two read as one list of topics shown twice — the words are near-synonyms in Swedish, and three of the seven series lie wholly inside one ämne ("a bit confused about that", user review 2026-10-10). So the second axis is named for what it is, and **every place a series appears shows its order**: the front page's cards are headed »Del 1«, »Del 2«, »Del 3«, the series page heads each part »Del 1«, »Del 2« in the same brass (on picture cards where every part has a picture, on rows where any part lacks one — never a half-pictured row), the essay's own page says »del 3 av 6« and offers the next part first at its end (»Nästa del«), and a series counts its *delar*, never its essäer, and says how long it is (»6 delar · lästid 65 min«) wherever it is listed. A series shown without its numbers is an ämne again.

Ämnen and essäserier are glimpsed on the startpage, in one design, and tänkare on /essaer/, under the essäserier; all three are browsable in full at `/amnen/…`, `/tradar`, and `/tankare`. They never harden into a top-level menu; they are reached through the palette, the footer, and the homepage movements.

### Names — one name per destination (2026-09-27)

islam.se stands beside DN, SvD, Bokmässan and NE, so its chrome speaks their language: every destination has **one** name, used in the mast, the footer, the palette, the page's h1 and the front page alike, and every name was checked against how those institutions and Isof (Språkrådet) write the same thing.

| Destination | Name | Not |
|---|---|---|
| /vad-ar-islam/ | Tro och lära (NE's own tab) | Pelare & tro |
| /svar/ | Frågor och svar (Isof advises against »&« in headings; NE writes »och«) | Frågor & svar |
| /tradar/ | Essäserier; one is an *essäserie*, read in *delar* (DN Kultur: »den tredje och avslutande delen av … essäserie«) | Teman (2026-09-27 to 2026-10-10: in everyday Swedish a synonym of ämne, and DN's own topic pages speak of »ämnet«; beside »Essäer efter ämne« the two names read as one list twice); Trådar — forum/social-media register, used by no serious site; Serier alone (comics) |
| /ai-barometern/ | AI-barometern, always with the article (as Konjunkturbarometern) | Barometer |
| /podcast/ | Podd (DN, Dagen, Isof); the show is *islam.se: essäer, inlästa*, as its cover reads | Podden, Andliga essäer |
| /det-islamiska-aret/ | Det islamiska året | Kalender |
| /nyheter/ | Nyheter, on the front page with its source: »Nyheter från zuhd.news« | Senaste nytt (the front page's bar until 2026-10-10: a second name for one destination, and twenty lines under the rail's »Senast publicerat« the two read as one label); Världen just nu |
| the pillars / the articles of faith | Islams fem pelare · Trons sex pelare (*arkān al-islām / al-īmān*); the sixth is *Förutbestämmelsen* | trosartiklarna as a heading (NE uses it only for the Christian creed; it stays in prose as a synonym), Ödet |
| ämnen | Swedish usage, each word in its own heading form: the unique and proper definite (Skapelsen, Koranen, Själen, Norden), general ideas bare (Rättvisa, Samhälle, Livsfrågor — the curriculum's word). The »essäer om …« phrase is written per ämne (`omForm`: »om rättvisa«, »om samhället«, »om Koranen«), never derived. Slugs unchanged. | an all-definite set (»Rättvisan«, »Samhället«) — a calque of the Arabic al-; Skriften (reads as the Bible); Sökandet (English »The Search«) |
| tänkare | full names (NE, Litteraturbanken, DN): August Strindberg, Erik Gustaf Geijer | surname alone |

Onward links carry **no counts** (»Alla frågor och svar«, not »Alla 53 …«): no publication measured does it. Reading time is **»lästid 13 min«**, never the translated »13 min läsning«. No »Utforska …« (marketing register, used only on product pages). Page titles take the Swedish spaced en dash: `Sida – islam.se`, never the English em dash.

### The Essäer Page

The essay archive at `/essaer` lists every published essay — title, date, reading time, and description. Use the existing editorial card and row variants; titles, imagery, and metadata have a consistent hierarchy. By default the list is grouped by **ämne** in the canonical order (each heading links to its ämne page); one quiet toggle re-groups it **chronologically** by year. A filter row (ämnen / trådar / tänkare / längd) opens a calm overlay for jumping to a section or narrowing by length — none of it required to read the list. Essays the reader has finished shift value in place (a muted title and a "läst" mark) rather than splitting off into a separate section, and a small ring at the end of the filter row shows how much of the archive is read. All of this is `localStorage`, no account, and one script for every list (`scripts/read-state.ts`). »Läst« means the prose was read: progress is measured on the essay's body, not the page (`proseProgress`), because the notes and onward links below the last line kept a reader who had finished at 0.71–0.76 of a phone's page, under the 0.85 that counts as read (measured 2026-10-16).

The list is ordered newest-first within each group. No pagination — the full archive on one page. If it grows to hundreds of essays, reconsider — but not before.

Before the shelves stand the two ways in that are not shelves: three essäserier as picture cards, and under them, behind a rule, **Tänkare** (since 2026-10-10, moved from the front page): its own words in the first third and the dialogue's drawing across the other two. It stood last on this page until then, as a head row over a centred figure 11 000px down.

The archive is accessible from the navigation ("Essäer") and from the end of every essay. Astro's prefetch-on-hover strategy makes navigation feel instant — clicking a title loads nearly immediately because the page was prefetched when the reader hovered.

### Within an Essay

Keep the text column at its current comfortable measure. Essays, answers and deep-dives all render their h2 contents list through one shared `ArticleBody` component: a collapsed disclosure on mobile, an inline list at intermediate widths, and a sticky left rail at 90rem and above, where the section being read is marked (full text colour plus a short bar — never weight, which rewraps the rows). The rail's left edge stands on the mast's line on all three templates, its reach derived from the frames' tokens (`--rail-reach`, editorial.css): it hung a fixed 13rem from the column and stood 24px outside the line beside an essay and 64px inside it beside an answer (2026-10-16). The rail must not overlap the right-hand sidenotes or reduce prose width. A note's bare address shows its host in the margin (»svt.se«); the note at the foot keeps the whole address. Anchor offsets clear the header.

The existing reading-resume offer identifies the essay and includes dismissal. It never scrolls automatically. Audio remains continuous through client navigation and all fixed controls respect its reserved space.

### After an Essay

Keep onward-reading links, newer/older essays, sources, and correction links. Group them consistently with shared section spacing and hairline boundaries. Preserve source anchors and their return path. In order: a series part's »Nästa del« first (its number in brass over its title, as the front page sets a part); the encounter and the context rows; »Läs vidare«, three essays by verse, tänkare and ämne, never the essay's own series mates (the next part carries the order); »Alla essäer«; newer/older; the notes, under their own rule and »Noter« where the margin cannot hold them. The end matter of answers and fördjupningar opens like any section: a rule and its kicker one group-space under it (`ArticleSection`), and the sources in the apparatus' size and quiet ink, their underline faint until hovered.

### Reference and Practical Pages

Frågor och svar opens with its category row (sticky, in sentence case) and then the question groups, each a section under its rule and kicker, its sentence as the framing line. Its six illustrated deep dives follow the questions, in the front page's Fördjupning form (2026-10-16; they stood first for a while, 1 100px of pictures before the first question at 1440). The palette (⌘K) is the search. Keep query URLs and filtering behavior.

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

The front page turns on five lines, each for a reason:

| Line | What turns | Why there |
|---|---|---|
| **48rem** (768px) | the four promotions two abreast; the news bar on halves; the barometer's three tabs on one line; every tick of the day's line named | two halves fit abreast (a half is 335px and the longest headline 357), and a line has room for six names |
| **56.25rem** (900px) | the mast's links unfold and the front page's doorways go | the mast's six links fit on one line |
| **60rem** (960px) | the essays by ämne, the essäserier and Fördjupning in thirds; AI-barometern's words beside its table; Grunden's three columns; Praktiskt's two lines beside its map | thirds on the one gutter |
| **64rem** (1024px) | the lead beside its rail, and the rail's six titles (three below) | a third of the canvas must hold a title of 22.8px: at 60rem it is 267px and the rail's titles ran to four lines |
| **72rem** (1152px) | the news bar on the thirds | a third must hold a headline on ONE line, because the bar holds its place before the news arrives: at 60rem a third is 269px and four headlines in five were cut, at 72rem it is 332px and two in a hundred are. It is the line where the site's other lists go from two columns to three (the orter on the mosque pages) |

### The mast (2026-09-27)

Three groups in one row: the wordmark, the six links (sections, a hairline, utilities), and the next prayer with the search pill. The rules, each measured:

- **The wordmark is the heaviest thing in the mast.** It scales from 18px on a phone to 26px on the canvas (`clamp(1.125rem, 0.5rem + 1.6vw, 1.625rem)`), growing with the room the links leave it. At the nav's own 16.9px it was 88 × 18px beside a 650px link row, and the eye found the menu before the name.
- **The links centre between the wordmark and the chip, not on the viewport.** Equal `1fr` side tracks put them 150px from the wordmark and 23px from »Maghrib 18:33« at 1440px, closer to the chip than to each other. The air either side of the links is now equal and always wider than the air between them.
- **One fluid gap** (`--mast-gap`) for every space in the link row, 12px at 901px to 25.6px on the canvas. There is no fixed override for a band.
- **The shortcut hint names the reader's key:** ⌘K on Apple and Ctrl K elsewhere, stamped before paint by Base.astro.
- **On a phone the chip names the prayer** (»Maghrib 18:33«). Under 360px it shows the sun or moon with the time, which is what fits one row at 320px.
- **Labels say »och«, never »&«.** The ampersand saves 17px a label (34px across the row), and the row does not need it. Språkrådet keeps `&` for company names and tight tables, not for a publication's chrome.
- **The tools are a rank below the sections**: one step smaller, regular weight, muted, behind the hairline, so Tro och lära, Frågor och svar and Essäer read as the publication and Bönetider, Moskéer and AI-barometern as its tools. Written that way since 2026-09-27 and never drawn until 2026-10-16: `.site-links--util a` tied with `.site-links a` and lost by order, which also made the row too wide at 901px (three labels on two lines up to 930px). Mast links never wrap.

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
- **Minimal asset weight beyond the hero.** HTML + CSS should remain under 30KB. Fonts are self-hosted and cached after the first visit.
- **Fonts: one table, three rules (2026-10-10).** `apps/web/src/lib/fonts.ts` lists every font file; the config and the layout both read it.
  1. *Each text face is cut in two, and an ext range is the file's own coverage.* Core holds Latin-1, the punctuation, the arrows and the transliteration letters; ext holds the rest. A range written as »everything outside core« made every page with ﷺ fetch 92 kB of Literata that cannot draw it. `fonts.test.ts` holds each range to its file; `scripts/subset-fonts.ts` cuts them.
  2. *A font is preloaded only where it sets words above the page's first picture*, one file at a time, after the picture's own preload (`preloadFonts` in Base.astro). Words above a picture move it when their font lands; words below it can swap for free.
  3. *Every fallback is matched to the web font's width, on every system.* Astro generates the match for Times New Roman and Arial; `styles/font-fallbacks.css` adds Liberation, Noto Serif and Roboto for Android and Linux. No bare »Georgia« or »system-ui« in a chain. The test of it: a heading measures the same height with the web fonts held back as with them loaded.

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

The homepage shows the coming twelve months as a line (»The Startpage«, item 9): Ramadan as a stretch, the two eids and Ashura as marks, the sun on today, and over it the next observance in a sentence, counting down (»om 136 dagar«, »pågår« through a period). The calendar page contains the full year. Preserve the existing date calculations, source policy, and client date refresh. There is no daily-verse homepage module in the current composition.

**The islamic day begins at maghrib.** A date shown for an *instant* (the horizon in the front page's Praktiskt) turns over at the day's maghrib, not at midnight: `hijriAt()` in lib/markesdagar.ts. A date shown for a *calendar day* (a table row, an observance) stays the civil Umm al-Qura date. The footer's colophon is the build date and says so (»uppdaterad …«).

## The Scorecard — against ft.com (2026-10-10)

islam.se shares the Financial Times' archetype: warm paper (ours `#fff6e8`, theirs `#fff1e5`, ΔE2000 2.95 apart at the same chroma), a serif display lead under a topic kicker, a hairline-divided rail of serif titles, a tracked-caps sans nav. A reader makes the comparison whether we invite it or not, so it is kept as a table and not as a feeling. The look stays (product decision, 2026-10-10); the site wins on execution, and on what FT cannot have: the day, the drawings, a dark theme, no advertising.

**How it is measured.** `pnpm bench` (`apps/web/scripts/bench/`): Lighthouse on the front page and the shared templates, a DOM probe of the first screen at the sizes readers have, and a layout trace, against a build served with the production `_headers`. Every Lighthouse figure is a median with its spread, never one run: the front page scored 83, 98 and 99 on desktop in three consecutive runs. FT's column is the dated file beside the script. ft.com serves a bot check to scripted browsers; that check is not worked around, so FT is one run per form factor and is refreshed by hand. All of it is lab data from one machine: compare runs on one machine, never across two.

**The front page.** Ours is a local build, median of three, taken after the lead and the order were rebuilt the same day (before: median of three on the same server).

| Measure | FT | Before | After |
|---|---|---|---|
| Performance, mobile / desktop | 31 / 90 | 75 / 98 | 86 / 100 |
| Style and layout work, mobile / desktop | 1,485 / 321 ms | 2,190 / 411 ms | 1,107 / 279 ms |
| Layout shift, phone | 0.010 | 0–0.064 | 0 |
| Accessibility, mobile / desktop | 95 / 95 | 100 / 97 | 100 / 100 |
| Headline and deck above the fold at 1280×720 | yes | headline cut, deck below | yes, with five of the rail's six titles and four fifths of the photograph |
| Essays offered on the first screen, 1440×900 | not measured (a cookie wall covers it to a script) | 4 | 7 |
| Text under 12 px | none | 2.5 % of characters | none |
| HSTS / COOP | yes / no | no / no | yes / yes |
| Fonts on first load | 4 files, 247 kB | 5 files, 442 kB | 4 files, 290 kB |
| Page weight, requests, JavaScript | 15.5 MB, 153, 972 kB | 0.8 MB, 43, 36 kB | 0.8 MB, 47, 38 kB |
| First screen on a phone | a cookie wall | the lead | the lead |

**The shared templates, on a phone.**

| Page | Layout shift, before → after | LCP, before → after | Fonts, before → after |
|---|---|---|---|
| Essay | 0.191 → 0 | 5.1 → 3.6 s | 6 files, 484 kB → 5, 332 kB |
| Essay index | 0.047 → 0 | 4.6 → 3.8 s | 4 files, 394 kB → 3, 242 kB |
| Answer index | 0.020 → 0 | 2.7 → 2.4 s | 2 files, 142 kB (unchanged) |

The local server speaks HTTP/1.1, so its LCP reads over a second slower than production's (the front page: 4.4 s locally against 2.0 s live, before the changes). Read the LCP column as before and after, not as the figure a reader gets; confirm with `pnpm bench --base https://islam.se` after a ship.

**What it changed, and where the rule now lives.**

- *The lead is one package beside a rail, level by construction; the essays follow it; Grunden is one box* (»The Startpage«, items 2, 3 and 6). The first version of this work put the words first and left the photograph across the canvas; a look at the page in Chrome, and the user's, said it was neither balanced nor a match for ft.com's first screen, and it was rebuilt the same day.
- *Fonts*: coverage-true ranges, per-file preloads above the first picture, width-matched fallbacks on every system (Principle 9).
- *An in-page hero is preloaded* (`lib/hero-preload.ts`): it is the LCP element and stands ~100 kB into the document.
- *Text floor*: 12 px (`--step--4`).
- *Headers*: HSTS and COOP in `public/_headers`.
- *The mast chip's label contains its visible text; the lead's kicker link is clickable over its whole height; one region per name.*

`scripts/assert-page-budgets.mjs` runs after every build in `verify` and `ship` and fails on the rows that can be read off the HTML.

**Still open.**

- *What the font preloads cost the cover.* On a phone in the local lab (five runs each, same build, only the preload links removed): with all three preloads the front page's LCP was 3.75 s, layout shift 0 and layout work 1.07 s; with none, LCP 2.85 s, layout shift 0.033 (the lead headline rewraps at some widths even over a matched fallback) and layout work 1.68 s. The preloads stay, because without them two rows go back to FT (layout shift 0.010, layout work 1.49 s). The local server is HTTP/1.1, where a preload costs a connection as well as bandwidth, so the gap should be smaller live: measure it with `--base` after a ship and reopen this if it is not.
- *Font weight.* 290 kB against FT's 247. The italic's core is 99 kB because it keeps the optical-size axis; pinning that axis would bring the first load to roughly 240 kB (an estimate from the display cut, which is pinned and weighs 50 kB) and change how italics are drawn at small sizes. A typographic decision, not taken.
- *Best practices on the live site* is 92, not the 100 a local build scores: Cloudflare injects a bot-detection script the CSP blocks. It is a zone setting (Bot Fight Mode / JavaScript Detections), not code.
- *The mast's prayer names* take ʿ ʾ Ẓ ṣ from a system font: neither Source Sans file holds them, and the parent in the repo does not either. Fixing it needs the full upstream font.
- *The mast wraps three labels onto two lines between 901 and about 930 px.* Older than this work; found while measuring it.

## Shared Implementation Contracts

Use tokens.css for values; editorial.css holds the shared UI presentation contracts that refine the existing layout and scoped components. The reading measure is 42rem and the prose measure remains unchanged.

**Two frames (2026-09-26).** *The canvas* (`--canvas-width`, `.home`) is the mast's: 76rem of content plus the mast's padding. The front page, every index, directory and tool page, and the footer on every page use it. *The reading frame* (`--reading-frame`, 64rem) holds the pages people read through: essays, svar and fördjupningar (`.reading`), and the browse-shell pages that are mostly one column of running text (`.home.home--text`: the two bönetider guides, the mosque guide, the AI-barometern method and question pages, the podcast episode list, Nyheter). An index used to share the reading frame so nothing "flicked" between index and article; the mast is what holds still now, and an index set 12rem narrower than the menu over it looked shrunk (user review, 2026-09-26). The lines never grow: on the canvas, prose keeps the measure and **the width goes to the things that are many** — cards in thirds (never five or six across: "very small and tight"; never stretched to fill a row: "drawn out"), directories in columns read down then across, a picture beside its list rather than under it, a table beside the text that explains it. A page whose content is a single measure-bound column belongs on the reading frame, not on the canvas with an empty half beside it.

**One grammar off the front page (2026-10-16).** The front page's rules held on the front page alone (its rule was scoped `.front .home .home-chapter > …`), and every hub headed its sections its own way: seven heading styles, rules 15, 24, 30 or 49px over their headings and on two pages under them, four card implementations, the same essay drawn three sizes on three pages. The vocabulary is shared now, and a new page uses it:

- *A section* on any canvas page is a `.page-section` (layout.css): a section space, its rule, one group-space, the head row (`HomeHead`: the kicker and, at the right, the way on), one group-space, its content. The rule is drawn by default and the first section under a page's opening opts out with `.page-section--first`; never a sibling selector, which cannot see a section that starts a wrapper. An index section never takes `.home-movement` (its content-visibility placeholder throws anchor jumps). /essaer/'s ämnen and years, /svar/'s categories and its fördjupning band, /vad-ar-islam/'s clusters and »Läs vidare« open so; the tool pages keep their sans h2s, which carry search wording, under the same rules.
- *A kicker* is `Kicker.astro`, in one of two forms: `head` (it heads a section or a list: ink, 600) and `quiet` (it stands over a title and names its kind: the meta colour, 400), both behind the brass point. An essay's ämne, an answer's category, a fördjupning's »Fördjupning«, the collection pages' kind, /nyheter/'s »Världen« (which kept the retired dash) and the end matter's headings all wear it.
- *A picture card* is one object in two markups (the essay card, `CardList`; `FaktaCard` for the honorific it renders), all reading `--card-*`: the title in Literata at `--step-1` in ink, the line under it at `--step--2` in the quiet ink, whitespace between cards, never a hairline under each. A card's hover is tonal only.
- *A list of essays* shows each deck's opening sentence (`leadSentences`), on a row as on a card.
- *A count or a meta line* reads in sentence case (»6 delar«, »12 avsnitt«, the footer's colophon); so do the filter chips. Capitals name a section or a kind and nothing else.
- *Ways on* from a page are items on its grid (`OnwardLinks`, named and glossed from `lib/navigation.ts`'s `destinations()`; a tool page's `RelatedLinks` on its thirds), never rows across the canvas with the arrow at the far edge.
- *A phone's tabs* are one row that scrolls sideways under its own rule, never two stacked bars.

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
| Startpage | »Dagen och texten«: the opening (the lead's words and photograph in two thirds beside a rail of six titles, level by construction; the news as one bar); chapter 1 on paper (the essays by ämne and by essäserie, in one design); a room on tint (AI-barometern, a finding as a table); chapter 2 on paper (the facts, then depth); a room on tint (the day and the year as two lines, the mosques' map); the promotions last; inside the mast's canvas; not a single screen, not a feed |
| Front-page headings | The lead's headline; one title, »Vad är islam?«; a kicker in ink at weight 600 heading every section and list; a quiet kicker only over a title |
| Front-page sections | Each opens the same way: a rule (on paper) or the room's edge (on tint), its kicker, the way on |
| Every other canvas page | The same grammar (`.page-section`, `HomeHead`, `Kicker`), one picture card, sentence-case meta and chips, ways on as items on the grid (»One grammar off the front page«) |
| Reading templates | One kicker over the title; fördjupning on the essay's header with »lästid«; end matter under rules and kickers; the next part first at a series essay's end; the rail on the mast's line |
| Front-page grid | Twelve columns, one gutter (`--grid-gutter`); every block starts on a column edge; one set of vertical steps (section space, line, group space, kicker, group space) |
| Front-page grounds | Paper for what is written, one tint for the two rooms of what is measured; no tint holds two sections |
| News on the front page | Three one-line headlines under the lead, under one hairline, place held before the fetch, layout shift 0; »Nyheter från zuhd.news«, never »Senaste nytt« |
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
