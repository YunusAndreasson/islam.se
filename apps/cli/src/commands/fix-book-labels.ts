import { copyFileSync } from "node:fs";
import { closeBookDatabase, initBookDatabase } from "@islam-se/quotes";
import type { Command } from "commander";

/**
 * Books whose text is English but whose label says Swedish. The importer took the
 * language from the Gutenberg catalogue's subject (»Sweden«, »Swedish fiction«), not from
 * the text. Measured 2026-10-04: 14 562 of the 31 539 passages labelled `sv` belong to
 * these books, so a search limited to Swedish returned English prose almost half the time.
 */
const ENGLISH_LABELLED_SWEDISH: Record<number, string> = {
	15: "From Pole to Pole",
	16: "Trans-Himalaya",
	25: "Peeps at Many Lands: Sweden",
	51: "Selections from the Writings of Kierkegaard",
	66: "Christ Legends",
	67: "Jerusalem",
	68: "The Story of Gösta Berling",
	69: "The Wonderful Adventures of Nils",
	70: "The Miracles of Antichrist",
	72: "The poetic Edda",
	77: "Myths of the Norsemen",
	79: "Teutonic Mythology",
	80: "Swedish fairy tales",
	82: "Folk-Lore and Legends: Scandinavian",
};

/** Seen in the same audit and left alone here, because each needs a decision, not a relabel. */
const NEEDS_A_DECISION = [
	"Books 60–63 (Species Plantarum) are Latin and book 89 (Bellman) is Finnish; the schema has no label for either.",
	"Book 5 »I Havsbandet« shares 382 of its 396 passages with book 3 »Hemsöborna och Skärkarlsliv«, and book 6 »Skärkarlsliv« is contained in book 3: one of them is a duplicate, and book 5 does not hold the novel its title names.",
	"Books 18, 72, 75, 76, 81, 82 and 83 have »Unknown Author«; book 13 is titled »Gutenberg Book 8518«; books 164, 165, 166 and 192 carry raw OpenITI codes as titles (AhkamSultaniyya, RuhFiKalam, AdabMufrad, MinhajSunna).",
];

export function registerFixBookLabelsCommand(program: Command): void {
	program
		.command("fix-book-labels")
		.description("Relabel English books stored as Swedish in books.db (dry run unless --apply)")
		.option("--apply", "Write the changes, after copying books.db to books.db.bak-labels")
		.action((options: { apply?: boolean }) => {
			try {
				const db = initBookDatabase();
				const rows = Object.entries(ENGLISH_LABELLED_SWEDISH).map(([id, expected]) => {
					const row = db
						.prepare(
							"SELECT title, language, (SELECT count(*) FROM passages p WHERE p.book_id = b.id) AS passages FROM books b WHERE id = ?",
						)
						.get(Number(id)) as { title: string; language: string; passages: number } | undefined;
					return { id: Number(id), expected, row };
				});

				// The ids are tied to titles so a re-imported database cannot be relabelled blindly.
				const todo = rows.filter(
					({ expected, row }) => row?.language === "sv" && row.title.startsWith(expected),
				);
				for (const { id, expected, row } of rows) {
					const state = row
						? row.title.startsWith(expected)
							? row.language === "sv"
								? `sv → en (${row.passages} passages)`
								: `already ${row.language}`
							: `title is now »${row.title}« — skipped`
						: "missing";
					console.log(`   ${String(id).padStart(3)}  ${expected}: ${state}`);
				}
				console.log("\nLeft for a decision:");
				for (const note of NEEDS_A_DECISION) console.log(`   • ${note}`);

				if (!options.apply) {
					console.log(
						`\nDry run: ${todo.length} book(s) would be relabelled. Re-run with --apply.`,
					);
					closeBookDatabase();
					return;
				}
				const backup = `${db.name}.bak-labels`;
				db.pragma("wal_checkpoint(TRUNCATE)");
				copyFileSync(db.name, backup);
				const update = db.prepare(
					"UPDATE books SET language = 'en' WHERE id = ? AND language = 'sv'",
				);
				db.transaction(() => {
					for (const { id } of todo) update.run(id);
				})();
				console.log(`\nRelabelled ${todo.length} book(s). Backup: ${backup}`);
				closeBookDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
