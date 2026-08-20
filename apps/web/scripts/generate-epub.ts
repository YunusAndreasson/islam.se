/**
 * Generate samlingsvolym.epub — the same collected volume as samlingsvolym.pdf, in the
 * format a reading device wants.
 *
 * WHY, given the PDF already exists: a PDF is a fixed page. On a phone or an e-reader
 * it is a photograph of a book rather than a book — no reflow, no adjustable size, no
 * night mode. EPUB is the format the corpus is actually shaped like: 57 essays of
 * running prose with an apparatus. It costs one more artefact and no new prose.
 *
 * WHAT IT SHARES WITH THE PDF: everything about the text. Corpus, order, frontmatter
 * and the house punctuation all come from ./lib/essay-corpus, so the two books cannot
 * disagree about what they contain. Only the rendering differs — the PDF walks the
 * MDAST into Typst by hand; this walks it into XHTML with remark-rehype, which is why
 * this file is a third of that one's length.
 *
 * FOOTNOTES ARE THE POINT. The corpus carries 954 of them, and EPUB 3 has a real type
 * for them: `epub:type="noteref"` on the marker and `epub:type="footnote"` on the body
 * make Apple Books and Kobo show the note as a tap-to-open popup instead of throwing
 * the reader to the end of the chapter. That is the same structure the web renders in
 * the margin (src/plugins/rehype-sidenotes.ts) — one apparatus, three presentations.
 *
 * ⚠️ THE ZIP LAYOUT IS NOT ORDINARY. OCF requires `mimetype` to be the FIRST entry and
 * STORED, not deflated. Get it wrong and readers reject the file, usually without
 * saying why. Hence the two `zip` invocations at the bottom — `-X -0` for the mimetype,
 * then `-X -r -9 -D -x` for everything else. Do not "simplify" them into one.
 *
 * ⚠️ A Cloudflare Pages deploy is a SNAPSHOT of dist/. A build that skips this script
 * 404s a file the homepage links to, so scripts/assert-full-build.mjs checks for it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rehypeStringify from "rehype-stringify";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { buildChartHast } from "../src/lib/chart/render";
import { parseChartSpec } from "../src/lib/chart/spec";
import { type Article, loadArticles, REPO_ROOT } from "./lib/essay-corpus";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DIST = join(SCRIPT_DIR, "../dist");
const OUTPUT = join(DIST, "samlingsvolym.epub");
const BUILD_DIR = join(SCRIPT_DIR, "../node_modules/.astro/epub-build");
const FONTS_DIR = join(REPO_ROOT, "fonts");

const YEAR = new Date().getFullYear();
const TITLE = "Samlade essäer";
const SUBTITLE = "Essäer om islamisk intellektuell tradition och svenskt kulturarv";
const AUTHOR = "islam.se";

// A stable identifier, so a reader that has the book already recognises a new build as
// the SAME book updated rather than a second copy on the shelf. Derived from the domain
// rather than a random UUID for exactly that reason.
const BOOK_ID = "urn:uuid:6973-6c61-6d2e-7365-73616d6c6164";

const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------
// MDAST → XHTML
// ---------------------------------------------------------------------------

const renderer = unified()
	// `allowDangerousHtml` is deliberately OFF: the essays contain a little inline HTML
	// for the web (the honorific glyph, verse players) which has no meaning in a book and
	// would be invalid XHTML besides. remark-rehype drops it, which is the wanted result.
	// ⚠️ Without this handler a ```chart fence becomes a visible <pre><code> — the reader
	// of the book would be shown the raw spec where the figure belongs. Routed through the
	// same renderer the website uses, in print mode: EPUB has no CSS custom properties, so
	// var(--color-brass) would paint nothing at all.
	.use(remarkRehype, {
		handlers: {
			code(_state: unknown, node: { lang?: string; value?: string }) {
				if (node.lang === "chart") {
					return buildChartHast(parseChartSpec(node.value ?? ""), "print");
				}
				// The plain <pre><code> remark-rehype would have produced, written out rather
				// than imported: mdast-util-to-hast is remark-rehype's own dependency and pnpm's
				// strict layout does not expose it here, and it is not worth a direct dependency
				// for three lines. The corpus contains no code fences other than charts anyway.
				return {
					type: "element",
					tagName: "pre",
					properties: {},
					children: [
						{
							type: "element",
							tagName: "code",
							properties: node.lang ? { className: [`language-${node.lang}`] } : {},
							children: [{ type: "text", value: node.value ?? "" }],
						},
					],
				};
			},
		},
	})
	.use(rehypeStringify, {
		// XHTML, not HTML: EPUB documents are parsed by an XML parser, so <br> and <img>
		// must close and every entity must be defined. This is the whole difference
		// between a file readers open and a file they reject.
		closeSelfClosing: true,
		closeEmptyElements: true,
		tightSelfClosing: false,
	});

interface HastNode {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
}

/**
 * Rewrite GFM's footnote markup into EPUB 3 semantics, in the TREE.
 *
 * Two reasons this is not a set of regexes over the output string. First, GFM marks its
 * footnotes with BOOLEAN attributes — `data-footnote-ref`, `data-footnote-backref` —
 * which are perfectly good HTML and invalid XHTML, where every attribute must carry a
 * value. An EPUB is parsed by an XML parser, so those bare attributes made all 57
 * chapters malformed; xmllint caught it, no reader would have said why. Deleting them
 * here fixes the validity and removes markup that meant nothing in a book anyway.
 *
 * Second, `epub:type="noteref"` on the marker and `epub:type="footnote"` on the body are
 * what make Apple Books and Kobo pop the note up in place instead of throwing the reader
 * to the end of the chapter. That is the same apparatus the website renders in the
 * margin — one structure, three presentations.
 */
