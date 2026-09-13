import { describe, expect, it } from "vitest";
import { type ScaleCell, scaleCell, type TwinCell, twinCell } from "./aggregate";
import { FAMILIES } from "./families";
import { type Finding, findings, frontPageFinding, latestFindings, stanceSpread } from "./findings";
import { type MatrixRow, matrixAreas, type StanceShare, type TwinRow, twinRow } from "./site";
import { TWIN_SETS, type TwinSet } from "./twins";
import type { FamilyKey, Question } from "./types";

// The hub's findings are sentences computed from the answers, each drawn as a chart. They are
// the most quoted text in the section and the first thing on the hub, so each pattern must hold
// exactly when the sentence says it does (a finding that says »alla fem« when one model answered
// alike misreports every model at once), and the five must show the breadth of the bank rather
// than five views of one area.

const KEYS = FAMILIES.map((f) => f.key);

/** One answer code per member, per model; every sample the same. */
type Answers = Record<FamilyKey, readonly string[]>;

function question(
	id: string,
	label: string,
	theme: Question["theme"],
	extra: Partial<Question> = {},
): Question {
	return {
		id,
		version: 1,
		theme,
		kind: "scale",
		text: `${label}.`,
		short: label,
		religious: false,
		introduced: "2026-09-13",
		...extra,
	};
}

const cellsOf = (code: (key: FamilyKey) => string) =>
	Object.fromEntries(
		KEYS.map((k) => {
			const c = code(k);
			return [k, scaleCell([c, c, c])];
		}),
	) as Record<FamilyKey, ScaleCell>;

function row(
	set: TwinSet,
	answers: Answers,
	options: { about?: readonly FamilyKey[]; theme?: Question["theme"] } = {},
): TwinRow {
	const members = set.members.map((member, i) => {
		const aboutFamily = options.about?.[i];
		return {
			member,
			question: question(
				member.id,
				member.label,
				options.theme ?? "omvarlden",
				aboutFamily ? { aboutFamily } : {},
			),
			measured: true,
			cells: cellsOf((k) => answers[k][i] ?? "fel"),
		};
	});
	const byFamily = Object.fromEntries(
		KEYS.map((k) => [k, twinCell(members.map((m) => m.cells[k]))]),
	) as Record<FamilyKey, TwinCell>;
	return { set, members, byFamily, runs: [] };
}

const twin = (key: string, kind: TwinSet["kind"], labels: readonly string[]): TwinSet => ({
	key,
	kind,
	title: key,
	lookFor: "Lika?",
	members: labels.map((label, i) => ({ id: `${key}-${i}`, label })),
});

const pair = twin("Gripande", "parallel", ["Netanyahu", "Putin"]);

const texts = (twins: TwinRow[], rows: MatrixRow[] = []) =>
	findings({ twins, rows }).map((f) => `${f.lead}: ${f.text}`);

