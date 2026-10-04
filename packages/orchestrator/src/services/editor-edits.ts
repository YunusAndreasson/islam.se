/**
 * The editor's own corrections to earlier essays, as examples for the language stage.
 *
 * `produce harvest` has recorded them in data/pipeline-feedback.jsonl since 2026-09, and
 * no prompt read them. They are samples: the editor fixes five to ten places per essay and
 * leaves the rest, so each pair stands for a kind of sentence, not for itself.
 */

import { existsSync, readFileSync } from "node:fs";

interface HarvestRecord {
	type?: string;
	slug?: string;
	harvestedAt?: string;
	edits?: Array<{ words?: string[] }>;
}

/** »before« → »after« with words on both sides: a rewording, not markup or punctuation. */
const WORD_PAIR = /^»(.+)« → »(.+)«$/;
const hasWord = (text: string) => /\p{L}{2,}/u.test(text);

/**
 * Up to `max` distinct rewordings, taken in turn from each essay so one heavily edited
 * essay does not set the whole pattern. Harvests of one essay are cumulative, so only the
 * latest per essay is read.
 */
export function editorEditExamples(records: HarvestRecord[], max = 40): string[] {
	const latest = new Map<string, HarvestRecord>();
	for (const record of records) {
		if (record.type !== "human-edits" || !record.slug) continue;
		const seen = latest.get(record.slug);
		if (!seen || (record.harvestedAt ?? "") >= (seen.harvestedAt ?? "")) {
			latest.set(record.slug, record);
		}
	}
	const perEssay = [...latest.values()]
		.sort((a, b) => (b.harvestedAt ?? "").localeCompare(a.harvestedAt ?? ""))
		.map((record) => {
			const pairs = (record.edits ?? []).flatMap((edit) => edit.words ?? []);
			return [...new Set(pairs)].filter((pair) => {
				const m = WORD_PAIR.exec(pair);
				if (m?.[1] === undefined || m[2] === undefined) return false;
				const [, before, after] = m;
				const words = (text: string) => text.trim().split(/\s+/).length;
				return (
					hasWord(before) &&
					hasWord(after) &&
					!after.includes("](") && // an inserted image or link
					// A changed figure or several added words is a correction of fact, and the
					// language stage must not learn to change what the text claims.
					!/\d/.test(pair) &&
					words(after) - words(before) < 3 &&
					pair.length <= 160
				);
			});
		});

	const picked: string[] = [];
	for (let i = 0; picked.length < max && perEssay.some((pairs) => i < pairs.length); i++) {
		for (const pairs of perEssay) {
			const pair = pairs[i];
			if (pair !== undefined && picked.length < max && !picked.includes(pair)) picked.push(pair);
		}
	}
	return picked;
}

/** The `<editor_edits>` block for the Swedish voice stage, or "" when nothing is harvested. */
export function editorEditsBlock(feedbackPath: string): string {
	if (!existsSync(feedbackPath)) return "";
	const records: HarvestRecord[] = [];
	for (const line of readFileSync(feedbackPath, "utf-8").split("\n")) {
		if (!line.trim()) continue;
		try {
			records.push(JSON.parse(line) as HarvestRecord);
		} catch {
			// A torn line in an append-only log is skipped, not fatal.
		}
	}
	const examples = editorEditExamples(records);
	if (examples.length === 0) return "";
	return `<editor_edits>
Det här är ändringar som redaktören själv gjorde i tidigare essäer efter publicering. De är exempel, inte en fullständig lista: redaktören rättar fem till tio ställen per essä och lämnar resten. Läs dem för att se vilken sorts svenska som rättas, och leta sedan i texten efter andra ställen av samma slag. Kopiera inte ersättningarna, eftersom varje mening rättas efter sitt eget sammanhang. Några av ändringarna rör sak och inte språk; dem efterliknar du inte, för du ändrar aldrig vad texten påstår.

${examples.map((pair) => `- ${pair}`).join("\n")}
</editor_edits>`;
}