function epubFootnotes(node: HastNode): HastNode {
	const props = node.properties;
	if (props) {
		const id = typeof props.id === "string" ? props.id : "";
		const href = typeof props.href === "string" ? props.href : "";

		if ("dataFootnoteRef" in props) {
			delete props.dataFootnoteRef;
			props["epub:type"] = "noteref";
		}
		if ("dataFootnoteBackref" in props) {
			delete props.dataFootnoteBackref;
		}
		if ("dataFootnotes" in props) {
			delete props.dataFootnotes;
			props["epub:type"] = "endnotes";
		}
		// GFM namespaces its ids to survive alongside other content on a web page. A
		// chapter is its own document, so the prefix is noise in every reader's UI.
		if (id.startsWith("user-content-fn-")) {
			props.id = `fn-${id.slice("user-content-fn-".length)}`;
			props["epub:type"] = "footnote";
		} else if (id.startsWith("user-content-fnref-")) {
			props.id = `fnref-${id.slice("user-content-fnref-".length)}`;
		}
		if (href.startsWith("#user-content-")) {
			props.href = `#${href.slice("#user-content-".length)}`;
		}
	}
	for (const child of node.children ?? []) epubFootnotes(child);
	return node;
}

function bodyHtml(article: Article): string {
	const hast = epubFootnotes(renderer.runSync(article.ast as never) as unknown as HastNode);
	return String(renderer.stringify(hast as never));
}

/** "4 november 2025". The ISO stamp is a database value; a chapter opens with a date a
 *  reader recognises. Noon UTC so the calendar day cannot slip a timezone. */
