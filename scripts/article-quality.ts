import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ARTICLES_DIR = "data/articles";

interface ArticleMetrics {
  slug: string;
  title: string;
  wordCount: number;
  // Repetition metrics
  repeatedNgrams: { ngram: string; count: number }[];
  repetitionScore: number; // higher = more repetitive
  // Structural metrics
  avgSentenceLength: number;
  maxSentenceLength: number;
  longSentenceCount: number; // sentences > 50 words
  // Filler/quality markers
  rhetoricalQuestions: number;
  dashAsides: number; // em-dash parentheticals
  fillerPhrases: number;
  // Source diversity
  uniqueSources: number;
  footnoteCount: number;
  quoteDensity: number; // blockquotes per 1000 words
  // Swedish quality signals
  consecutiveShortSentences: number; // clusters of 3+ sentences under 8 words
  wordRepeatDensity: number; // repeated content words near each other
}

function extractBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*?)(?:\n---\n[\s\S]*)?$/);
  if (!match) return content;
  let body = match[1];
  // Remove footnotes section
  body = body.replace(/\n\[\^[\s\S]*$/, "");
  // Remove blockquotes for some metrics (keep for others)
  return body;
}

function extractTitle(content: string): string {
  const match = content.match(/title:\s*"([^"]+)"/);
  return match?.[1] ?? "Unknown";
}

function getBodyWithoutQuotes(body: string): string {
  return body
    .split("\n")
    .filter((l) => !l.startsWith(">"))
    .join("\n");
}

function getSentences(text: string): string[] {
  // Remove markdown formatting
  const clean = text
    .replace(/\*[^*]+\*/g, (m) => m.replace(/\*/g, ""))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\^\d+\]/g, "")
    .replace(/^#+\s+.*$/gm, "")
    .replace(/^>\s+/gm, "");

  // Split on sentence boundaries
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
  return sentences;
}

function getWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function getContentWords(text: string): string[] {
  const stopwords = new Set([
    "och", "i", "att", "en", "ett", "det", "den", "de", "som",
    "är", "var", "har", "hade", "med", "för", "på", "av", "till",
    "inte", "om", "han", "hon", "sin", "sitt", "sina", "sig",
    "denna", "detta", "dessa", "från", "men", "eller", "vid",
    "kan", "ska", "skulle", "bara", "än", "utan", "alla", "alla",
    "när", "vad", "hur", "där", "här", "ur", "mot", "under",
    "över", "genom", "efter", "före", "mellan", "hos", "åt",
    "så", "då", "ju", "nog", "ens", "ändå", "också", "redan",
    "aldrig", "alltid", "inte", "ingen", "inget", "inga",
    "samma", "varje", "andra", "annat", "hela", "mycket",
    "mer", "mest", "bara", "just", "dock", "sedan", "dess",
    "vars", "vilken", "vilket", "vilka", "ty", "först",
    "the", "and", "of", "in", "to", "is", "that", "with",
  ]);
  return getWords(text).filter(
    (w) => w.length > 2 && !stopwords.has(w) && !/^\d+$/.test(w),
  );
}

function findRepeatedNgrams(
  text: string,
  n: number,
): { ngram: string; count: number }[] {
  const words = getContentWords(text);
  const ngramCounts = new Map<string, number>();

  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(" ");
    ngramCounts.set(ngram, (ngramCounts.get(ngram) ?? 0) + 1);
  }

  return Array.from(ngramCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([ngram, count]) => ({ ngram, count }))
    .sort((a, b) => b.count - a.count);
}

function countNearbyWordRepeats(text: string, windowSize = 80): number {
  const words = getContentWords(text);
  let repeats = 0;
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < Math.min(i + windowSize, words.length); j++) {
      if (words[i] === words[j] && words[i].length > 5) {
        repeats++;
        break; // count each word once per window
      }
    }
  }
  return repeats / Math.max(words.length, 1);
}

function countRhetoricalQuestions(text: string): number {
  // Questions that aren't in blockquotes
  const lines = text.split("\n").filter((l) => !l.startsWith(">"));
  const joined = lines.join(" ");
  const questions = joined.match(/[^.!?]+\?/g) ?? [];
  return questions.length;
}

function countDashAsides(text: string): number {
  const matches = text.match(/\s–\s[^–]+\s–\s/g) ?? [];
  return matches.length;
}

