/**
 * Generate samlingsvolym.pdf — a collected volume of all essays.
 * Uses Typst for proper typesetting: Swedish hyphenation,
 * justified text, endnotes, and book-quality typography.
 *
 * Design: modelled after Swedish literary publishing (Bonniers, Norstedts).
 * Fonts: Literata (body) + Source Sans 3 (headings) — same as the website.
 *
 * Usage: tsx scripts/generate-pdf.ts
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkSmartypants from "remark-smartypants";
import { unified } from "unified";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname!, "../../..");
const ARTICLES_DIR = join(ROOT, "data/articles");
const DIST = join(import.meta.dirname!, "../dist");
const OUTPUT = join(DIST, "samlingsvolym.pdf");
const BUILD_DIR = "/tmp/islam-se-pdf";

// ---------------------------------------------------------------------------
// Ornament SVG (rub el-hizb)
// ---------------------------------------------------------------------------

const ORNAMENT_SVG = `<svg viewBox="0 -2 120 22" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="0" y1="9" x2="48" y2="9" stroke="#999" stroke-width="0.5" stroke-linecap="round"/>
  <rect x="53" y="2" width="14" height="14" stroke="#999" stroke-width="0.8" fill="none"/>
  <rect x="53" y="2" width="14" height="14" stroke="#999" stroke-width="0.8" fill="none" transform="rotate(45 60 9)"/>
  <circle cx="60" cy="9" r="2" stroke="#999" stroke-width="0.7" fill="none"/>
  <line x1="72" y1="9" x2="120" y2="9" stroke="#999" stroke-width="0.5" stroke-linecap="round"/>
</svg>`;

// ---------------------------------------------------------------------------
// Markdown processor
// ---------------------------------------------------------------------------

const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkSmartypants, {
		openingQuotes: { double: "\u00BB", single: "\u2019" },
		closingQuotes: { double: "\u00AB", single: "\u2019" },
		dashes: "oldschool",
	});

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

interface ArticleMeta {
	title: string;
	publishedAt: string;
	wordCount: number;
}

function parseFrontmatter(raw: string): { meta: ArticleMeta; body: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return { meta: { title: "", publishedAt: "", wordCount: 0 }, body: raw };
	const pairs: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			const key = line.slice(0, idx).trim();
			const val = line
				.slice(idx + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			pairs[key] = val;
		}
	}
	return {
		meta: {
			title: pairs.title || "",
			publishedAt: pairs.publishedAt || "",
			wordCount: Number.parseInt(pairs.wordCount || "0", 10),
		},
		body: match[2],
	};
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

interface Article {
	slug: string;
	meta: ArticleMeta;
	ast: any;
}

function loadArticles(): Article[] {
	return readdirSync(ARTICLES_DIR)
		.filter((f) => f.endsWith(".md"))
		.sort()
		.map((file) => {
			const raw = readFileSync(join(ARTICLES_DIR, file), "utf-8");
			const { meta, body } = parseFrontmatter(raw);
			const tree = processor.parse(body);
			return { slug: file.replace(".md", ""), meta, ast: processor.runSync(tree) };
		});
}

// ---------------------------------------------------------------------------
// Typst escaping — only for raw text content, never for generated markup
// ---------------------------------------------------------------------------

function esc(s: string): string {
	return s.replace(/([\\#*_$@<>[\]~]|`)/g, "\\$1");
}

// ---------------------------------------------------------------------------
// MDAST → Typst conversion
// ---------------------------------------------------------------------------

interface Ctx {
	footnoteDefs: Map<string, string>;
	endnotes: { num: number; content: string }[];
	noteCounter: number;
	/** True until the first body paragraph has been emitted (for drop cap) */
	firstParagraph: boolean;
}

