import { copyFileSync } from "node:fs";
import { closeBookDatabase, deleteBook, initBookDatabase } from "@islam-se/quotes";
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

/**
 * Title, author or language corrections, each read off the book's own title page in the
 * stored text (2026-10-04). `was` is the title the row must still carry, so a re-run or a
 * re-imported database is left alone.
 */
const METADATA: Array<{
	id: number;
	was: string;
	set: { title?: string; author?: string; language?: "sv" | "en" };
	why: string;
}> = [
	{
		id: 5,
		was: "I Havsbandet",
		set: { title: "Hemsöborna" },
		why: "the text is Hemsöborna (it ends »… över det nyckfulla livets blåsiga fjärdar och gröna sund«); I havsbandet is not in the corpus",
	},
	{
		id: 13,
		was: "Gutenberg Book 8518",
		set: { title: "Fritiofs saga", author: "Esaias Tegnér", language: "sv" },
		why: "Stomberg's school edition: the poem is Swedish, and Swedish outweighs the English apparatus",
	},
	{
		id: 18,
		was: "Svensk diktning II",
		set: { author: "Jules Mauritzson (ed.)" },
		why: "the editor named on the title page",
	},
	{
		id: 72,
		was: "The poetic Edda : $b",
		set: { title: "The Poetic Edda", author: "Henry Adams Bellows (transl.)" },
		why: "catalogue markup in the title; the translator named on the title page",
	},
	{
		id: 75,
		was: "The story of Burnt Njal",
		set: { author: "George Webbe Dasent (transl.)" },
		why: "the translator named on the title page",
	},
	{
		id: 76,
		was: "Laxdæla Saga",
		set: { author: "Muriel A. C. Press (transl.)" },
		why: "the translator named on the title page",
	},
	{
		id: 83,
		was: "Stories by Foreign Authors: Scandinavian",
		set: { author: "Various authors" },
		why: "an anthology (Bjørnson, Aho and others)",
	},
	{
		id: 164,
		was: "AhkamSultaniyya",
		set: { title: "al-Ahkam al-Sultaniyya" },
		why: "raw OpenITI code as title",
	},
	{ id: 165, was: "RuhFiKalam", set: { title: "al-Ruh" }, why: "raw OpenITI code as title" },
	{
		id: 166,
		was: "AdabMufrad",
		set: { title: "al-Adab al-Mufrad" },
		why: "raw OpenITI code as title",
	},
	{
		id: 192,
		was: "MinhajSunna",
		set: { title: "Minhaj al-Sunna", author: "ابن تيمية" },
		why: "raw OpenITI codes; the author as his fifteen other books spell him",
	},
];

/** Books removed from the corpus. `was` guards the id, as above. */
const REMOVE: Array<{ id: number; was: string; why: string }> = [
	{
		id: 3,
		was: "Hemsöborna och Skärkarlsliv",
		why: "the same text as books 5 (Hemsöborna) and 6 (Skärkarlsliv) together: every passage of each is in the other, title pages aside. The two single works give a note its exact title.",
	},
	...[60, 61, 62, 63].map((id) => ({
		id,
		was: "Species Plantarum",
		why: "Latin plant descriptions (»Amomum scapo vestito racemoso«), stored as Swedish or English and returned by searches in those languages",
	})),
	{
		id: 89,
		was: "C. M. Bellmanin Lauluja ja Loiluja",
		why: "a Finnish translation of Bellman, stored as Swedish",
	},
];

/** Left alone: nothing in the stored text settles them. */
const NEEDS_A_DECISION = [
	"Books 81 (The Swedish Fairy Book) and 82 (Folk-Lore and Legends: Scandinavian) keep »Unknown Author«: the stored title pages name no editor.",
	"Strindberg's I havsbandet is not in the corpus; book 5 carried its title over the text of Hemsöborna.",
];

interface BookRow {
	title: string;
	author: string;
	language: string;
	passages: number;
}

export function registerFixBookLabelsCommand(program: Command): void {
	program
		.command("fix-book-labels")
		.description(
			"Correct book language labels, titles and authors in books.db and remove duplicate or unusable books (dry run unless --apply)",
		)
		.option("--apply", "Write the changes, after copying books.db to a dated backup")
		.action((options: { apply?: boolean }) => {
			try {
				const db = initBookDatabase();
				const read = (id: number) =>
					db
						.prepare(
							"SELECT title, author, language, (SELECT count(*) FROM passages p WHERE p.book_id = b.id) AS passages FROM books b WHERE id = ?",
						)
						.get(id) as BookRow | undefined;
				const matches = (row: BookRow | undefined, was: string): row is BookRow =>
					row?.title.startsWith(was) === true;

				console.log("Language: English books stored as Swedish");
				const relabel = Object.entries(ENGLISH_LABELLED_SWEDISH)
					.map(([id, was]) => ({ id: Number(id), was, row: read(Number(id)) }))
					.filter(({ id, was, row }) => {
						const due = matches(row, was) && row.language === "sv";
						const state = due ? `sv → en (${row.passages} passages)` : "nothing to do";
						console.log(`   ${String(id).padStart(3)}  ${was}: ${state}`);
						return due;
					});

				console.log("\nTitle, author, language");
				const metadata = METADATA.filter(({ id, was, set, why }) => {
					const due = matches(read(id), was);
					const change = Object.entries(set)
						.map(([field, value]) => `${field} → »${value}«`)
						.join(", ");
					console.log(`   ${String(id).padStart(3)}  ${was}: ${due ? change : "nothing to do"}`);
					if (due) console.log(`        ${why}`);
					return due;
				});

				console.log("\nRemoved");
				const remove = REMOVE.filter(({ id, was, why }) => {
					const row = read(id);
					const due = matches(row, was);
					console.log(
						`   ${String(id).padStart(3)}  ${was}: ${due ? `delete (${row.passages} passages)` : "nothing to do"}`,
					);
					if (due) console.log(`        ${why}`);
					return due;
				});

				console.log("\nLeft alone:");
				for (const note of NEEDS_A_DECISION) console.log(`   • ${note}`);

				const total = relabel.length + metadata.length + remove.length;
				if (!options.apply) {
					console.log(`\nDry run: ${total} change(s) pending. Re-run with --apply.`);
					closeBookDatabase();
					return;
				}
				if (total === 0) {
					console.log("\nNothing to do.");
					closeBookDatabase();
					return;
				}
				const backup = `${db.name}.bak-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`;
				db.pragma("wal_checkpoint(TRUNCATE)");
				copyFileSync(db.name, backup);
				console.log(`\nBackup: ${backup}`);

				db.transaction(() => {
					const setLanguage = db.prepare("UPDATE books SET language = ? WHERE id = ?");
					for (const { id } of relabel) setLanguage.run("en", id);
					for (const { id, set } of metadata) {
						if (set.title) db.prepare("UPDATE books SET title = ? WHERE id = ?").run(set.title, id);
						if (set.author)
							db.prepare("UPDATE books SET author = ? WHERE id = ?").run(set.author, id);
						if (set.language) setLanguage.run(set.language, id);
					}
				})();
				for (const { id, was } of remove) {
					deleteBook(id);
					console.log(`   removed ${id} ${was}`);
				}
				console.log(
					`Applied: ${relabel.length} relabelled, ${metadata.length} corrected, ${remove.length} removed.`,
				);
				closeBookDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
