/**
 * Deterministic house-rule checks on a finished essay.
 *
 * These are the things the human was still fixing by hand after every run, measured by
 * diffing final.md against the published file (2026-09): first person in the essay's
 * own voice, »skarp«, formula sentences, and a description that repeats the lede. None
 * of them was counted by scripts/evaluate-article.py, whose total is ~95 % repetition
 * findings, so the gate that decided whether a correction pass ran could not see them.
 *
 * Findings are CANDIDATES, like the evaluator's report: a first-person »jag« inside an
 * imagined objection (»Invändningen ligger nära: jag röstar ju på ett program«) is fine.
 * The fixer judges `fixable` findings; `review` findings go to open-issues.md for a human,
 * because only a reader can tell whether a shia mention is answered or left standing.
 */

type HouseRule =
	| "first-person"
	| "skarp"
	| "hen"
	| "school-label"
	| "sect-mention"
	| "concession"
	| "formula-opener"
	| "description-missing"
	| "description-repeats-lede";

export interface HouseFinding {
	rule: HouseRule;
	/** fixable: a patch can repair it. review: a human decides. */
	kind: "fixable" | "review";
	line: number;
	excerpt: string;
	message: string;
}

/** Replace quoted material with spaces, keeping offsets, so matches inside quotes vanish. */
function maskQuotations(line: string): string {
	return line.replace(/"[^"\n]*"|“[^”\n]*”|»[^«\n]*«/g, (m) => " ".repeat(m.length));
}

function sentenceAround(line: string, index: number): string {
	const before = line.lastIndexOf(". ", index);
	const after = line.indexOf(". ", index);
	const start = before === -1 ? 0 : before + 2;
	const end = after === -1 ? line.length : after + 1;
	const sentence = line.slice(start, end).trim();
	return sentence.length > 220 ? `${sentence.slice(0, 220)}…` : sentence;
}

interface LineRule {
	rule: HouseRule;
	kind: HouseFinding["kind"];
	pattern: RegExp;
	message: string;
	/** Also scan footnote definitions (the »översättningarna är mina« case). */
	footnotes?: boolean;
}

const LINE_RULES: LineRule[] = [
	{
		rule: "first-person",
		kind: "fixable",
		pattern: /\b(jag|mig|mej|min|mitt|mina)\b/gi,
		message:
			"Första person singular i essäns egen röst. Skriv opersonligt (»gränsen går«, »steget är kort«). En tänkt talare eller ett citat får stå.",
		footnotes: true,
	},
	{
		rule: "skarp",
		kind: "fixable",
		pattern: /\bskarp\w*/gi,
		message:
			"»skarp/skarpare/skarpaste« har budget noll. Säg vad som gör det precist, eller stryk ramningen; byt inte till »starkaste« eller »tydligaste«.",
	},
	{
		rule: "hen",
		kind: "fixable",
		pattern: /\bhen\b/gi,
		message: "Pronomenet »hen« används aldrig. Formulera om meningen.",
	},
	{
		rule: "school-label",
		kind: "fixable",
		pattern: /\b(salafi\w*|wahhab\w*|athari\w*|sunnitisk\w*)/gi,
		message:
			"Skolan namnges aldrig i läsartext. Skriv »klassisk«, »de lärda«, »ahl as-sunna«, »traditionen«.",
	},
	{
		rule: "sect-mention",
		kind: "review",
		pattern:
			/\b(shia\w*|shiit\w*|jaʿfar\w*|ja'far\w*|jafarit\w*|tolvshi\w*|imamit\w*|sufi\w*|tariqa\w*|tasawwuf)/gi,
		message:
			"Shia eller sufism nämns. Tillåtet bara när den klassiska hållningen svarar i samma avsnitt; en neutral omnämning ska bort.",
	},
	{
		rule: "concession",
		kind: "review",
		pattern:
			/går inte att förklara bort|kan inte avfärdas|riktigt men inte fullständigt|de lärda är oense|medeltida manliga/gi,
		message:
			"Eftergiftsform. Invändningen får stå i full styrka, men den klassiska hållningen ska ha sista ordet.",
	},
];

const FORMULA_OPENER = /(?:^|[.!?]\s+)(Det är den som|Det vet (?:den|alla) som|Den som)\s/g;
/** evaluate-article.py allows two »Den som« openers; the formula family shares that budget. */
const FORMULA_OPENER_BUDGET = 2;

/**
 * Does the description repeat the first paragraph? The publisher used to cut the
 * description from the body's opening sentences, so 30 of 61 essays showed the same
 * ~270 characters twice on the page.
 */
export function descriptionRepeatsLede(description: string, body: string): boolean {
	const tokens = (s: string) =>
		s
			.toLowerCase()
			.replace(/\[\^[^\]]+\]/g, " ")
			.split(/[^\p{L}\p{N}]+/u)
			.filter(Boolean);
	const lede = body
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter((p) => p && !p.startsWith("#") && !p.startsWith(">"))
		.slice(0, 2)
		.join(" ");
	const d = tokens(description);
	const l = tokens(lede);
	if (d.length < 4 || l.length < 4) return false;
	if (d.slice(0, 6).join(" ") === l.slice(0, 6).join(" ")) return true;
	const ledeGrams = new Set<string>();
	for (let i = 0; i + 4 <= l.length; i++) ledeGrams.add(l.slice(i, i + 4).join(" "));
	let shared = 0;
	let total = 0;
	for (let i = 0; i + 4 <= d.length; i++) {
		total++;
		if (ledeGrams.has(d.slice(i, i + 4).join(" "))) shared++;
	}
	return total > 0 && shared / total >= 0.3;
}