/** First pass: collect all footnote definitions from the AST */
function collectFootnotes(node: any, ctx: Ctx): void {
	if (node.type === "footnoteDefinition") {
		const content = node.children
			.map((c: any) => (c.type === "paragraph" ? inlinesToTypst(c.children, ctx) : ""))
			.join(" ");
		ctx.footnoteDefs.set(node.identifier, content);
	}
	if (node.children) {
		for (const child of node.children) {
			collectFootnotes(child, ctx);
		}
	}
}

/** Convert block-level MDAST nodes to Typst markup */
function blocksToTypst(nodes: any[], ctx: Ctx): string {
	return nodes
		.filter((n) => n.type !== "footnoteDefinition")
		.map((n) => blockToTypst(n, ctx))
		.filter(Boolean)
		.join("\n\n");
}

function blockToTypst(node: any, ctx: Ctx): string {
	switch (node.type) {
		case "root":
			return blocksToTypst(node.children, ctx);

		case "paragraph": {
			const text = inlinesToTypst(node.children, ctx);
			if (ctx.firstParagraph) {
				ctx.firstParagraph = false;
				return `#dropcap(height: 2, gap: 4pt, overhang: 0pt, font: "Literata", transform: none)[${text}]`;
			}
			return text;
		}

		case "heading": {
			// Article headings: ## → ==, ### → ===  (level 1 reserved for essay titles)
			const level = Math.max(node.depth, 2);
			const prefix = "=".repeat(level);
			return `${prefix} ${inlinesToTypst(node.children, ctx)}`;
		}

		case "blockquote": {
			const inner = blocksToTypst(node.children, ctx);
			return `#block(inset: (left: 28pt, right: 28pt, top: 8pt, bottom: 8pt))[\n  #set text(9.5pt)\n  #set par(leading: 0.6em)\n  ${inner}\n]`;
		}

		case "list":
			return node.children
				.map((li: any, i: number) => {
					const content = li.children
						.map((c: any) =>
							c.type === "paragraph" ? inlinesToTypst(c.children, ctx) : blockToTypst(c, ctx),
						)
						.join("\n  ");
					return node.ordered ? `+ ${content}` : `- ${content}`;
				})
				.join("\n");

		case "thematicBreak":
			return '#align(center, block(breakable: false, above: 14pt, below: 14pt, image("ornament.svg", width: 100pt)))';

		case "html":
			return "";

		default:
			return "";
	}
}

/** Convert inline MDAST nodes to Typst markup */
function inlinesToTypst(nodes: any[], ctx: Ctx): string {
	return nodes.map((n) => inlineToTypst(n, ctx)).join("");
}

function inlineToTypst(node: any, ctx: Ctx): string {
	switch (node.type) {
		case "text":
			return esc(node.value);
		case "emphasis":
			return `#emph[${inlinesToTypst(node.children, ctx)}]`;
		case "strong":
			return `#strong[${inlinesToTypst(node.children, ctx)}]`;
		case "link":
			return inlinesToTypst(node.children, ctx);
		case "inlineCode":
			return `\`${node.value}\``;
		case "footnoteReference": {
			ctx.noteCounter++;
			const content = ctx.footnoteDefs.get(node.identifier) || "saknad fotnot";
			ctx.endnotes.push({ num: ctx.noteCounter, content });
			return `#h(0.08em)#super[${ctx.noteCounter}]`;
		}
		case "break":
			return " \\\n";
		case "html":
			return esc(node.value.replace(/<[^>]+>/g, ""));
		case "delete":
			return inlinesToTypst(node.children, ctx);
		default:
			if (node.children) return inlinesToTypst(node.children, ctx);
			return esc(node.value || "");
	}
}

// ---------------------------------------------------------------------------
// Endnotes section — grouped by essay, compact typography
// ---------------------------------------------------------------------------

interface EssayNotes {
	title: string;
	notes: { num: number; content: string }[];
}

