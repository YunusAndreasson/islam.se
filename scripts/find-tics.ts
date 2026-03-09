import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ARTICLES_DIR = join(import.meta.dirname, "..", "data", "articles");

// Words that are common in Swedish essay prose and NOT tics
const STOP_WORDS = new Set([
  // function words
  "och", "i", "att", "det", "en", "som", "är", "av", "för", "den",
  "med", "har", "på", "till", "inte", "om", "ett", "var", "från",
  "de", "han", "hon", "men", "sig", "sin", "sitt", "sina", "vi",
  "kan", "ska", "skulle", "denna", "dessa", "alla", "eller", "när",
  "utan", "mot", "så", "bara", "efter", "mellan", "genom", "där",
  "här", "hos", "ur", "över", "under", "vid", "redan", "också",
  "inte", "aldrig", "alltid", "ännu", "ändå", "dock", "dels",
  "vara", "bli", "blir", "blev", "varit", "hade", "hade", "finns",
  "finns", "gör", "göra", "ger", "ge", "ta", "tar", "tog",
  "vad", "hur", "varför", "vilken", "vilket", "vilka",
  "hans", "hennes", "dess", "deras", "dem", "dig", "mig", "oss",
  "den", "det", "andra", "annat", "egen", "eget", "egna",
  "mer", "mest", "mycket", "många", "några", "viss", "vissa",
  "ny", "nya", "nytt", "stor", "stora", "stort", "liten", "lilla",
  "hela", "helt", "först", "sedan", "sedan", "just", "nog",
  "ju", "väl", "ens", "inget", "ingen", "inga",
  // common essay verbs/nouns that aren't tics
  "skriver", "skrev", "säger", "sade", "ser", "såg", "vet",
  "fråga", "frågan", "svar", "svaret", "ord", "ordet",
  "människan", "människor", "världen", "liv", "livet",
  "tid", "tiden", "del", "sätt", "form", "punkt",
  // islamic terminology (expected repetition)
  "ibn", "gud", "allah", "koranen", "profeten",
  "qayyim", "taymiyyah",
  // structure words
  "dock", "däremot", "snarare", "trots", "alltså",
]);

// Bigram stop patterns (first word)
const BIGRAM_STOP_FIRST = new Set([
  "i", "en", "ett", "den", "det", "av", "för", "med", "på", "till",
  "som", "att", "och", "är", "har", "de", "sin", "sitt", "sina",
  "han", "hon", "men", "från", "inte", "om", "var", "alla",
  "kan", "ska", "vi", "denna", "dessa", "utan", "mot", "så",
  "hos", "ur", "vid", "efter", "mellan", "genom", "där", "här",
  "ibn", "al",
]);

interface ArticleWords {
  slug: string;
  words: string[];
  body: string;
}

function loadArticles(): ArticleWords[] {
  const files = readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".md"));
  return files.map((f) => {
    const raw = readFileSync(join(ARTICLES_DIR, f), "utf-8");
    // Strip frontmatter
    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : raw;
    // Strip footnotes section
    const mainBody = body.split(/\n---\n/)[0] || body;
    // Strip markdown formatting
    const clean = mainBody
      .replace(/>\s*.*/g, "") // blockquotes
      .replace(/\[.*?\]/g, "") // links/refs
      .replace(/\*[^*]+\*/g, "") // italics
      .replace(/#{1,6}\s+/g, "") // headers
      .replace(/[""''«»—–\-:;,\.!\?\(\)\/]/g, " ")
      .toLowerCase();
    const words = clean.split(/\s+/).filter((w) => w.length > 2);
    return { slug: f.replace(".md", ""), words, body: mainBody };
  });
}

// Count how many articles contain each word
function wordSpread(articles: ArticleWords[]): Map<string, Set<string>> {
  const spread = new Map<string, Set<string>>();
  for (const art of articles) {
    const seen = new Set<string>();
    for (const w of art.words) {
      if (STOP_WORDS.has(w) || w.length < 4) continue;
      if (seen.has(w)) continue;
      seen.add(w);
      if (!spread.has(w)) spread.set(w, new Set());
      spread.get(w)!.add(art.slug);
    }
  }
  return spread;
}