function swedishDate(iso: string): string {
	if (!iso) return "";
	const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleDateString("sv-SE", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

const CHAPTER = (article: Article, index: number) => {
	const date = swedishDate(article.meta.publishedAt);
	return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="sv" lang="sv">
<head>
  <title>${esc(article.meta.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section epub:type="chapter" role="doc-chapter">
    <header class="chapter-head">
      <p class="chapter-num">${index + 1}</p>
      <h1>${esc(article.meta.title)}</h1>
      ${article.meta.description ? `<p class="standfirst">${esc(article.meta.description)}</p>` : ""}
      ${date ? `<p class="chapter-date">${esc(date)}</p>` : ""}
    </header>
${bodyHtml(article)}
  </section>
</body>
</html>
`;
};

// ---------------------------------------------------------------------------
// Package documents
// ---------------------------------------------------------------------------

const STYLE = `@font-face {
  font-family: "Literata";
  src: url("fonts/Literata-Regular.ttf");
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: "Literata";
  src: url("fonts/Literata-Italic.ttf");
  font-weight: normal;
  font-style: italic;
}
@font-face {
  font-family: "Literata";
  src: url("fonts/Literata-SemiBold.ttf");
  font-weight: bold;
  font-style: normal;
}

/* No colours and no fixed font-size on body: a reader sets both, and overriding them
   is the commonest way an EPUB fights the device it is on. The stylesheet's whole job
   is the shape of the page — measure, indents, the apparatus — not its palette. */
body {
  font-family: "Literata", Georgia, serif;
  line-height: 1.55;
  margin: 0 1em;
  widows: 2;
  orphans: 2;
}

h1 {
  font-size: 1.6em;
  line-height: 1.2;
  font-weight: bold;
  margin: 0 0 0.4em;
  text-align: left;
}

h2 {
  font-size: 1.15em;
  margin: 1.8em 0 0.5em;
  page-break-after: avoid;
  break-after: avoid;
}

.chapter-head { margin: 1em 0 2em; }
.chapter-num { font-size: 0.8em; letter-spacing: 0.12em; margin: 0 0 0.6em; }
.standfirst { font-size: 1.02em; font-style: italic; margin: 0 0 0.8em; }
.chapter-date { font-size: 0.8em; margin: 0; }

/* Swedish typographic paragraphs: no blank line, an indent from the second on. The
   first paragraph after a heading opens flush, as it does in print and on the site. */
/* Justified text needs hyphenation or it opens rivers — and a reading device's measure
   is narrower than any page this prose was written for. Every document declares
   lang="sv", so the reader has the dictionary it needs. (No backticks in here: the whole
   stylesheet is a template literal, and one closes it mid-comment.)
   The -epub- prefix is the one Apple Books and
   several e-ink readers actually honour; the unprefixed property covers the rest. */
p {
  margin: 0;
  text-indent: 1.4em;
  text-align: justify;
  -epub-hyphens: auto;
  -webkit-hyphens: auto;
  hyphens: auto;
}
h1 + p, h2 + p, .chapter-head + p, blockquote p:first-child { text-indent: 0; }

blockquote {
  margin: 1.2em 1.5em;
  font-size: 0.96em;
  font-style: italic;
}

/* The apparatus. Readers that support epub:type="footnote" never render this section
   inline — they pop the note up instead — so these rules are the fallback for the
   readers that don't, where it becomes ordinary endnotes. */
section[epub|type~="endnotes"] { font-size: 0.85em; margin-top: 2.5em; }
section[epub|type~="endnotes"] p { text-indent: 0; text-align: left; }
@namespace epub "http://www.idpf.org/2007/ops";

hr { border: none; border-top: 1px solid currentColor; opacity: 0.25; margin: 2em auto; width: 30%; }
img { max-width: 100%; height: auto; }
sup a { text-decoration: none; }
`;

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

const TITLE_PAGE = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="sv" lang="sv">
<head>
  <title>${esc(TITLE)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section class="titlepage">
    <p class="chapter-num">${esc(AUTHOR)}</p>
    <h1>${esc(TITLE)}</h1>
    <p class="standfirst">${esc(SUBTITLE)}</p>
    <p class="chapter-date">${YEAR}</p>
  </section>
</body>
</html>
`;

function navDocument(articles: Article[]): string {
	const items = articles
		.map(
			(a, i) =>
				`      <li><a href="ch${String(i + 1).padStart(3, "0")}.xhtml">${esc(a.meta.title)}</a></li>`,
		)
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="sv" lang="sv">
<head>
  <title>Innehåll</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Innehåll</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`;
}

function packageDocument(articles: Article[], fonts: string[], modified: string): string {
	const manifest = articles
		.map(
			(_, i) =>
				`    <item id="ch${i + 1}" href="ch${String(i + 1).padStart(3, "0")}.xhtml" media-type="application/xhtml+xml"/>`,
		)
		.join("\n");
	const spine = articles.map((_, i) => `    <itemref idref="ch${i + 1}"/>`).join("\n");
	const fontItems = fonts
		.map((f, i) => `    <item id="font${i}" href="fonts/${f}" media-type="application/font-sfnt"/>`)
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="sv">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${BOOK_ID}</dc:identifier>
    <dc:title>${esc(TITLE)}</dc:title>
    <dc:creator>${esc(AUTHOR)}</dc:creator>
    <dc:language>sv</dc:language>
    <dc:description>${esc(SUBTITLE)}</dc:description>
    <dc:publisher>${esc(AUTHOR)}</dc:publisher>
    <dc:rights>© ${YEAR} ${esc(AUTHOR)}</dc:rights>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${fontItems}
${manifest}
  </manifest>
  <spine>
    <itemref idref="title"/>
    <itemref idref="nav"/>
${spine}
  </spine>
</package>
`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function main(): void {
	console.log("Läser essäer...");
	const articles = loadArticles();
	const words = articles.reduce((n, a) => n + a.meta.wordCount, 0);
	console.log(`${articles.length} essäer, ${words.toLocaleString("sv-SE")} ord`);

	rmSync(BUILD_DIR, { recursive: true, force: true });
	const oebps = join(BUILD_DIR, "OEBPS");
	mkdirSync(join(oebps, "fonts"), { recursive: true });
	mkdirSync(join(BUILD_DIR, "META-INF"), { recursive: true });

	// `mimetype` carries no newline: OCF specifies the exact 20 bytes.
	writeFileSync(join(BUILD_DIR, "mimetype"), "application/epub+zip");
	writeFileSync(join(BUILD_DIR, "META-INF/container.xml"), CONTAINER);
	writeFileSync(join(oebps, "style.css"), STYLE);
	writeFileSync(join(oebps, "title.xhtml"), TITLE_PAGE);
	writeFileSync(join(oebps, "nav.xhtml"), navDocument(articles));

	// Three faces, not ten: an embedded font is weight in every download, and roman,
	// italic and semibold are what the prose actually uses.
	const fonts = ["Literata-Regular.ttf", "Literata-Italic.ttf", "Literata-SemiBold.ttf"].filter(
		(f) => existsSync(join(FONTS_DIR, f)),
	);
	for (const f of fonts) {
		writeFileSync(join(oebps, "fonts", f), readFileSync(join(FONTS_DIR, f)));
	}

	articles.forEach((a, i) => {
		writeFileSync(join(oebps, `ch${String(i + 1).padStart(3, "0")}.xhtml`), CHAPTER(a, i));
	});

	const modified = `${new Date().toISOString().slice(0, 19)}Z`;
	writeFileSync(join(oebps, "content.opf"), packageDocument(articles, fonts, modified));

	if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
	rmSync(OUTPUT, { force: true });

	// See the header warning: mimetype first and stored, everything else after.
	execFileSync("zip", ["-X", "-0", OUTPUT, "mimetype"], { cwd: BUILD_DIR, stdio: "pipe" });
	execFileSync("zip", ["-X", "-r", "-9", "-D", OUTPUT, "META-INF", "OEBPS"], {
		cwd: BUILD_DIR,
		stdio: "pipe",
	});

	const size = readFileSync(OUTPUT).length;
	console.log(`✓ ${OUTPUT} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main();
