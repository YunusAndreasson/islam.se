/**
 * What the human changed after the pipeline finished.
 *
 * ⚠️ WHY THIS EXISTS. Diffing final.md against the published essay was the one measure
 * that showed what the pipeline still got wrong (2026-09): paragraph similarity 0.73 on
 * »Marknaden i raden«, 0.78 on »Sorgen vid Nilen«, 0.90 on »Rösten är ingen belöning« —
 * first person, broken collocations, formula sentences, a mistranslated word the reviewer
 * had flagged. None of it was recorded anywhere, so no prompt or gate could learn from it.
 * `produce harvest` records it: human-edits.md next to the run, and one line in
 * data/pipeline-feedback.jsonl.
 */
import { diffArrays, diffWords } from "diff";

interface HumanEdit {
	before: string;
	after: string;
	/** The changed words only, as »old« → »new« fragments. */
	words: string[];
}

export interface HarvestResult {
	paragraphsBefore: number;
	paragraphsAfter: number;
	/** Share of the pipeline's paragraphs that reached the reader unchanged. */
	unchangedShare: number;
	edits: HumanEdit[];
	titleChanged?: { before: string; after: string };
	descriptionChanged?: { before?: string; after?: string };
}

/** Body paragraphs without frontmatter or the leading H1, for comparison. */
export function essayParagraphs(markdown: string): string[] {
	return markdown
		.replace(/^---\n[\s\S]*?\n---\n/, "")
		.replace(/^#\s+.+\n+/, "")
		.split(/\n\s*\n/)
		.map((p) => p.replace(/\s+/g, " ").trim())
		.filter((p) => p && p !== "---");
}

function wordChanges(before: string, after: string): string[] {
	const out: string[] = [];
	let removed = "";
	for (const part of diffWords(before, after)) {
		if (part.removed) removed += part.value;
		else if (part.added) {
			out.push(`»${removed.trim()}« → »${part.value.trim()}«`);
			removed = "";
		} else if (removed) {
			out.push(`»${removed.trim()}« → »«`);
			removed = "";
		}
	}
	if (removed) out.push(`»${removed.trim()}« → »«`);
	return out;
}

export function harvestEdits(finalMarkdown: string, publishedMarkdown: string): HarvestResult {
	const before = essayParagraphs(finalMarkdown);
	const after = essayParagraphs(publishedMarkdown);
	const edits: HumanEdit[] = [];
	let unchanged = 0;

	let removed: string[] = [];
	const flush = (added: string[]) => {
		const pairs = Math.max(removed.length, added.length);
		for (let i = 0; i < pairs; i++) {
			const b = removed[i] ?? "";
			const a = added[i] ?? "";
			edits.push({ before: b, after: a, words: b && a ? wordChanges(b, a) : [] });
		}
		removed = [];
	};
	for (const part of diffArrays(before, after)) {
		if (part.removed) {
			removed.push(...part.value);
		} else if (part.added) {
			flush(part.value);
		} else {
			if (removed.length) flush([]);
			unchanged += part.value.length;
		}
	}
	if (removed.length) flush([]);

	return {
		paragraphsBefore: before.length,
		paragraphsAfter: after.length,
		unchangedShare: before.length ? unchanged / before.length : 1,
		edits,
	};
}

export function formatHarvest(result: HarvestResult, title: string): string {
	const lines = [
		`# Mänskliga ändringar — ${title}`,
		"",
		`${Math.round(result.unchangedShare * 100)} % av pipelinens stycken nådde läsaren oförändrade (${result.paragraphsBefore} → ${result.paragraphsAfter} stycken, ${result.edits.length} ändrade).`,
		"",
	];
	if (result.titleChanged) {
		lines.push(`**Titel:** »${result.titleChanged.before}« → »${result.titleChanged.after}«`, "");
	}
	if (result.descriptionChanged) {
		lines.push(
			`**Description:** »${result.descriptionChanged.before ?? "(ingen)"}« → »${result.descriptionChanged.after ?? "(ingen)"}«`,
			"",
		);
	}
	result.edits.forEach((edit, i) => {
		lines.push(`## ${i + 1}`, "");
		if (edit.words.length > 0) {
			for (const w of edit.words) lines.push(`- ${w}`);
		} else {
			lines.push(`- före: ${edit.before || "(inget)"}`, `- efter: ${edit.after || "(borttaget)"}`);
		}
		lines.push("");
	});
	return lines.join("\n");
}
