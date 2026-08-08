// Recounts the corpus figures shown on /om/redaktion/ and writes them to
// src/data/library-figures.json. Runs at the head of `pnpm build`.
//
// The databases are gitignored, so a checkout without them still has to build:
// when a database is missing the committed JSON is left exactly as it is and the
// build continues. Only a database that IS present can change a figure.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const dataDir = join(repoRoot, "data");
const outPath = join(here, "../src/data/library-figures.json");

export interface LibraryFigures {
	/** ISO date the counts were taken. Rendered as "Siffrorna gäller den …". */
	countedAt: string;
	totalQuotes: number;
	totalAuthors: number;
	totalWorks: number;
	arabicQuotes: number;
	arabicWorks: number;
	swedishQuotes: number;
	swedishWorks: number;
	norseEnglishQuotes: number;
	quranVerses: number;
	fulltextBooks: number;
}

function openReadOnly(file: string): DatabaseSync | null {
	const path = join(dataDir, file);
	if (!existsSync(path)) return null;
	return new DatabaseSync(path, { readOnly: true });
}

function scalar(db: DatabaseSync, sql: string): number {
	const row = db.prepare(sql).get() as Record<string, unknown> | undefined;
	const value = row ? Object.values(row)[0] : undefined;
	return typeof value === "number" ? value : Number(value ?? 0);
}

async function main(): Promise<void> {
	const quotes = openReadOnly("quotes.db");
	const quran = openReadOnly("quran.db");
	const books = openReadOnly("books.db");

	const missing = [
		quotes ? null : "quotes.db",
		quran ? null : "quran.db",
		books ? null : "books.db",
	].filter(Boolean);

	if (missing.length > 0) {
		const kept = existsSync(outPath) ? "keeping the committed figures" : "NO FIGURES ON DISK";
		console.warn(`[library-figures] missing ${missing.join(", ")} — ${kept}.`);
		if (existsSync(outPath)) {
			quotes?.close();
			quran?.close();
			books?.close();
			return;
		}
		throw new Error(
			"[library-figures] no databases and no committed src/data/library-figures.json — " +
				"cannot render /om/redaktion/. Restore the databases or the JSON.",
		);
	}

	// Non-null after the guard above.
	const q = quotes as DatabaseSync;
	const byLanguage = q
		.prepare(
			"select language, count(*) as quotes, count(distinct work_title) as works from quotes group by language",
		)
		.all() as { language: string; quotes: number; works: number }[];
	const lang = (code: string) => byLanguage.find((r) => r.language === code);

	const figures: LibraryFigures = {
		countedAt: new Date().toISOString().slice(0, 10),
		totalQuotes: scalar(q, "select count(*) from quotes"),
		totalAuthors: scalar(q, "select count(distinct author) from quotes"),
		totalWorks: scalar(q, "select count(distinct work_title) from quotes"),
		arabicQuotes: lang("ar")?.quotes ?? 0,
		arabicWorks: lang("ar")?.works ?? 0,
		swedishQuotes: lang("sv")?.quotes ?? 0,
		swedishWorks: lang("sv")?.works ?? 0,
		norseEnglishQuotes: lang("en")?.quotes ?? 0,
		quranVerses: scalar(quran as DatabaseSync, "select count(*) from verses"),
		fulltextBooks: scalar(books as DatabaseSync, "select count(*) from books"),
	};

	q.close();
	quran?.close();
	books?.close();

	for (const [key, value] of Object.entries(figures)) {
		if (typeof value === "number" && value <= 0) {
			throw new Error(`[library-figures] ${key} counted ${value} — refusing to publish a zero.`);
		}
	}

	const next = `${JSON.stringify(figures, null, "\t")}\n`;
	const previous = existsSync(outPath) ? await readFile(outPath, "utf8") : "";
	// countedAt moves every run; only rewrite when a real figure changed, so a
	// rebuild does not show up as a dirty file on its own.
	if (previous) {
		const old = JSON.parse(previous) as LibraryFigures;
		const same = (Object.keys(figures) as (keyof LibraryFigures)[])
			.filter((k) => k !== "countedAt")
			.every((k) => old[k] === figures[k]);
		if (same) {
			console.log(
				`[library-figures] unchanged (${figures.totalQuotes} citat), counted ${old.countedAt}.`,
			);
			return;
		}
	}

	await writeFile(outPath, next, "utf8");
	console.log(
		`[library-figures] ${figures.totalQuotes} citat, ${figures.totalAuthors} författare, ` +
			`${figures.totalWorks} verk, ${figures.fulltextBooks} böcker — ${figures.countedAt}.`,
	);
}

await main();
