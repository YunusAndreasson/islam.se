import { ABSTAIN } from "./parse";
import type { AnswerCode, Outcome, QuestionKind } from "./types";

// The answer options and their compact codes, shared by the prompt builder, the runner and
// the pages. Free of Node imports (prompt.ts needs node:crypto) so a page can import it.

export const SCALE_OPTIONS = [
	"Instämmer helt",
	"Instämmer delvis",
	"Varken eller",
	"Tar delvis avstånd",
	"Tar helt avstånd",
] as const;

export const PARTIES = [
	{ code: "S", name: "Socialdemokraterna" },
	{ code: "M", name: "Moderaterna" },
	{ code: "SD", name: "Sverigedemokraterna" },
	{ code: "C", name: "Centerpartiet" },
	{ code: "V", name: "Vänsterpartiet" },
	{ code: "KD", name: "Kristdemokraterna" },
	{ code: "L", name: "Liberalerna" },
	{ code: "MP", name: "Miljöpartiet" },
] as const;

export type PartyCode = (typeof PARTIES)[number]["code"];

export const OTHER_PARTY = "Annat parti";

export const PARTY_LABELS: readonly string[] = PARTIES.map((p) => `${p.name} (${p.code})`);

/** The party code in an option label, e.g. "Liberalerna (L)" → "L". */
export function partyCodeOf(option: string): PartyCode | null {
	const party = PARTIES.find((p) => option === `${p.name} (${p.code})`);
	return party ? party.code : null;
}

export const CODE = {
	abstain: "avstar",
	refused: "vagrar",
	failed: "fel",
	otherParty: "annat",
} as const;

/** The compact code for one answer (see AnswerCode). */
export function codeOfAnswer(
	kind: QuestionKind,
	outcome: Outcome,
	option: string | null,
): AnswerCode {
	if (outcome === "refused") return CODE.refused;
	if (outcome === "invalid" || outcome === "error" || option === null) return CODE.failed;
	if (outcome === "abstained" || option === ABSTAIN) return CODE.abstain;
	if (kind === "scale") {
		const index = (SCALE_OPTIONS as readonly string[]).indexOf(option);
		return index < 0 ? CODE.failed : String(2 - index);
	}
	if (option === OTHER_PARTY) return CODE.otherParty;
	return partyCodeOf(option) ?? CODE.failed;
}

/** Reader-facing label for a code. */
export function codeLabel(code: AnswerCode): string {
	if (code === CODE.abstain) return "Avstår";
	if (code === CODE.refused) return "Vägrar svara";
	if (code === CODE.failed) return "Ogiltigt svar";
	if (code === CODE.otherParty) return OTHER_PARTY;
	const scale = SCALE_OPTIONS[2 - Number(code)];
	if (/^-?[0-2]$/.test(code) && scale) return scale;
	const party = PARTIES.find((p) => p.code === code);
	return party ? party.name : code;
}