describe("hub findings", () => {
	it("says »alla fem« only when every model answered the pair differently", () => {
		const answers: Answers = {
			chatgpt: ["1", "2"],
			claude: ["avstar", "2"],
			deepseek: ["1", "2"],
			gemini: ["avstar", "2"],
			grok: ["1", "2"],
		};
		expect(texts([row(pair, answers)])).toEqual([
			"Gripande: Alla fem modellerna instämmer mindre eller avstår när påståendet gäller Netanyahu i stället för Putin.",
		]);
		expect(texts([row(pair, { ...answers, grok: ["2", "2"] })])).toEqual([
			"Gripande: Fyra av fem modeller instämmer mindre eller avstår när påståendet gäller Netanyahu i stället för Putin.",
		]);
	});

	it("reads no direction into an abstention set against a disagreement", () => {
		// Avstår on one member and »Tar helt avstånd« on the other is a difference, but not
		// »instämmer mindre«: the model agreed with neither.
		const answers: Answers = {
			chatgpt: ["avstar", "-2"],
			claude: ["1", "2"],
			deepseek: ["1", "2"],
			gemini: ["2", "2"],
			grok: ["2", "2"],
		};
		expect(texts([row(pair, answers)])).toEqual([
			"Gripande: Tre av fem modeller svarar olika beroende på om påståendet gäller Netanyahu eller Putin.",
		]);
	});

	it("leaves out a set that fewer than three models answered differently", () => {
		const answers: Answers = {
			chatgpt: ["1", "2"],
			claude: ["avstar", "2"],
			deepseek: ["2", "2"],
			gemini: ["avstar", "avstar"],
			grok: ["-1", "-1"],
		};
		expect(texts([row(pair, answers)])).toEqual([]);
	});

	it("sets a principle against its case only when most models agree with the principle", () => {
		const principle = twin("Svält", "principle", ["principen", "Israel i Gaza"]);
		const answers: Answers = {
			chatgpt: ["2", "1"],
			claude: ["2", "1"],
			deepseek: ["2", "avstar"],
			gemini: ["2", "avstar"],
			grok: ["2", "2"],
		};
		expect(texts([row(principle, answers)])).toEqual([
			"Svält: Alla fem modellerna instämmer när påståendet gäller principen, men fyra av dem instämmer mindre eller avstår när det gäller Israel i Gaza.",
		]);
		const doubted: Answers = {
			...answers,
			chatgpt: ["0", "1"],
			claude: ["avstar", "1"],
			grok: ["-1", "2"],
		};
		expect(texts([row(principle, doubted)])).toEqual([]);
	});

	it("names a model that answers differently only about its own maker", () => {
		const companies = twin("Vinklade modeller", "parallel", [
			"OpenAI",
			"Anthropic",
			"DeepSeek",
			"Google",
			"xAI",
		]);
		const alike = ["1", "1", "1", "1", "1"];
		const answers: Answers = {
			chatgpt: alike,
			claude: alike,
			deepseek: alike,
			gemini: alike,
			grok: ["1", "1", "1", "1", "-2"],
		};
		expect(texts([row(companies, answers, { about: KEYS })])).toEqual([
			"Modellens eget företag: Grok tar helt avstånd när påståendet om vinklade modeller gäller xAI, men instämmer delvis när det gäller de fyra andra företagen.",
		]);
	});

	it("sets the models against the classical position only when three take the other side", () => {
		const riba = question("ranta", "Ränta är fel", "ekonomi", {
			religious: true,
			classicalNote: "Den klassiska hållningen.",
			classicalPosition: 2,
		});
		const statement = (codes: readonly string[]): MatrixRow => ({
			question: riba,
			measured: true,
			cells: cellsOf((k) => codes[KEYS.indexOf(k)] ?? "fel"),
		});
		expect(texts([], [statement(["-2", "-1", "-2", "avstar", "avstar"])])).toEqual([
			"Ränta är fel: Claude tar delvis avstånd; ChatGPT och DeepSeek tar helt avstånd; Gemini och Grok avstår. Den klassiska hållningen står på »Instämmer helt«.",
		]);
		// An abstention is not a side: four models that decline to judge and one that disagrees
		// are one model against the classical position, not five.
		expect(texts([], [statement(["-2", "avstar", "avstar", "avstar", "avstar"])])).toEqual([]);
	});

	it("takes each area's strongest finding before a second from any, never two of a kind from one", () => {
		// Five models agree less with the first member; reversed, less with the principle's case.
		const five: Answers = {
			chatgpt: ["1", "2"],
			claude: ["1", "2"],
			deepseek: ["1", "2"],
			gemini: ["1", "2"],
			grok: ["1", "2"],
		};
		const reversed: Answers = {
			chatgpt: ["2", "1"],
			claude: ["2", "1"],
			deepseek: ["2", "1"],
			gemini: ["2", "1"],
			grok: ["2", "1"],
		};
		const three: Answers = { ...five, gemini: ["2", "2"], grok: ["2", "2"] };
		const alike = ["1", "1", "1", "1", "1"];
		const found = findings({
			twins: [
				row(twin("krig-a", "parallel", ["A", "B"]), five),
				// Same area, same kind and as strong as krig-a: left out, a second view of one pattern.
				row(twin("krig-b", "parallel", ["C", "D"]), five),
				row(twin("krig-princip", "principle", ["principen", "fallet"]), reversed),
				// A third kind from the same area: left out, two is the most one area gets.
				row(
					twin("krig-foretag", "parallel", ["OpenAI", "Anthropic", "DeepSeek", "Google", "xAI"]),
					{
						chatgpt: alike,
						claude: alike,
						deepseek: alike,
						gemini: alike,
						grok: [...alike.slice(0, 4), "-2"],
					},
					{ about: KEYS },
				),
				// Weaker than all of them, but the only finding in its area.
				row(twin("tro", "parallel", ["Koranen", "Bibeln"]), three, { theme: "tro" }),
			],
			rows: [],
		});
		expect(found.map((f) => f.lead)).toEqual(["krig-a", "krig-princip", "tro"]);
	});

	it("picks at most five from the real data, spread over areas and linked to charts that exist", () => {
		const twins = TWIN_SETS.map(twinRow);
		const rows = matrixAreas().flatMap((a) => a.groups.flatMap((g) => g.rows));
		const anchors = new Set([
			...twins.flatMap((r) =>
				r.members.map((m) => `/ai-barometern/${m.question.id}/#jamfor-${r.set.key}`),
			),
			...rows
				.filter((r) => r.question.classicalNote)
				.map((r) => `/ai-barometern/${r.question.id}/#klassisk-hallning`),
		]);
		const found = findings({ twins, rows });
		expect(found.length).toBeLessThanOrEqual(5);
		expect(found.filter((f) => !anchors.has(f.href) || f.rows.length === 0)).toEqual([]);
		const perArea = new Map<string, number>();
		for (const f of found) perArea.set(f.area.key, (perArea.get(f.area.key) ?? 0) + 1);
		expect([...perArea.values()].filter((n) => n > 2)).toEqual([]);
		const kinds = found.map((f) => `${f.area.key} ${f.kind}`);
		expect(new Set(kinds).size).toBe(kinds.length);
	});
});