function buildEndnotes(allEndnotes: EssayNotes[]): string {
	if (allEndnotes.length === 0) return "";

	const groups = allEndnotes
		.map((essay) => {
			const notes = essay.notes
				.map((n) => `#par(hanging-indent: 14pt)[${n.num}.~${n.content}]`)
				.join("\n\n");
			return `#v(14pt)\n#text(font: "Source Sans 3", 8.5pt, weight: 600, tracking: 0.05em)[${esc(essay.title).toUpperCase()}]\n#v(4pt)\n${notes}`;
		})
		.join("\n\n");

	return `
// ============================================================
//  Endnotes
// ============================================================

#pagebreak()
#v(60pt)
#text(font: "Source Sans 3", 20pt, weight: 600, tracking: -0.02em)[Noter]
#v(10pt)
#line(length: 60pt, stroke: 0.5pt + luma(204))
#v(24pt)

#set text(8.5pt)
#set par(first-line-indent: 0pt, leading: 0.55em, spacing: 0.4em)

${groups}
`;
}

// ---------------------------------------------------------------------------
// Build the complete Typst document
// ---------------------------------------------------------------------------

function buildDocument(articles: Article[]): string {
	const year = new Date().getFullYear();
	const fullDate = new Date().toLocaleDateString("sv-SE", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	// Convert each essay, collecting endnotes per essay
	const allEndnotes: EssayNotes[] = [];

	const essays = articles.map((article) => {
		const ctx: Ctx = {
			footnoteDefs: new Map(),
			endnotes: [],
			noteCounter: 0,
			firstParagraph: true,
		};
		collectFootnotes(article.ast, ctx);
		const body = blocksToTypst(article.ast.children, ctx);
		if (ctx.endnotes.length > 0) {
			allEndnotes.push({ title: article.meta.title, notes: ctx.endnotes });
		}
		return `= ${esc(article.meta.title)}\n\n${body}`;
	});

	return `// Auto-generated by generate-pdf.ts — do not edit
// Typst source for samlingsvolym.pdf

#import "@preview/droplet:0.3.1": dropcap

// ---- Document metadata ----
#set document(
  title: "Samlade essäer — islam.se",
  author: "islam.se",
)

// ---- Page layout (Tschichold proportions: text block sits high) ----
#set page(
  paper: "a4",
  margin: (top: 72pt, bottom: 85pt, inside: 75pt, outside: 90pt),
  header: context {
    let n = counter(page).get().first()
    if n > 6 {
      if calc.odd(n) {
        // Recto (right page): essay title, right-aligned
        let elems = query(heading.where(level: 1).before(here()))
        if elems.len() > 0 {
          set text(7.5pt, fill: luma(140), style: "italic", tracking: 0.03em)
          align(right, elems.last().body)
        }
      } else {
        // Verso (left page): book title, left-aligned, small caps
        set text(font: "Source Sans 3", 7pt, fill: luma(140), tracking: 0.12em, weight: 600)
        align(left, upper[samlade essäer])
      }
    }
  },
  footer: context {
    let n = counter(page).get().first()
    if n > 4 {
      set text(8pt, fill: luma(140))
      if calc.odd(n) {
        align(right, str(n))
      } else {
        align(left, str(n))
      }
    }
  },
)

// ---- Disable smart quotes (remark-smartypants already handles them) ----
#set smartquote(enabled: false)

// ---- Typography (Literata body, Source Sans 3 headings — matches islam.se) ----
#set text(
  font: ("Literata", "Noto Serif"),
  size: 10.5pt,
  fill: black,
  lang: "sv",
  region: "SE",
  hyphenate: true,
  number-type: "old-style",
  ligatures: true,
  discretionary-ligatures: true,
)

#set par(
  first-line-indent: (amount: 16pt, all: false),
  leading: 0.65em * 1.35,
  justify: true,
  linebreaks: "optimized",
)

// ---- Heading show rules ----
#show heading.where(level: 1): it => {
  pagebreak()
  v(60pt)
  text(font: "Source Sans 3", 20pt, weight: 600, tracking: -0.02em)[#it.body]
  v(10pt)
  line(length: 60pt, stroke: 0.5pt + luma(204))
  v(24pt)
}

#show heading.where(level: 2): it => {
  v(24pt)
  block(sticky: true, below: 12pt, text(font: "Source Sans 3", 13pt, weight: 600, tracking: -0.01em, it.body))
}

#show heading.where(level: 3): it => {
  v(20pt)
  block(sticky: true, below: 10pt, text(font: "Source Sans 3", 11pt, weight: 600, fill: rgb("#333"), it.body))
}

// ============================================================
//  Front matter
// ============================================================

// ---- Half-title ----
#v(1fr)
#align(center, text(font: "Source Sans 3", 20pt, weight: 300, tracking: -0.01em)[Samlade essäer])
#v(2fr)

// ---- Title page ----
#pagebreak()
#v(1fr)
#align(center)[
  #text(font: "Source Sans 3", 11pt, fill: luma(102), tracking: 0.2em, weight: 600)[ISLAM.SE]
  #v(20pt)
  #text(font: "Source Sans 3", 28pt, weight: 300, tracking: -0.015em)[Samlade essäer]
  #v(8pt)
  #text(10pt, style: "italic", fill: luma(102))[
    Essäer om islamisk intellektuell tradition\\
    och svenskt kulturarv
  ]
  #v(30pt)
  #image("ornament.svg", width: 120pt)
]
#v(1fr)
#align(center, text(font: "Source Sans 3", 11pt, fill: luma(102))[${year}])

// ---- Copyright / colophon (verso of title — standard Swedish publisher page) ----
#pagebreak()
#v(1fr)
#text(8pt, fill: luma(120))[
  #set par(first-line-indent: 0pt, leading: 0.6em)
  *Samlade essäer* \\
  islam.se \\
  \\
  Första utgåvan ${year} \\
  \\
  Samtliga texter publiceras löpande på islam.se \\
  och uppdateras i denna volym vid varje utgåva. \\
  Denna samling innehåller ${articles.length} essäer. \\
  \\
  Sättning: Typst med Literata och Source Sans 3 \\
  \\
  islam.se \\
  \\
  Denna volym genererades den ${fullDate}.
]

// ---- Förord ----
#pagebreak()
#v(60pt)
#text(font: "Source Sans 3", 20pt, weight: 600, tracking: -0.02em)[Förord]
#v(10pt)
#line(length: 60pt, stroke: 0.5pt + luma(204))
#v(24pt)

#align(center, text(9.5pt, style: "italic")[I Allahs, den Nåderikes, den Barmhärtiges namn.])

#v(10pt)

Svenskan bär sina djupaste begrepp i sammansatta ord. _Samvete_ \u2013 _sam_ och _vete_ \u2013 betyder att veta tillsammans med n\u00E5gon; _ansvar_, att svara inf\u00F6r n\u00E5gon. Orden f\u00F6ruts\u00E4tter en motpart: en g\u00E5ng var det givet med vem. N\u00E4r Gud l\u00E4mnade samtalet blev samvetet kvar \u2013 men ensamt, och ansvaret utan svar. Det svenska allvaret \u2013 plikten, ansvaret, r\u00F6sten in\u00E5t \u2013 har inte f\u00F6rsvunnit; det vet bara inte l\u00E4ngre vem det svarar inf\u00F6r.

Dag Hammarskj\u00F6ld k\u00E4nde den ensamheten. _\u00ABDen l\u00E4ngsta resan \u00E4r resan in\u00E5t\u00BB_, skrev han i _V\u00E4gm\u00E4rken_ \u2013 inte som poesi utan som disciplin. Men Sverige h\u00F6rde bara citatet. Det Hammarskj\u00F6ld s\u00F6kte hade redan ett namn: i den islamiska traditionen heter det _jih\u0101d al-nafs_, sj\u00E4lens str\u00E4van \u2013 och till skillnad fr\u00E5n hans vandring saknade den aldrig riktning. Ibn al-Qayyim skrev: _\u00ABI hj\u00E4rtat finns en ensamhet som bara n\u00E4rheten till Gud kan bryta.\u00BB_

_\u00ABSamvetet! Och bakom samvetet?\u00BB_ fr\u00E5gar Strindberg i _G\u00F6tiska rummen_; Boye svarar i _Kris_: _\u00ABL\u00E4ngtan \u00E4r v\u00E5rt v\u00E4sens hj\u00E4rta\u00BB_ \u2013 och ger efter f\u00F6r l\u00E4ngtan utan att fr\u00E5ga vart den leder; Lagerl\u00F6f l\u00E4t den bli saga.

Fjorton hundra \u00E5r av islamiskt t\u00E4nkande har k\u00E4nt den ensamheten \u2013 men aldrig f\u00F6rlorat motparten. _\u00ABSannerligen, i Guds \u00E5minnelse finner hj\u00E4rtana ro\u00BB_, s\u00E4ger Koranen. Samma samtal, f\u00F6rt i skilda rum.

Resan in\u00E5t f\u00F6rde Hammarskj\u00F6ld \u00E4nd\u00E5 n\u00E4ra. Pingstdagen 1961 skrev han: _\u00ABJag vet ej vem \u2013 eller vad \u2013 som st\u00E4llde fr\u00E5gan. Jag minns ej att jag svarade. Men en g\u00E5ng svarade jag ja till N\u00E5gon \u2013 eller N\u00E5got.\u00BB_

Den islamiska traditionen har aldrig tvekat om vem. _\u00ABN\u00E4r Mina tj\u00E4nare fr\u00E5gar dig om Mig \u2013 Jag \u00E4r n\u00E4ra\u00BB_, svarar Koranen; h\u00E4r f\u00E5r svaret en svensk r\u00F6st.

// ---- Innehåll ----
#pagebreak()
#v(60pt)
#text(font: "Source Sans 3", 20pt, weight: 600, tracking: -0.02em)[Inneh\u00E5ll]
#v(10pt)
#line(length: 60pt, stroke: 0.5pt + luma(204))
#v(20pt)
#{
  set text(9pt)
  set par(leading: 0.5em, first-line-indent: 0pt)
  outline(title: none, depth: 1)
}

// ============================================================
//  Essays
// ============================================================

${essays.join("\n\n")}

${buildEndnotes(allEndnotes)}

// ============================================================
//  Colophon (last page — printer's page)
// ============================================================

#pagebreak()
#set page(header: none, footer: none)
#v(1fr)
#align(center)[
  #set text(8pt, fill: luma(150))
  #set par(first-line-indent: 0pt, leading: 0.65em)
  Satt med Literata (brödtext) och Source Sans 3 (rubriker).\\
  Sättning och avstavning med Typst.\\
  Första utgåvan ${year}.
]
#v(2fr)
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.log("Läser essäer...");

	const articles = loadArticles();
	articles.sort(
		(a, b) => new Date(a.meta.publishedAt).getTime() - new Date(b.meta.publishedAt).getTime(),
	);

	const totalWords = articles.reduce((sum, a) => sum + a.meta.wordCount, 0);
	console.log(`${articles.length} essäer, ${totalWords.toLocaleString("sv-SE")} ord`);

	// Write build files
	mkdirSync(BUILD_DIR, { recursive: true });
	writeFileSync(join(BUILD_DIR, "ornament.svg"), ORNAMENT_SVG);
	writeFileSync(join(BUILD_DIR, "book.typ"), buildDocument(articles));

	// Compile with Typst
	if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
	const FONTS_DIR = join(ROOT, "fonts");
	execFileSync("typst", [
		"compile",
		"--font-path",
		FONTS_DIR,
		"--font-path",
		"/usr/share/fonts/noto",
		join(BUILD_DIR, "book.typ"),
		OUTPUT,
	]);

	console.log(`\u2713 ${OUTPUT}`);
}

main().catch((err) => {
	console.error("PDF-generering misslyckades:", err);
	process.exit(1);
});
