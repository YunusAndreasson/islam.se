import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ARTICLES_DIR = "data/articles";

interface Paragraph {
  text: string;
  lineNum: number;
  hasFootnote: boolean;
  hasBlockquote: boolean;
  hasNamedSource: boolean;
  isHeading: boolean;
  wordCount: number;
}

interface ArticleScore {
  slug: string;
  title: string;
  totalWords: number;
  totalParagraphs: number;
  unsourcedParagraphs: number;
  unsourcedRatio: number;
  longestUnsourcedRun: number;
  unsourcedDetails: { lineNum: number; preview: string; words: number }[];
}

function parseArticle(filepath: string): { title: string; paragraphs: Paragraph[] } {
  const content = readFileSync(filepath, "utf-8");
  const titleMatch = content.match(/title:\s*"([^"]+)"/);
  const title = titleMatch?.[1] ?? "Unknown";

  // Extract body between frontmatter and footnotes
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*?)(?:\n---\n[\s\S]*)?$/);
  if (!bodyMatch) return { title, paragraphs: [] };
  let body = bodyMatch[1];

  // Remove footnote definitions at the end
  body = body.replace(/\n\[\^\d+\]:[\s\S]*$/, "");

  const lines = body.split("\n");
  const paragraphs: Paragraph[] = [];
  let currentPara: string[] = [];
  let paraStartLine = 0;

  // Count frontmatter lines for accurate line numbers
  const frontmatterEnd = content.indexOf("---", content.indexOf("---") + 3) + 4;
  const frontmatterLines = content.slice(0, frontmatterEnd).split("\n").length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      if (currentPara.length > 0) {
        const text = currentPara.join("\n");
        paragraphs.push(makeParagraph(text, paraStartLine + frontmatterLines));
        currentPara = [];
      }
    } else {
      if (currentPara.length === 0) paraStartLine = i;
      currentPara.push(line);
    }
  }
  if (currentPara.length > 0) {
    const text = currentPara.join("\n");
    paragraphs.push(makeParagraph(text, paraStartLine + frontmatterLines));
  }

  return { title, paragraphs };
}

function makeParagraph(text: string, lineNum: number): Paragraph {
  const isHeading = /^#{1,6}\s/.test(text);
  const hasFootnote = /\[\^\d+\]/.test(text);
  const hasBlockquote = text.split("\n").some(l => l.startsWith(">"));

  // Named sources: specific people, works, or institutions mentioned
  const hasNamedSource = hasFootnote || hasBlockquote || containsNamedSource(text);

  const wordCount = text
    .replace(/[#>*\[\]()]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0).length;

  return { text, lineNum, hasFootnote, hasBlockquote, hasNamedSource, isHeading, wordCount };
}

function containsNamedSource(text: string): boolean {
  // Check for italicized work titles
  if (/\*[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ][^*]{2,}\*/.test(text)) return true;
  // Check for specific names (capitalized multi-word sequences typical of person names)
  if (/(?:Ibn |al-|Imam |Profeten |Koranen|Strindberg|Söderberg|Linné|Key|Geijer|Rydberg|Bremer|Boye|Topelius|Swedenborg|Kierkegaard|Nietzsche|Kant|Platon|Wittgenstein|Hammarskjöld|Pascal|Habermas|MacIntyre|Rawls|Chalmers)/.test(text)) return true;
  // Check for years/dates as evidence of specific claims
  if (/\b(1[0-9]{3}|20[0-2][0-9])\b/.test(text)) return true;
  return false;
}

function analyzeArticle(filepath: string): ArticleScore {
  const slug = filepath.replace(/.*\//, "").replace(/\.md$/, "");
  const { title, paragraphs } = parseArticle(filepath);

  // Filter out headings — they're structural, not content
  const contentParas = paragraphs.filter(p => !p.isHeading && p.wordCount > 5);

  const unsourced = contentParas.filter(p => !p.hasNamedSource);
  const unsourcedRatio = unsourced.length / Math.max(contentParas.length, 1);

  // Find longest run of consecutive unsourced paragraphs
  let maxRun = 0;
  let currentRun = 0;
  for (const p of contentParas) {
    if (!p.hasNamedSource) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  const unsourcedDetails = unsourced.map(p => ({
    lineNum: p.lineNum,
    preview: p.text.replace(/\n/g, " ").slice(0, 90),
    words: p.wordCount,
  }));

  return {
    slug,
    title,
    totalWords: contentParas.reduce((s, p) => s + p.wordCount, 0),
    totalParagraphs: contentParas.length,
    unsourcedParagraphs: unsourced.length,
    unsourcedRatio: Math.round(unsourcedRatio * 1000) / 1000,
    longestUnsourcedRun: maxRun,
    unsourcedDetails,
  };
}

// Run
const files = readdirSync(ARTICLES_DIR)
  .filter(f => f.endsWith(".md"))
  .map(f => join(ARTICLES_DIR, f));

const results = files.map(analyzeArticle);
results.sort((a, b) => b.unsourcedRatio - a.unsourcedRatio);

console.log("\n=== SOURCE DENSITY ANALYSIS ===");
console.log("(Unsourced = no footnote, no blockquote, no named person/work/date)\n");

console.log(
  "Rank | Unsourced% | Unsourced/Total | MaxRun | Title"
);
console.log("-".repeat(90));

for (const [i, r] of results.entries()) {
  const pct = `${Math.round(r.unsourcedRatio * 100)}%`.padStart(4);
  const ratio = `${r.unsourcedParagraphs}/${r.totalParagraphs}`.padStart(6);
  const title = r.title.padEnd(40).slice(0, 40);
  console.log(
    `${String(i + 1).padStart(3)}  |     ${pct}   |          ${ratio} |     ${r.longestUnsourcedRun} | ${title}`
  );
}

// Show details for the worst articles
const worst = results.filter(r => r.unsourcedParagraphs > 0);
console.log(`\n\n=== UNSOURCED PARAGRAPHS (all articles) ===\n`);

for (const r of worst) {
  if (r.unsourcedParagraphs === 0) continue;
  console.log(`\n--- ${r.title} (${r.unsourcedRatio * 100}% unsourced, ${r.unsourcedParagraphs}/${r.totalParagraphs}) ---`);
  for (const d of r.unsourcedDetails) {
    console.log(`  L${d.lineNum} (${d.words}w): ${d.preview}...`);
  }
}
