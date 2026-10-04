import { copyFileSync } from "node:fs";
import {
	closeDatabase,
	generateLocalEmbeddings,
	initDatabase,
	insertEmbedding,
} from "@islam-se/quotes";
import type { Command } from "commander";

/**
 * Rows in quotes.db that the pipeline's own fact-checks found wrong, run after run: an
 * abridgement stored as a quotation, two sentences merged into one, a summary that stands
 * nowhere in the work, a hadith filed under the scholar who cites it. Each correction below
 * was read in data/books.db on 2026-10-04 (the passage id is given), and `was` is the text
 * the row must still carry, so a second run changes nothing.
 *
 * Where words are left out the gap is marked […]; a subject supplied from the sentence
 * before stands in square brackets.
 */
const FIXES: Array<{
	id: number;
	was: string;
	set: { text?: string; author?: string; workTitle?: string };
	why: string;
}> = [
	{
		id: 38324,
		was: "الأصل في العبادات التوقيف فلا يشرع منها إلا ما شرعه الله، والأصل في العادات العفو فلا يحظر منها إلا ما حرمه",
		set: {
			text: "الأصل في العبادات التوقيف فلا يشرع منها إلا ما شرعه الله تعالى […] والعادات الأصل فيها العفو فلا يحظر منها إلا ما حرمه",
		},
		why: "a condensed form; this is the wording of Majmūʿ al-fatāwā 29:17 (passage 333737), with the verse between the two halves left out",
	},
	{
		id: 58027,
		was: "الدنيا طريق وممر والآخرة دار مستقر",
		set: { text: "الدنيا معبر وممر، والآخرة دار مستقر" },
		why: "two sentences merged; Madārij al-sālikīn 3:260 (passage 122594)",
	},
	{
		id: 58267,
		was: "الذوق والوجد لا يكونان حجة صحيحة من الله في المعارف الدينية",
		set: { text: "وأنا لا أنكر ذوقك له ووجدك به، ولكن الشأن في المذوق لا في الذوق" },
		why: "a summary that stands nowhere in the work; this is the sentence it summarised, Madārij al-sālikīn 3:410–411 (passage 122959)",
	},
	{
		id: 60366,
		was: "بالصدق والعدل تصلح جميع الأحوال وهما قرينان",
		set: {
			text: "بالصدق في كل الأخبار والعدل في الإنشاء من الأقوال والأعمال: تصلح جميع الأحوال وهما قرينان",
		},
		why: "an abridgement; al-Ḥisba, Majmūʿ al-fatāwā 28:66 (passage 332800)",
	},
	{
		id: 56223,
		was: "الصراط المستقيم صراط واحد، وأما طرق أهل الغضب والضلال فإنه سبحانه يجمعها",
		set: {
			text: "[الصراط المستقيم] صراط واحد، وأما طرق أهل الغضب والضلال فإنه سبحانه يجمعها ويفردها",
		},
		why: "contracted and cut before its last word; Madārij al-sālikīn 1:37 (passage 119880)",
	},
	{
		id: 16872,
		was: "الساكت عن الحق شيطان أخرس والمتكلم بالباطل شيطان ناطق",
		set: {
			text: "الساكت عن الحق شيطان أخرس، عاص لله، مراء مداهن إذا لم يخف على نفسه، والمتكلم بالباطل شيطان ناطق، عاص لله",
		},
		why: "the condition »إذا لم يخف على نفسه« was dropped, which changes what is said; al-Dāʾ wa-l-dawāʾ 1:161 (passage 118235)",
	},
	{
		id: 12770,
		was: "A worse provision on the way he cannot carry than too much beer-bibbing: for the more he drinks the less control he has of his own mind.",
		set: {
			text: "A worse provision no man can take from table than too much beer-bibbing: for the more he drinks the less control he has of his own mind.",
		},
		why: "the first half of stanza 11 joined to the second half of stanza 12; this is stanza 12 of Thorpe's Hávamál whole (passage 66032)",
	},
	{
		id: 58898,
		was: "كل مسكر خمر وكل مسكر حرام",
		set: { author: "النبي ﷺ", workTitle: "صحيح مسلم" },
		why: "the Prophet's ﷺ words, which Ibn Taymiyya cites from Muslim in al-Siyāsa al-sharʿiyya (passage 107693); they were filed as Ibn Taymiyya's",
	},
	{
		id: 58899,
		was: "إن الخمرة ما خامر العقل",
		set: { text: "الخمر ما خامر العقل", author: "عمر بن الخطاب", workTitle: "صحيح البخاري" },
		why: "ʿUmar's words from the pulpit, which Ibn Taymiyya cites from the two Ṣaḥīḥs (passage 107693); filed as Ibn Taymiyya's, in a wording the book does not have",
	},
];