// Count bigram spread across articles
function bigramSpread(articles: ArticleWords[]): Map<string, Set<string>> {
  const spread = new Map<string, Set<string>>();
  for (const art of articles) {
    const seen = new Set<string>();
    for (let i = 0; i < art.words.length - 1; i++) {
      const w1 = art.words[i];
      const w2 = art.words[i + 1];
      if (BIGRAM_STOP_FIRST.has(w1)) continue;
      if (w1.length < 3 || w2.length < 3) continue;
      const bigram = `${w1} ${w2}`;
      if (seen.has(bigram)) continue;
      seen.add(bigram);
      if (!spread.has(bigram)) spread.set(bigram, new Set());
      spread.get(bigram)!.add(art.slug);
    }
  }
  return spread;
}

// Find repeated transition patterns: "X verb" where X is a name
function transitionPatterns(articles: ArticleWords[]): Map<string, string[]> {
  const patterns = new Map<string, string[]>();
  const transitionVerbs = [
    "formulerade", "formulerar", "beskrev", "beskriver",
    "visade", "visar", "hävdade", "hävdar",
    "menade", "menar", "insåg", "fastslog", "fastslår",
    "konstaterade", "konstaterar", "avslöjade", "avslöjar",
    "identifierade", "identifierar", "namngav",
    "nådde", "når", "uttryckte", "uttrycker",
    "sammanfattade", "sammanfattar",
  ];
  for (const art of articles) {
    const lines = art.body.split("\n");
    for (const line of lines) {
      for (const verb of transitionVerbs) {
        const regex = new RegExp(`\\b(\\w+)\\s+${verb}\\b`, "gi");
        let match;
        while ((match = regex.exec(line)) !== null) {
          const key = verb.toLowerCase();
          if (!patterns.has(key)) patterns.set(key, []);
          patterns.get(key)!.push(`${art.slug}: "${match[0]}"`);
        }
      }
    }
  }
  return patterns;
}

const articles = loadArticles();
const totalArticles = articles.length;

console.log(`\n=== WORD TICS: ord som förekommer i ovanligt många artiklar ===`);
console.log(`(${totalArticles} artiklar totalt)\n`);

const ws = wordSpread(articles);
const wordEntries = [...ws.entries()]
  .filter(([_, slugs]) => slugs.size >= Math.floor(totalArticles * 0.4)) // 40%+ of articles
  .sort((a, b) => b[1].size - a[1].size);

console.log("Ord i 40%+ av artiklarna (potentiella tics):\n");
for (const [word, slugs] of wordEntries.slice(0, 60)) {
  const pct = ((slugs.size / totalArticles) * 100).toFixed(0);
  console.log(`  ${word.padEnd(25)} ${slugs.size}/${totalArticles} (${pct}%)`);
}

console.log(`\n\n=== BIGRAM TICS: ordpar i 4+ artiklar ===\n`);

const bs = bigramSpread(articles);
const bigramEntries = [...bs.entries()]
  .filter(([_, slugs]) => slugs.size >= 4)
  .sort((a, b) => b[1].size - a[1].size);

for (const [bigram, slugs] of bigramEntries.slice(0, 80)) {
  console.log(`  ${bigram.padEnd(35)} ${slugs.size} artiklar`);
}

console.log(`\n\n=== TRANSITION VERBS: "Namn + verb" mönster ===\n`);

const tp = transitionPatterns(articles);
const verbEntries = [...tp.entries()]
  .filter(([_, uses]) => uses.length >= 4)
  .sort((a, b) => b[1].length - a[1].length);

for (const [verb, uses] of verbEntries) {
  console.log(`\n"${verb}" (${uses.length} förekomster):`);
  for (const u of uses) {
    console.log(`  ${u}`);
  }
}
