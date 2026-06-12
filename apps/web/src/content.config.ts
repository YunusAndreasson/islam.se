import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

const articles = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "../../data/articles" }),
	schema: z.object({
		title: z.string(),
		// ISO-validated but kept as a string: templates pass it straight to
		// datetime attrs/JSON-LD, and a malformed pipeline timestamp should
		// fail the build rather than silently mis-sort the essay list.
		publishedAt: z.string().datetime(),
		wordCount: z.number(),
		description: z.string(),
		audioFile: z.string().optional(),
		audioDuration: z.number().optional(),
		// Ämne (primary category). Order is the canonical da'wah sequence — see
		// islam-se-frontpage-plan.md §6. Optional so a freshly produced essay
		// can't break the build before it is assigned.
		category: z
			.enum(["Skapelsen", "Skriften", "Själen", "Rättvisa", "Samhälle", "Sökandet", "Norden"])
			.optional(),
	}),
});

// Daily-verse rotation (§7.2). All fields are fetched once, by hand, from the
// Tarteel MCP via `pnpm sync-verses` and committed — the Arabic, Bernström's
// Swedish, and the reciter mp3 are static thereafter; nothing calls Tarteel at
// build, deploy, or runtime. `relatedEssay` is NOT stored here: it is derived at
// build time from the essay footnotes by the citation index (src/lib/citations).
const verser = defineCollection({
	loader: file("src/content/verser/verses.json"),
	schema: z.object({
		surah: z.number(),
		ayah: z.number(),
		ayahKey: z.string(), // "13:28"
		surahName: z.string(), // transliterated, e.g. "Ar-Ra'd"
		surahNameArabic: z.string(),
		textArabic: z.string(), // fully voweled Uthmanic
		textSwedish: z.string(), // Knut Bernström, Koranens budskap
		translator: z.string(),
		reciter: z.string(),
		audioFile: z.string(), // committed, self-hosted: /audio/quran/013028.mp3
		// Word-recitation timing for the mp3: [wordNumber, startMs, endMs], offsets
		// relative to the clip start. Drives the daily-verse word highlight. Synced
		// from QUL by `pnpm sync-verses`; see src/lib/verse.ts.
		segments: z.array(z.tuple([z.number(), z.number(), z.number()])),
	}),
});

// Trådar — editorially curated arcs of essays (§6, §13.6). Net-new authored
// data referencing essay slugs; the essay files stay untouched.
const tradar = defineCollection({
	loader: file("src/content/tradar/tradar.json"),
	schema: z.object({
		title: z.string(),
		framing: z.string(),
		essays: z.array(z.string()),
	}),
});

// Tänkare — recurring interlocutors (§6, §13.7). Membership is DERIVED from the
// corpus at build time: `match` holds the distinctive spelling(s) of the name as
// the essays write it (diacritics included), and src/lib/tankare.ts collects
// every essay whose body contains one. Only the framing prose is authored, so
// the lists can never silently drift as essays are added or removed. Two facing
// traditions: the classical Sunni canon and the Swedish/Western voices.
const tankare = defineCollection({
	loader: file("src/content/tankare/tankare.json"),
	schema: z.object({
		name: z.string(),
		slug: z.string(),
		tradition: z.enum(["sunni", "western"]),
		framing: z.string(),
		// Case-insensitive substring(s) matched against essay bodies; diacritics
		// are kept so "Linné" never matches "linne" (linen) and "Ghazālī" never
		// matches the poem "ghazal". Verified to reproduce the prior hand-curated
		// lists exactly across the whole corpus.
		match: z.array(z.string()).min(1),
	}),
});

export const collections = { articles, verser, tradar, tankare };