export function checkHouseRules(
	body: string,
	meta: { description?: string; checkDescription?: boolean } = {},
): HouseFinding[] {
	const findings: HouseFinding[] = [];
	const lines = body.split("\n");
	let inFence = false;

	lines.forEach((raw, index) => {
		if (raw.trimStart().startsWith("```")) {
			inFence = !inFence;
			return;
		}
		if (inFence || raw.startsWith(">") || /^#{1,6}\s/.test(raw)) return;
		const isFootnote = /^\[\^[^\]]+\]:/.test(raw);
		const line = maskQuotations(raw);
		for (const rule of LINE_RULES) {
			if (isFootnote && !rule.footnotes) continue;
			for (const match of line.matchAll(rule.pattern)) {
				findings.push({
					rule: rule.rule,
					kind: rule.kind,
					line: index + 1,
					excerpt: sentenceAround(raw, match.index ?? 0),
					message: rule.message,
				});
			}
		}
	});

	const openers: Array<{ line: number; excerpt: string; phrase: string }> = [];
	lines.forEach((raw, index) => {
		if (!raw.trim() || raw.startsWith(">") || /^\[\^[^\]]+\]:/.test(raw)) return;
		for (const m of raw.matchAll(FORMULA_OPENER)) {
			const phrase = m[1] ?? "";
			const at = (m.index ?? 0) + m[0].indexOf(phrase);
			openers.push({ line: index + 1, excerpt: sentenceAround(raw, at), phrase });
		}
	});
	for (const o of openers.slice(FORMULA_OPENER_BUDGET)) {
		findings.push({
			rule: "formula-opener",
			kind: "fixable",
			line: o.line,
			excerpt: o.excerpt,
			message: `»${o.phrase} …« och dess syskon öppnar ${openers.length} meningar (budget ${FORMULA_OPENER_BUDGET}). Börja med verbet, objektet eller ett konkret subjekt.`,
		});
	}

	if (meta.checkDescription) {
		const description = meta.description?.trim();
		if (!description) {
			findings.push({
				rule: "description-missing",
				// Not the fixer's: a patch edits the body, and the description is not in it.
				kind: "review",
				line: 0,
				excerpt: "",
				message: "Ingen description. Utan den skär publiceraren ingressen ur första stycket.",
			});
		} else if (descriptionRepeatsLede(description, body)) {
			findings.push({
				rule: "description-repeats-lede",
				kind: "review",
				line: 0,
				excerpt: description,
				message:
					"Description upprepar inledningen. Använd ett konkret ankare (ett datum, ett citat) och essäns vändning.",
			});
		}
	}

	return findings;
}

/** The findings as a report block for a fixer's prompt, in the evaluator's register. */
export function formatHouseFindings(findings: HouseFinding[]): string {
	if (findings.length === 0) return "";
	const lines = findings.map(
		(f) =>
			`- [${f.rule}]${f.line ? ` rad ${f.line}` : ""}: ${f.excerpt ? `»${f.excerpt}« — ` : ""}${f.message}`,
	);
	return `HUSREGLER (${findings.length} kandidater)\n${lines.join("\n")}`;
}
