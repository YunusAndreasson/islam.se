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

### The Startpage

Keep the current editorial sequence: lead essay, two secondary essays, topic departments with a news/calendar rail, facts about Islam, deeper explanations, reading threads, thinkers, and the book/podcast. The lead remains the dominant image. Mobile browsing links sit below it. Do not replace this publication with a generic promotional landing page or reorder its priorities without a product decision.

Use three image roles: wide feature, 3:2 collection card, compact thumbnail. Keep consistent crops within each role. The photograph has its own space; titles and introductions remain readable outside it. Quiet tonal treatment is sufficient: no competing lift, zoom, and vignette animation.

### Article Openings

Title, introduction, metadata, artwork, and optional listening controls lead into the prose. Heroes are responsive and optional; they do not occupy a mandatory full viewport. Caption spacing belongs to the image. Artwork never follows the reader down the page.

## Principle 2: Typography Is the Design

This is a reading site. Typography is not one component among many — it is the primary design medium. Get the type right and the site is 90% designed. Get it wrong and nothing else matters.

### The Measure

Optimal line length for Swedish prose with its compound words: **60–70 characters per line**. Non-negotiable. A paragraph that spans the full viewport on a wide screen is unreadable — the eye loses its place on the return sweep.

### The Scale

Every font size on the site must belong to a single coherent scale — no ad-hoc sizes. The reader should perceive a natural hierarchy where each level feels proportionally larger, never arbitrary.

The scale has **two halves**, both in `tokens.css`. Reach for a token; never type a new rem value.

| token | px | role |
|---|---|---|
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

Literata carries editorial headings and prose; Source Sans carries navigation, controls, and metadata. Amiri Quran is reserved for Arabic verse. Use the font roles and type scale in tokens.css.

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
- **No color for color's sake.** The palette is: text color, background color, one accent (for links and interactive elements), and muted tones for secondary elements. Four colors maximum.
- **No borders or dividers unless encoding meaning.** Use whitespace for separation, not lines.
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
- **Trådar** — hand-curated reading threads: an ordered path of essays around a single line of argument.
- **Tänkare** — the recurring interlocutors, in two facing columns: the classical Islamic tradition and the Swedish/Western voices that meet it. The composition itself is the argument — a dialogue shown, not declared.

These are glimpsed on the startpage and browsable in full at `/amnen/…`, `/tradar`, and `/tankare`. They never harden into a top-level menu; they are reached through the palette, the footer, and the homepage movements.

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
| `--color-text` | body prose, titles | 8.7 | 16.6 |
| `--text-body` | leads, decks, framing | 19.7 | 12.5 |
| `--text-quiet` | descriptions, blurbs, captions | 30.7 | 8.6 |
| `--color-muted` | meta labels | 46.6 | 4.8 |

Space the steps by **perceived lightness (L\*), not by mix percentage** — roughly ΔL\* 11 apart, which is what the eye actually reads. The earlier ramp mixed 88/80/72 % and the components hand-mixed 70/75/78/82/85 % besides, which put seven prose tiers inside ΔL\* 12.3 — steps of under 1 L\* in places, all beneath the just-noticeable difference. Nine shades that read as one, and then a 25-point void down to muted. Never hand-mix a new percentage at a call site; if a tier is missing, add it here and justify it in L\*.

A colour that encodes data (the brass on the mosque map's markers and bars) earns its place by encoding something. The moment it is used for ordinary text it is just a fifth colour.

### Dark Mode

Dark mode is implemented and is not an inversion. Dark mode is a separate palette: dark warm background (not pure black), light warm text (not pure white), adjusted accent. The typographic scale, spacing, and hierarchy remain identical. Only the palette changes.

---

## Principle 8: Responsive as Reflow, Not Redesign

The essay is the same on every device. What changes is the container, not the content.

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

The homepage shows a quiet preview of upcoming observances; the calendar page contains the full year. Preserve the existing date calculations, source policy, and client date refresh. There is no daily-verse homepage module in the current composition.

## Shared Implementation Contracts

Use tokens.css for values; editorial.css holds the shared UI presentation contracts that refine the existing layout and scoped components. The reading measure is 42rem, collection canvas 64rem, and artwork cap 76rem. The prose measure remains unchanged.

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
| Startpage | A composed scroll of movements led by the latest essay's hero (not a single screen, not a feed) |
| Navigation | Width-based header, search/menu dialog, grouped footer |

Performance and weight budgets are in `TECHNICAL_SPEC.md`.
