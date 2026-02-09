import { closeDatabase, initDatabase, rebuildFts } from "@islam-se/quotes";
import type { Command } from "commander";

interface TimedResult {
	count: number;
	timeMs: number;
	topIds: number[];
}

export function registerFtsValidateCommand(program: Command): void {
	program
		.command("fts-validate")
		.description("Compare LIKE vs FTS5 text search (validation)")
		.action(() => {
			try {
				const database = initDatabase();

				// Test if FTS5 index has actual tokenized content
				// (external content tables report row count even when empty)
				let hasContent = false;
				try {
					const testResult = database
						.prepare(
							"SELECT COUNT(*) as c FROM quotes_fts WHERE quotes_fts MATCH '\"a\" OR \"the\" OR \"och\"' LIMIT 1",
						)
						.get() as { c: number };
					hasContent = testResult.c > 0;
				} catch {
					hasContent = false;
				}

				if (!hasContent) {
					console.log("FTS5 index needs rebuilding...");
					const start = performance.now();
					rebuildFts();
					const elapsed = performance.now() - start;
					const newCount = (
						database
							.prepare("SELECT COUNT(*) as c FROM quotes_fts")
							.get() as { c: number }
					).c;
					console.log(
						`Rebuilt FTS5 index with ${newCount} entries in ${elapsed.toFixed(0)}ms.\n`,
					);
				} else {
					const ftsCount = (
						database
							.prepare("SELECT COUNT(*) as c FROM quotes_fts")
							.get() as { c: number }
					).c;
					console.log(`FTS5 index has ${ftsCount} entries.\n`);
				}

				const queries = [
					{ label: "Swedish word", query: "tålamod" },
					{ label: "Swedish author", query: "Strindberg" },
					{ label: "Arabic word", query: "الصبر" },
					{ label: "Arabic author", query: "ابن القيم" },
					{ label: "Partial (prefix)", query: "tålam" },
					{ label: "Multi-word", query: "patience and virtue" },
					{ label: "Swedish keyword", query: "dygd" },
					{ label: "Work title", query: "Röda rummet" },
				];

				const limit = 20;

				console.log("=".repeat(80));
				console.log("LIKE vs FTS5 comparison");
				console.log("=".repeat(80));

				for (const { label, query } of queries) {
					// LIKE search
					const likeResult = timeLikeSearch(database, query, limit);

					// FTS5 search
					const ftsResult = timeFtsSearch(database, query, limit);

					// Compute overlap
					const likeSet = new Set(likeResult.topIds);
					const ftsSet = new Set(ftsResult.topIds);
					const overlap = [...likeSet].filter((id) => ftsSet.has(id)).length;
					const overlapPct =
						likeSet.size > 0
							? ((overlap / likeSet.size) * 100).toFixed(0)
							: "N/A";

					console.log(`\n${label}: "${query}"`);
					console.log(
						`  LIKE: ${likeResult.count} results in ${likeResult.timeMs.toFixed(1)}ms`,
					);
					console.log(
						`  FTS5: ${ftsResult.count} results in ${ftsResult.timeMs.toFixed(1)}ms`,
					);
					console.log(
						`  Overlap: ${overlap}/${likeSet.size} (${overlapPct}%)`,
					);

					if (ftsResult.timeMs > 0 && likeResult.timeMs > 0) {
						const speedup = likeResult.timeMs / ftsResult.timeMs;
						console.log(`  Speedup: ${speedup.toFixed(1)}x`);
					}
				}

				console.log(`\n${"=".repeat(80)}`);
				console.log("Done.");
			} catch (error) {
				console.error(
					"Error:",
					error instanceof Error ? error.message : error,
				);
				process.exit(1);
			} finally {
				closeDatabase();
			}
		});
}

function timeLikeSearch(
	db: ReturnType<typeof initDatabase>,
	query: string,
	limit: number,
): TimedResult {
	const pattern = `%${query}%`;
	const start = performance.now();
	const rows = db
		.prepare(
			`SELECT id FROM quotes
			 WHERE standalone >= 1
			   AND (text LIKE ? OR author LIKE ? OR work_title LIKE ? OR keywords LIKE ?)
			 ORDER BY standalone DESC
			 LIMIT ?`,
		)
		.all(pattern, pattern, pattern, pattern, limit) as Array<{ id: number }>;
	const timeMs = performance.now() - start;

	return {
		count: rows.length,
		timeMs,
		topIds: rows.map((r) => r.id),
	};
}

function timeFtsSearch(
	db: ReturnType<typeof initDatabase>,
	query: string,
	limit: number,
): TimedResult {
	// Build FTS5 query with prefix matching
	const tokens = query
		.split(/\s+/)
		.filter((t) => t.length > 0);
	const ftsQuery = tokens
		.map((token) => `"${token.replace(/"/g, '""')}"*`)
		.join(" ");

	if (!ftsQuery) return { count: 0, timeMs: 0, topIds: [] };

	try {
		const start = performance.now();
		const rows = db
			.prepare(
				`SELECT q.id, rank
				 FROM quotes_fts fts
				 JOIN quotes q ON q.id = fts.rowid
				 WHERE quotes_fts MATCH ?
				   AND q.standalone >= 1
				 ORDER BY rank
				 LIMIT ?`,
			)
			.all(ftsQuery, limit) as Array<{ id: number; rank: number }>;
		const timeMs = performance.now() - start;

		return {
			count: rows.length,
			timeMs,
			topIds: rows.map((r) => r.id),
		};
	} catch (error) {
		console.error(`  FTS5 error: ${error instanceof Error ? error.message : error}`);
		return { count: 0, timeMs: 0, topIds: [] };
	}
}