/** Reported by a fact-check and checked, but not changed. */
const LEFT_ALONE = [
	"18603 (Sigrdrífumál, »dead thou naught«): reported as an error for »deal«, but the Gutenberg text the row came from (pg1152, line 5667) reads »Dead thou naught«. The row matches its source.",
	"58409 (Madārij 3:472): a verbatim fragment that begins mid-sentence. Not wrong; whether to keep it is a judgement about its context.",
	"12770's author »Sæmundur fróði«: an obsolete attribution, but 908 rows carry it, so it is a convention of the import and not a slip in one row.",
];

interface QuoteRow {
	text: string;
	author: string;
	work_title: string;
}

export function registerFixQuoteRowsCommand(program: Command): void {
	program
		.command("fix-quote-rows")
		.description(
			"Correct quote rows that fact-checks found abridged, merged or misattributed (dry run unless --apply)",
		)
		.option("--apply", "Write the changes, after copying quotes.db to a dated backup")
		.action(async (options: { apply?: boolean }) => {
			try {
				const db = initDatabase();
				const read = (id: number) =>
					db.prepare("SELECT text, author, work_title FROM quotes WHERE id = ?").get(id) as
						| QuoteRow
						| undefined;
				const taken = (text: string, id: number) =>
					db.prepare("SELECT id FROM quotes WHERE text = ? AND id != ?").get(text, id) as
						| { id: number }
						| undefined;

				const due = FIXES.filter(({ id, was, set, why }) => {
					const row = read(id);
					const clash = set.text ? taken(set.text, id) : undefined;
					const pending = row?.text === was && !clash;
					const changes = [
						set.text && `text → »${set.text}«`,
						set.author && `author → »${set.author}«`,
						set.workTitle && `work → »${set.workTitle}«`,
					]
						.filter(Boolean)
						.join("\n          ");
					const state = row
						? clash
							? `the corrected text already exists as row ${clash.id} — skipped`
							: pending
								? changes
								: "nothing to do"
						: "missing";
					console.log(`   ${id}  ${state}`);
					if (pending) console.log(`          ${why}`);
					return pending;
				});

				console.log("\nLeft alone:");
				for (const note of LEFT_ALONE) console.log(`   • ${note}`);

				if (!options.apply) {
					console.log(`\nDry run: ${due.length} row(s) would change. Re-run with --apply.`);
					closeDatabase();
					return;
				}
				if (due.length === 0) {
					console.log("\nNothing to do.");
					closeDatabase();
					return;
				}
				const backup = `${db.name}.bak-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`;
				db.pragma("wal_checkpoint(TRUNCATE)");
				copyFileSync(db.name, backup);
				console.log(`\nBackup: ${backup}`);

				// A changed text needs a new vector, or the row is found by what it used to say.
				const retexted = due.filter((fix) => fix.set.text);
				const vectors = await generateLocalEmbeddings(retexted.map((fix) => fix.set.text ?? ""));

				db.transaction(() => {
					for (const { id, set } of due) {
						const row = read(id);
						if (!row) continue;
						db.prepare("UPDATE quotes SET text = ?, author = ?, work_title = ? WHERE id = ?").run(
							set.text ?? row.text,
							set.author ?? row.author,
							set.workTitle ?? row.work_title,
							id,
						);
					}
					retexted.forEach(({ id }, i) => {
						const vector = vectors[i];
						if (!vector) return;
						db.prepare("DELETE FROM quote_embeddings WHERE rowid = ?").run(BigInt(id));
						insertEmbedding(id, vector);
					});
				})();
				console.log(`Applied: ${due.length} row(s) corrected, ${retexted.length} re-embedded.`);
				closeDatabase();
			} catch (error) {
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
