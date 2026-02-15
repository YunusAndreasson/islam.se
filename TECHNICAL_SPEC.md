# Technical Spec — islam.se Web Frontend

Technology choices for islam.se. Every decision serves `DESIGN.md`. When in doubt, the option that produces a better reading experience wins.

---

## Version Policy: Always Latest

**Use the latest stable version of every dependency.** Versions below are current at time of writing (February 2026). Do not pin to them — always check for and use the newest stable release. If a newer version has breaking changes, adapt the code to the new API.

**When an LLM agent implements this spec**, it must use Context7 MCP (`resolve-library-id` → `query-docs`) to look up current API patterns before writing any code. Do not rely on training data for framework APIs.

---

## Existing Stack

Inherited from the monorepo. Do not introduce alternatives.

| Tool | Role |
|---|---|
| **pnpm** 9.15+ | Package manager, workspace orchestration |
| **TypeScript** 5.9+ | Type system (ESM, `bundler` module resolution) |
| **Biome** 2.3+ | Linting + formatting. Supports `.astro` frontmatter and CSS. |
| **Vitest** 4.0+ | Testing |
| **Knip** 5.83+ | Dead code detection |
| **Zod** 3.x | Schema validation |
| **Node** 25.x | Runtime |

The web frontend lives at `apps/web/` as a pnpm workspace member.

---

## Framework: Astro 5

The site publishes static essays. Astro is the only framework that ships zero client-side JavaScript by default. Every alternative (Next.js, Nuxt, SvelteKit) ships a runtime that the reader pays for but never uses.

**Key Astro features used:**
- **Content Collections with Loaders** — the `glob` loader API for loading article markdown.
- **Built-in image optimization** — `<Image>` component with responsive `srcset`, WebP conversion via Sharp.
- **Static output** — pure SSG, no server, no client JS.
- **Cloudflare-backed** — Astro was acquired by Cloudflare (January 2026), making Cloudflare Pages the natural deployment target.

---

## Content: Articles from Pipeline

The content pipeline produces two artifacts:

1. **`data/articles/{slug}.md`** — Pure markdown, no frontmatter. The essay body.
2. **`data/articles/index.json`** — Metadata for all articles: title, slug, publishedAt, wordCount, qualityScore.

### Content Collection Setup

Define a content collection with a `glob` loader pointing at the article markdown files. Since articles have no frontmatter, metadata must come from `index.json`.

**The join:** At build time, load `index.json` and match each markdown file to its metadata entry by slug (the filename without `.md`). Articles that exist in one source but not the other should be skipped with a build warning — the pipeline may produce articles that fail quality gates, leaving orphaned files.

**Reading time:** Compute from `wordCount` in `index.json` at ~200 words/minute. Do not re-parse the markdown to count words.

**Sorting:** Articles sorted by `publishedAt` descending. The first entry is the latest article (used on the startpage).

---

## CSS: Vanilla with Custom Properties

No CSS framework. The site has one layout (essay page) and one list (archive page). This does not warrant Tailwind, Sass, or CSS-in-JS.

Typography requires precision — exact measures, modular type scales, vertical rhythm. These are best expressed as custom properties on semantic HTML selectors, not utility classes. Biome 2.x lints the CSS directly.

Four files: tokens, reset, typography, layout. Under 5KB total.

---

## Fonts: Literata (Self-Hosted)

**Literata** — a variable serif designed for long-form screen reading (originally commissioned for Google Books). Large x-height, open apertures, true italics, excellent Swedish diacritical support (å, ä, ö) and academic transliteration marks (ā, ī, ū, ḥ, ṣ, ṭ).

Font files live in `src/assets/fonts/` and `public/fonts/`, loaded via manual `@font-face` declarations in `tokens.css`. Variable woff2 format, instanced to weight range 400–600 and optical size pinned to 18, subsetted to Latin + transliteration characters. ~50KB per file (roman + italic).

Headings use a system sans-serif stack for contrast. Two typefaces total (Literata + system sans), under the 100KB page weight budget.

---

## Markdown

Astro's built-in remark/rehype pipeline. Add **remark-gfm** (footnotes are used in every article). A custom rehype plugin strips the first `<h1>` from rendered markdown, since the title is rendered separately from article metadata. No MDX — the articles are pure markdown.

