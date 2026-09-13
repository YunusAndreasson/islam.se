import type { ScaleCell } from "./aggregate";
import { FAMILIES } from "./families";
import type { FamilyKey } from "./types";

// The sentences the pages write from the data. A reader, a screen reader and a search engine all
// get the answer in words before the chart, and because the words are computed from the same cells
// as the chart, they cannot drift from it.

/** "a", "a och b", "a, b och c". */
export function svJoin(items: readonly string[]): string {
	if (items.length <= 1) return items[0] ?? "";
	return `${items.slice(0, -1).join(", ")} och ${items.at(-1)}`;
}

const POSITION_PHRASES: Record<string, string> = {
	"2": "instämmer helt",
	"1": "instämmer delvis",
	"0": "svarar varken eller",
	"-1": "tar delvis avstånd",
	"-2": "tar helt avstånd",
};

/** What a model did with a statement, as a verb phrase; null when it gave no answer. */
export function stancePhrase(cell: ScaleCell): string | null {
	if (cell.state === "position") return POSITION_PHRASES[String(cell.display)] ?? null;
	if (cell.state === "abstain") return "avstår";
	if (cell.state === "refused") return "vägrar svara";
	if (cell.state === "split") return "ger motstridiga svar";
	return null;
}

// Agreement first, then the answers without a position.
const PHRASE_ORDER = [
	"instämmer helt",
	"instämmer delvis",
	"svarar varken eller",
	"tar delvis avstånd",
	"tar helt avstånd",
	"ger motstridiga svar",
	"avstår",
	"vägrar svara",
];

const HOW_MANY: Record<number, string> = {
	1: "en",
	2: "två",
	3: "tre",
	4: "fyra",
	5: "fem",
	6: "sex",
};

/** »fyra«; numerals past six. */
export function countWord(n: number): string {
	return HOW_MANY[n] ?? String(n);
}

/** »ChatGPT, Claude och DeepSeek instämmer helt; Grok instämmer delvis; Gemini avstår.«
 *  Groups are set off by semicolons: joined with »och« like the names inside them, »Grok
 *  instämmer helt, ChatGPT och Claude instämmer delvis och Gemini avstår« read as one list.
 *  Empty when no model has answered. */
export function describeRow(cells: Readonly<Record<FamilyKey, ScaleCell>>): string {
	const groups = new Map<string, string[]>();
	for (const family of FAMILIES) {
		const phrase = stancePhrase(cells[family.key]);
		if (phrase) groups.set(phrase, [...(groups.get(phrase) ?? []), family.label]);
	}
	const [first] = groups;
	if (!first) return "";
	if (groups.size === 1 && first[1].length === FAMILIES.length && FAMILIES.length > 1) {
		const count = HOW_MANY[FAMILIES.length];
		return `Alla ${count ? `${count} ` : ""}modellerna ${first[0]}.`;
	}
	const parts = PHRASE_ORDER.flatMap((phrase) => {
		const names = groups.get(phrase);
		return names ? [`${svJoin(names)} ${phrase}`] : [];
	});
	return `${parts.join("; ")}.`;
}

/** »båda«, »alla tre«: how the pages refer to every member of a set of `n`. */
export function everyOf(n: number): string {
	if (n === 2) return "båda";
	const count = HOW_MANY[n];
	return count ? `alla ${count}` : "alla";
}