const FILLER_PATTERNS = [
  /det är värt att notera/gi,
  /det bör understrykas/gi,
  /det kan inte nog betonas/gi,
  /det är ingen överdrift/gi,
  /det förtjänar att/gi,
  /det är anmärkningsvärt/gi,
  /det är slående/gi,
  /man kan säga att/gi,
  /det går inte att överskatta/gi,
  /det vore en underdrift/gi,
  /det ska genast sägas/gi,
  /med beundransvärd precision/gi,
  /det är uppenbart att/gi,
  /det kan konstateras/gi,
  /låt oss/gi,
  /det ska sägas/gi,
];

function countFillerPhrases(text: string): number {
  let count = 0;
  for (const pattern of FILLER_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function countConsecutiveShortSentences(sentences: string[]): number {
  let count = 0;
  let streak = 0;
  for (const s of sentences) {
    const wc = s.split(/\s+/).length;
    if (wc <= 8) {
      streak++;
      if (streak >= 3) count++;
    } else {
      streak = 0;
    }
  }
  return count;
}

function analyzeArticle(filepath: string): ArticleMetrics {
  const content = readFileSync(filepath, "utf-8");
  const title = extractTitle(content);
  const body = extractBody(content);
  const bodyNoQuotes = getBodyWithoutQuotes(body);
  const sentences = getSentences(bodyNoQuotes);
  const words = getWords(bodyNoQuotes);
  const slug = filepath.replace(/.*\//, "").replace(/\.md$/, "");

  // Word counts per sentence
  const sentenceWordCounts = sentences.map((s) => s.split(/\s+/).length);
  const avgSentenceLength =
    sentenceWordCounts.reduce((a, b) => a + b, 0) /
    Math.max(sentenceWordCounts.length, 1);
  const maxSentenceLength = Math.max(...sentenceWordCounts, 0);
  const longSentenceCount = sentenceWordCounts.filter((c) => c > 50).length;

  // Repeated n-grams (3-grams and 4-grams)
  const trigrams = findRepeatedNgrams(bodyNoQuotes, 3);
  const fourgrams = findRepeatedNgrams(bodyNoQuotes, 4);

  // Combine and score repetition
  const allRepeated = [...fourgrams, ...trigrams.filter((t) => t.count >= 3)];
  const repetitionScore =
    fourgrams.reduce((sum, g) => sum + (g.count - 1) * 3, 0) +
    trigrams
      .filter((t) => t.count >= 3)
      .reduce((sum, g) => sum + (g.count - 1), 0);

  // Footnotes and quotes
  const footnoteMatches = content.match(/\[\^\d+\]/g) ?? [];
  const footnoteCount = new Set(footnoteMatches.map((f) => f)).size;
  const blockquoteLines = body.split("\n").filter((l) => l.startsWith(">")).length;
  const quoteDensity = (blockquoteLines / Math.max(words.length, 1)) * 1000;

  // Unique sources (rough: unique footnote reference texts)
  const fnDefs = content.match(/^\[\^\d+\]:.+$/gm) ?? [];
  const sourceNames = new Set(
    fnDefs.map((fn) => {
      const match = fn.match(/^\[\^\d+\]:\s*(.{20,60})/);
      return match?.[1]?.replace(/[,.].*/, "").trim() ?? fn;
    }),
  );
  const uniqueSources = sourceNames.size;

  return {
    slug,
    title,
    wordCount: words.length,
    repeatedNgrams: allRepeated.slice(0, 10),
    repetitionScore,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    maxSentenceLength,
    longSentenceCount,
    rhetoricalQuestions: countRhetoricalQuestions(body),
    dashAsides: countDashAsides(body),
    fillerPhrases: countFillerPhrases(body),
    uniqueSources,
    footnoteCount,
    quoteDensity: Math.round(quoteDensity * 10) / 10,
    consecutiveShortSentences: countConsecutiveShortSentences(sentences),
    wordRepeatDensity:
      Math.round(countNearbyWordRepeats(bodyNoQuotes) * 1000) / 1000,
  };
}

// Run analysis
const files = readdirSync(ARTICLES_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => join(ARTICLES_DIR, f));

const metrics = files.map(analyzeArticle);

// Composite quality concern score (higher = more issues)
const scored = metrics.map((m) => {
  const concern =
    m.repetitionScore * 2 +
    m.longSentenceCount * 5 +
    m.fillerPhrases * 10 +
    m.rhetoricalQuestions * 1.5 +
    m.dashAsides * 0.5 +
    m.consecutiveShortSentences * 3 +
    m.wordRepeatDensity * 50 +
    (m.quoteDensity > 20 ? (m.quoteDensity - 20) * 2 : 0) +
    (m.footnoteCount < 8 ? (8 - m.footnoteCount) * 3 : 0);
  return { ...m, concernScore: Math.round(concern * 10) / 10 };
});

scored.sort((a, b) => b.concernScore - a.concernScore);

// Output
console.log("\n=== ARTICLE QUALITY ANALYSIS ===\n");
console.log(
  "Rank | Concern | Title                              | Words | RepScore | LongSent | Filler | RhetQ | Dashes | NearRepeat",
);
console.log("-".repeat(130));

for (const [i, m] of scored.entries()) {
  const title = m.title.padEnd(35).slice(0, 35);
  console.log(
    `${String(i + 1).padStart(3)}  | ${String(m.concernScore).padStart(6)} | ${title} | ${String(m.wordCount).padStart(5)} | ${String(m.repetitionScore).padStart(8)} | ${String(m.longSentenceCount).padStart(8)} | ${String(m.fillerPhrases).padStart(6)} | ${String(m.rhetoricalQuestions).padStart(5)} | ${String(m.dashAsides).padStart(6)} | ${m.wordRepeatDensity}`,
  );
}

// Detailed view of top 10 worst
console.log("\n\n=== TOP 15 MOST CONCERNING — DETAILS ===\n");
for (const m of scored.slice(0, 15)) {
  console.log(`\n--- ${m.title} (${m.slug}) ---`);
  console.log(`  Concern score: ${m.concernScore}`);
  console.log(`  Words: ${m.wordCount} | Avg sentence: ${m.avgSentenceLength} words | Max sentence: ${m.maxSentenceLength} words`);
  console.log(`  Long sentences (>50 words): ${m.longSentenceCount}`);
  console.log(`  Repetition score: ${m.repetitionScore}`);
  console.log(`  Rhetorical questions: ${m.rhetoricalQuestions} | Dash-asides: ${m.dashAsides} | Filler: ${m.fillerPhrases}`);
  console.log(`  Near-repeat density: ${m.wordRepeatDensity}`);
  console.log(`  Footnotes: ${m.footnoteCount} | Unique sources: ${m.uniqueSources} | Quote density: ${m.quoteDensity}/1000w`);
  console.log(`  Short-sentence clusters: ${m.consecutiveShortSentences}`);
  if (m.repeatedNgrams.length > 0) {
    console.log(`  Top repeated phrases:`);
    for (const ng of m.repeatedNgrams.slice(0, 8)) {
      console.log(`    "${ng.ngram}" × ${ng.count}`);
    }
  }
}

// Flag specific issues
console.log("\n\n=== SPECIFIC FLAGS ===\n");

const highRepetition = scored.filter((m) => m.repetitionScore > 15);
if (highRepetition.length > 0) {
  console.log("HIGH REPETITION (score > 15):");
  for (const m of highRepetition) {
    console.log(`  ${m.title}: ${m.repetitionScore}`);
  }
}

const manyLongSentences = scored.filter((m) => m.longSentenceCount >= 3);
if (manyLongSentences.length > 0) {
  console.log("\nMANY LONG SENTENCES (≥3 over 50 words):");
  for (const m of manyLongSentences) {
    console.log(`  ${m.title}: ${m.longSentenceCount} sentences over 50 words (max: ${m.maxSentenceLength})`);
  }
}

const highQuoteDensity = scored.filter((m) => m.quoteDensity > 25);
if (highQuoteDensity.length > 0) {
  console.log("\nHIGH QUOTE DENSITY (>25 per 1000 words — may lean too much on sources):");
  for (const m of highQuoteDensity) {
    console.log(`  ${m.title}: ${m.quoteDensity}/1000w`);
  }
}

const lowSources = scored.filter((m) => m.footnoteCount < 10);
if (lowSources.length > 0) {
  console.log("\nFEW FOOTNOTES (<10):");
  for (const m of lowSources) {
    console.log(`  ${m.title}: ${m.footnoteCount} footnotes`);
  }
}

const highRhetQ = scored.filter((m) => m.rhetoricalQuestions >= 8);
if (highRhetQ.length > 0) {
  console.log("\nMANY RHETORICAL QUESTIONS (≥8):");
  for (const m of highRhetQ) {
    console.log(`  ${m.title}: ${m.rhetoricalQuestions}`);
  }
}