---

## Images: Hero Art

Use Astro's built-in `<Image>` component (or `<Picture>` for art direction). It handles format conversion (AVIF/WebP with fallback), responsive `srcset` generation, and lazy loading. Hero images live in `src/assets/images/` (not `public/`) so Astro can process them.

Preload the hero image in the `<head>`. Use responsive sizes so mobile doesn't download the desktop image.

The startpage hero (latest article) and the article page hero (that article's image) use the same source image at different crops/sizes if needed.

---

## RSS Feed

An RSS feed at `/rss.xml`. Use Astro's `@astrojs/rss` package.

- **Title:** islam.se
- **Description:** Short site description in Swedish.
- **Items:** All published articles, newest first.
- **Item content:** Full article text (not excerpt). Readers who subscribe via RSS chose to read in their reader — respect that choice.
- **Item date:** `publishedAt` from `index.json`.
- **Auto-discovery:** `<link rel="alternate" type="application/rss+xml">` in the `<head>` of every page.

---

## Sitemap

Use `@astrojs/sitemap`. Auto-generated from all routes. No custom configuration needed beyond setting the `site` URL in `astro.config`.

---

## Deployment: Cloudflare Pages

Static output to CDN. No SSR, no API routes, no server. The content pipeline runs locally and produces markdown; the web build reads it and outputs HTML. These systems communicate through the filesystem, not APIs.

Cloudflare Pages: free tier, unlimited bandwidth, global CDN, git-based deploy, first-class Astro support.

---

## Constraints

| Constraint | Value |
|---|---|
| CSS files | 4 (tokens, reset, typography, layout) |
| CSS total weight | Under 5KB |
| Page weight (excl. hero) | Under 100KB (HTML + CSS + fonts) |
| Hero image weight | Under 150KB (AVIF/WebP, responsive srcset) |
| Content width | max-width enforced, ~60% viewport on desktop |
| Client-side JS | Zero |
| Third-party requests | Zero |

Design constraints (typefaces, colors, font sizes, line length) are defined in `DESIGN.md`.

---

## Out of Scope

Do not build infrastructure for: search, dark mode, comments, analytics, CMS, i18n.

**Hero image generation** is a separate workstream. The site must build and deploy without hero images. When no hero image exists for an article, the article page skips the hero section entirely and begins with the title. The startpage uses a text-only layout as fallback — the site launches on the strength of its typography, not placeholder images.

---

## Pages

| Page | Route | Description |
|---|---|---|
| Startpage | `/` | Full-screen hero of latest article, or text-only fallback |
| Essay | `/[slug]` | Full-screen hero (if image exists) or plain title header + essay body + footnotes + prev/next links |
| Archive | `/arkiv` | Chronological list of all articles (title, date, reading time) |
| RSS | `/rss.xml` | Full-text RSS feed |
| Sitemap | `/sitemap-index.xml` | Auto-generated |

---

## LLM Implementation Checklist

1. Use Context7 MCP to look up current Astro APIs before writing any code.
2. `npm view astro version` (and all deps) to confirm latest versions.
3. Scaffold `apps/web/` as a pnpm workspace member.
4. Content collection with `glob` loader + `index.json` metadata join.
5. Pages: startpage, essay, archive, RSS, sitemap.
6. CSS: design tokens → reset → typography → layout.
7. OG/social meta tags on every page (see `DESIGN.md` Principle 11).
8. Hero image fallback: site works without any hero images.
9. Validate: `pnpm build`, `pnpm check`, `pnpm knip`.

---

## Summary

| Decision | Choice | Why |
|---|---|---|
| Framework | Astro 5 | Zero JS, content collections with glob loader, image optimization, SSG |
| CSS | Vanilla + custom properties | Typography precision, minimal weight |
| Fonts | Literata (self-hosted, manual @font-face) | Variable woff2, instanced + subsetted to ~50KB |
| Markdown | remark-gfm + custom rehype (strip h1) | Footnotes, title dedup |
| Deploy | Cloudflare Pages | Astro's parent company, free, global CDN |
| Lint | Biome 2.x | CSS support, already configured (*.astro files excluded) |
