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

## Principle 1: The Hero Image Is the Gateway

When an article has a hero image, it is full-screen, full-bleed, covering the entire viewport. It is the first thing the reader sees. It sets the emotional register before a single word is read.

This is editorial art direction, not decoration. Editorial art is made *for* this essay, encodes something about its argument or mood, and would not work on a different essay. The hero's color palette, texture, and mood should rhyme with the typographic palette of the essay — both surfaces must feel like one publication.

Most articles launch without a hero image. The text-only experience — title, metadata, and prose on warm off-white — is the primary design surface and must feel complete on its own. A hero image elevates; its absence must not diminish.

### The Startpage

The startpage is a single screen. If the latest article has a hero image, it occupies the viewport with the title overlaid. If not, the title is presented in a centered text-only hero. Logo and minimal navigation at the top. Copyright and a brief site description at the bottom. Nothing else. No scroll, no content below the fold, no list of other articles. Other essays are found through the archive.

This is a magazine cover, not a table of contents. The latest essay gets the full stage. The effect is intentional: when a reader arrives, they encounter one essay, presented with conviction. This signals editorial confidence — we chose this piece for you, and we believe it deserves your full attention.

### The Article Hero

On the essay page, the hero occupies the full viewport on load. The title is set over or immediately below the image. As the reader scrolls, the hero gives way to the essay text. The transition should feel like opening a book — the cover yields to the first page.

The hero does not compete with the essay. Once the reader scrolls past it, it is gone. It does not sticky, parallax, shrink, or follow. It served its purpose: it created a mood. Now the typography takes over.

### Art Production

The art must be produced for each article. The style should be consistent across the site (a recognizable visual language) while varying per essay.

The art is not illustrative in the literal sense — it does not depict what the essay describes. It evokes. An essay about sleep and death might have an image of deep twilight over water. An essay about the call to prayer might use geometric light. The reader should feel something before understanding what the essay is about.

---

## Principle 2: Typography Is the Design

This is a reading site. Typography is not one component among many — it is the primary design medium. Get the type right and the site is 90% designed. Get it wrong and nothing else matters.

### The Measure

Optimal line length for Swedish prose with its compound words: **60–70 characters per line**. Non-negotiable. A paragraph that spans the full viewport on a wide screen is unreadable — the eye loses its place on the return sweep.

### The Scale

Every font size on the site must belong to a single coherent scale — no ad-hoc sizes. The reader should perceive a natural hierarchy where each level feels proportionally larger, never arbitrary.

**Body text** must be generous: 18–20px on desktop, 17–18px on mobile. Anything smaller signals that you do not respect the reader's time.

**Line height** must give long-form prose room to breathe: 1.5–1.6 for body text.

**Paragraph spacing:** Vertical spacing between paragraphs, not indentation. Never both.

### The Typeface

Serif for body text. Serif typefaces guide the eye along the baseline — this is why every serious book, newspaper, and literary journal uses them for long-form reading.

Criteria:
- **Large x-height** for screen readability
- **Open apertures** (the spaces inside letters like 'e', 'a', 'c') for legibility at body sizes
- **Swedish diacritical support** (å, ä, ö must feel native, not afterthoughts)
- **True italics** (not slanted roman — italics carry meaning in literary text)
- **Multiple weights** for hierarchy (regular, medium/semibold, bold minimum)

Headings may use a contrasting face (sans-serif against serif body, or a display serif) but only one. Two typefaces maximum across the entire site.

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
- **No JavaScript.** Footnotes stay at the bottom of the page. No popovers, no expandable inline notes. The simplest implementation is the most reliable. Astro's built-in markdown processor handles GFM footnote syntax natively — no additional plugins needed.

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
- **No stock images, no generic illustration.** The hero is the one image per page. Beyond the hero, no images unless integral to the essay's argument.
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

Minimal persistent navigation: "Hem" (home) and "Essäer" (browse). No mega-menus, no dropdowns, no category trees. The site publishes essays — the structure is flat. The header is sticky on inner pages (with a soft gradient fade at the bottom edge) and overlaid on hero images with white text.

### The Essäer Page

The essay archive at `/essaer` is a simple chronological list of all published essays. Each entry shows: title, date, and reading time. No cards, no thumbnails. The titles must do the work — they were written to intrigue. A CSS-only hover tooltip shows the essay description as progressive disclosure — it does not clutter the default list and requires no JavaScript.

The list is ordered newest-first. No pagination — the full archive on one page (at 35+ essays, this is a single screenful of titles). If the archive grows to hundreds of essays, reconsider — but not before.

The archive is accessible from the navigation ("Essäer") and from the end of every essay. Astro's prefetch-on-hover strategy makes navigation feel instant — clicking a title loads nearly immediately because the page was prefetched when the reader hovered.

### Within an Essay

The section headings serve as internal navigation. On longer essays, a minimal table of contents (a list of h2s) at the top can help — but only if it does not reduce the text column width or overlay the content. If in doubt, omit it.

### After an Essay

At the bottom of every essay, after the footnotes: the next essay (newer) and the previous essay (older) as simple text links with titles. One action to continue reading. No grid of cards.

---

## Principle 7: Color and Contrast

### Background

Warm off-white or very light warm gray. Pure white (#fff) is harsh on screens. A subtle warmth (toward cream or parchment) reduces eye strain. The tint should be barely perceptible — visible only if compared side-by-side with pure white.

### Text

Near-black, not pure black. Dark charcoal (#1a1a1a to #2d2d2d range) on warm off-white is easier on the eyes while maintaining WCAG AAA contrast compliance.

### Accent

One color. Used for links and interactive elements only. Muted, not saturated — this is a literary publication, not a SaaS landing page. The accent should feel inevitable, like it belongs to the palette.

### Dark Mode

If implemented, it is not an inversion. Dark mode is a separate palette: dark warm background (not pure black), light warm text (not pure white), adjusted accent. The typographic scale, spacing, and hierarchy remain identical. Only the palette changes.

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

Block quotes frequently contain Arabic script — Quran verses, hadith, and classical scholarly citations — typically followed by a Swedish translation in italic. The Arabic text renders inline (LTR context) without special direction attributes. This is acceptable because the Arabic passages are short, embedded quotations within a Swedish-language argument, not standalone Arabic content. No separate Arabic typeface is loaded; Literata's fallback chain handles Arabic glyphs via the system Arabic font.

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

## Summary of Constraints

| Element | Constraint |
|---|---|
| Typefaces | 2 maximum (1 serif body, 1 heading) |
| Colors | 4 maximum (text, background, accent, muted) |
| Body font size | 18–20px desktop, 17–18px mobile |
| Line length | 60–70 characters |
| Line height | 1.5–1.6 body text |
| Hero image | Optional per article, full-screen when present, produced art (not stock) |
| JS for reading | Zero required (prefetch-on-hover for fast navigation) |
| Animations on content | None |
| Sidebar | None |
| Startpage | Single screen: latest article hero, logo, nav, copyright + about at bottom |

Performance and weight budgets are in `TECHNICAL_SPEC.md`.