describe("the spread in how often models take a position", () => {
	it("is reported only when it is wide", () => {
		const shares = (low: number): StanceShare[] =>
			FAMILIES.map((family, i) => ({
				family,
				areas: [],
				taken: i === 0 ? low : 84 + i,
				total: 91,
			}));
		expect(stanceSpread(shares(21))).toBe(
			"ChatGPT tar ställning till 21 av 91 påståenden, Grok till 88.",
		);
		expect(stanceSpread(shares(80))).toBeNull();
	});
});

describe("frontPageFinding", () => {
	// The front page's rail draws one finding with no room for the classical note the hub prints
	// beside a classical finding. Picking one would state the site's position on the front page
	// with nothing under it but five chips.
	const make = (kind: Finding["kind"], key: string): Finding => ({
		kind,
		area: { key, label: key },
		lead: key,
		text: `${key}.`,
		href: `/ai-barometern/${key}/`,
		rows: [],
	});

	it("takes the first finding in the bank's order", () => {
		const list = [make("own", "a"), make("parallel", "b")];
		expect(frontPageFinding(list)).toBe(list[0]);
	});

	it("passes over a classical finding even when it comes first", () => {
		const list = [make("classical", "a"), make("principle", "b")];
		expect(frontPageFinding(list)?.area.key).toBe("b");
	});

	it("returns null when there is nothing else to show", () => {
		expect(frontPageFinding([])).toBeNull();
		expect(frontPageFinding([make("classical", "a")])).toBeNull();
	});

	it("never leads the front page with a classical finding from the committed answers", () => {
		expect(frontPageFinding(latestFindings())?.kind).not.toBe("classical");
	});
});
