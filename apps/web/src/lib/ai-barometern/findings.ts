import type { ScaleCell } from "./aggregate";
import { FAMILIES } from "./families";
import { codeLabel } from "./options";
import { AREAS } from "./questions";
import {
	latestRun,
	type MatrixRow,
	matrixAreas,
	questionPath,
	type StanceShare,
	type TwinRow,
	twinRow,
} from "./site";
import { countWord, describeRow, stancePhrase } from "./summary";
import { TWIN_SETS } from "./twins";
import type { FamilyKey, Question } from "./types";

// The hub's »Det här visar mätningen«: the clearest patterns in the latest answers, written and
// drawn from the data, never typed by hand. Each candidate tests its own pattern against the
// answers and returns nothing when the pattern is gone, so a finding can drop off the page but
// never go stale on it.
//
// Four kinds of pattern:
//   parallel   the same statement about two peoples, states or religions, answered differently
//   principle  a principle most models accept, and less agreement when it meets a case
//   own        a model answering about its own maker unlike about every other company
//   classical  three models or more on the other side of the classical position; an
//              abstention is not a side
//
// The hub shows five, spread over the bank: the strongest finding in each area first, then the
// strongest of the rest, never more than two from one area and never two of one kind from the
// same area. A reader gets the breadth of the bank before the matrix, not five views of one war.
//
// The wording describes what the models answered (»instämmer mindre eller avstår«) and stops
// there. What that means is left to the reader and to the chart drawn under each sentence.

type FindingKind = "parallel" | "principle" | "own" | "classical";

/** A statement drawn under a finding. */
export interface FindingRow {
	question: Question;
	cells: Readonly<Record<FamilyKey, ScaleCell>>;
}

export interface Finding {
	kind: FindingKind;
	/** The area of the bank the finding comes from; the hub picks across areas and names it. */
	area: { key: string; label: string };
	/** What the finding is about, set in bold before the sentence. */
	lead: string;
	text: string;
	href: string;
	/** The statements to draw under the sentence, in the order the sentence names them. */
	rows: FindingRow[];
	/** How many models show the pattern — the count the sentence itself states, »alla fem
	 *  modellerna« against »Grok«. The front page ranks on it; the hub shows all five. */
	models: number;
	/** For a finding about the classical position: where it stands, drawn as a last row. */
	classical?: number;
}

interface Candidate {
	/** Without `models`: the candidate already carries it, and findings() writes it in once. */
	finding: Omit<Finding, "models">;
	/** How many models show the pattern. */
	models: number;
	/** How far apart the answers are: steps on the scale, an abstention counting as two. */
	width: number;
}

const SHOWN = 5;
const PER_AREA = 2;
const TOTAL = FAMILIES.length;

/** More models first; among equals, the wider gaps. */
const score = (c: Candidate) => c.models * 100 + c.width;

/** »alla fem modellerna«, »fyra av fem modeller«. */
function howMany(n: number): string {
	return n === TOTAL
		? `alla ${countWord(TOTAL)} modellerna`
		: `${countWord(n)} av ${countWord(TOTAL)} modeller`;
}

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const withheld = (cell: ScaleCell) => cell.state === "abstain" || cell.state === "refused";

/** Whether a model agreed less with `a` than with `b`: a lower position, or no position on `a`
 *  where it agreed with `b`. An abstention set against a disagreement is not »less«. */
function agreesLess(a: ScaleCell, b: ScaleCell): boolean {
	if (withheld(a)) return b.state === "position" && (b.display ?? 0) >= 1;
	return a.state === "position" && b.state === "position" && (a.display ?? 0) < (b.display ?? 0);
}

function areaOf(question: Question): Finding["area"] | null {
	const area = AREAS.find((a) => a.themes.includes(question.theme));
	return area ? { key: area.key, label: area.label } : null;
}

const isCompanySet = (row: TwinRow) => row.members.every((m) => m.question.aboutFamily);
const measured = (row: TwinRow) => row.members.every((m) => m.measured);
const anchor = (row: TwinRow, question: Question) =>
	`${questionPath(question)}#jamfor-${row.set.key}`;
const drawn = (row: TwinRow): FindingRow[] =>
	row.members.map((m) => ({ question: m.question, cells: m.cells }));

function parallelCandidate(row: TwinRow): Candidate | null {
	if (row.set.kind !== "parallel" || isCompanySet(row) || !measured(row)) return null;
	const differing = FAMILIES.filter((f) => {
		const { state } = row.byFamily[f.key];
		return state === "gap" || state === "selective";
	});
	const [a, b] = row.members;
	const area = a ? areaOf(a.question) : null;
	if (!(a && area) || differing.length < 3) return null;
	// »svarar olika beroende på om påståendet gäller X eller Y«: plain »svarar olika« read as the
	// models disagreeing with each other.
	const labels = row.members.map((m) => m.member.label);
	const either = `${labels.slice(0, -1).join(", ")} eller ${labels.at(-1)}`;
	let text = `${capitalized(howMany(differing.length))} svarar olika beroende på om påståendet gäller ${either}.`;
	if (row.members.length === 2 && b) {
		const aLess = differing.every((f) => agreesLess(a.cells[f.key], b.cells[f.key]));
		const bLess = differing.every((f) => agreesLess(b.cells[f.key], a.cells[f.key]));
		if (aLess !== bLess) {
			const [less, more] = aLess ? [a, b] : [b, a];
			text = `${capitalized(howMany(differing.length))} instämmer mindre eller avstår när påståendet gäller ${less.member.label} i stället för ${more.member.label}.`;
		}
	}
	return {
		finding: {
			kind: "parallel",
			area,
			lead: row.set.title,
			text,
			href: anchor(row, a.question),
			rows: drawn(row),
		},
		models: differing.length,
		width: differing.reduce((n, f) => n + (row.byFamily[f.key].steps ?? 2), 0),
	};
}

function principleCandidate(row: TwinRow): Candidate | null {
	const [rule, instance] = row.members;
	if (row.set.kind !== "principle" || !rule || !instance || !measured(row)) return null;
	const area = areaOf(rule.question);
	const agree = FAMILIES.filter((f) => (rule.cells[f.key].display ?? 0) >= 1);
	const less = agree.filter((f) => agreesLess(instance.cells[f.key], rule.cells[f.key]));
	if (!area || agree.length < 3 || less.length === 0) return null;
	const but =
		less.length === agree.length
			? "men instämmer mindre eller avstår"
			: `men ${countWord(less.length)} av dem instämmer mindre eller avstår`;
	return {
		finding: {
			kind: "principle",
			area,
			lead: row.set.title,
			text: `${capitalized(howMany(agree.length))} instämmer när påståendet gäller ${rule.member.label}, ${but} när det gäller ${instance.member.label}.`,
			href: anchor(row, rule.question),
			rows: drawn(row),
		},
		models: less.length,
		width: less.reduce((n, f) => {
			const ruled = rule.cells[f.key].display ?? 0;
			const cell = instance.cells[f.key];
			return n + (withheld(cell) ? 2 : ruled - (cell.display ?? 0));
		}, 0),
	};
}

/** A model that answers a statement about its own maker unlike every other company: it abstains
 *  only there, or disagrees more there than about any of the others. */
function ownCandidates(row: TwinRow): Candidate[] {
	if (row.set.kind !== "parallel" || !isCompanySet(row) || !measured(row)) return [];
	const subject = `${row.set.title.charAt(0).toLowerCase()}${row.set.title.slice(1)}`;
	return FAMILIES.flatMap((family) => {
		const own = row.members.find((m) => m.question.aboutFamily === family.key);
		const others = row.members.filter((m) => m !== own).map((m) => m.cells[family.key]);
		const area = own ? areaOf(own.question) : null;
		if (!(own && area) || others.some((c) => c.state !== "position")) return [];
		const cell = own.cells[family.key];
		const alone = withheld(cell);
		const lowest = Math.min(...others.map((c) => c.display ?? 0));
		if (!(alone || (cell.state === "position" && (cell.display ?? 0) < lowest))) return [];
		const phrases = new Set(others.map(stancePhrase));
		const [single] = phrases;
		const elsewhere =
			phrases.size === 1 && single ? single : alone ? "tar ställning" : "instämmer mer";
		return [
			{
				finding: {
					kind: "own",
					area,
					lead: "Modellens eget företag",
					text: `${family.label} ${stancePhrase(cell)} när påståendet om ${subject} gäller ${own.member.label}, men ${elsewhere} när det gäller de ${countWord(others.length)} andra företagen.`,
					href: anchor(row, own.question),
					rows: drawn(row),
				},
				models: 1,
				width: alone ? 2 : lowest - (cell.display ?? 0),
			},
		];
	});
}

/** A faith statement where three models or more take the other side of the classical position.
 *  Only a position counts: an abstention on whether God exists is not a view against it. */
function classicalCandidate({ question, measured, cells }: MatrixRow): Candidate | null {
	const position = question.classicalPosition;
	const area = areaOf(question);
	if (!(measured && area) || position === undefined || position === 0) return null;
	const against = FAMILIES.filter((f) => {
		const cell = cells[f.key];
		return cell.state === "position" && Math.sign(cell.display ?? 0) === -Math.sign(position);
	});
	if (against.length < 3) return null;
	return {
		finding: {
			kind: "classical",
			area,
			lead: question.short,
			text: `${describeRow(cells)} Den klassiska hållningen står på »${codeLabel(String(position))}«.`,
			href: `${questionPath(question)}#klassisk-hallning`,
			rows: [{ question, cells }],
			classical: position,
		},
		models: against.length,
		width: against.reduce((n, f) => n + Math.abs((cells[f.key].display ?? 0) - position), 0),
	};
}

export function findings(input: {
	twins: readonly TwinRow[];
	rows: readonly MatrixRow[];
}): Finding[] {
	// A sort is stable, so the order here is the tie-break: among equal scores a parallel set
	// comes before a principle, and the sets keep their order in twins.ts.
	const ranked = [
		...input.twins.map(parallelCandidate),
		...input.twins.map(principleCandidate),
		...input.rows.map(classicalCandidate),
		...input.twins.flatMap(ownCandidates),
	]
		.flatMap((c) => (c ? [c] : []))
		.sort((a, b) => score(b) - score(a));

	const picked: Candidate[] = [];
	const fits = (c: Candidate) => {
		const sameArea = picked.filter((p) => p.finding.area.key === c.finding.area.key);
		return (
			!picked.includes(c) &&
			sameArea.length < PER_AREA &&
			!sameArea.some((p) => p.finding.kind === c.finding.kind)
		);
	};
	for (const area of AREAS) {
		const best = ranked.find((c) => c.finding.area.key === area.key);
		if (best && picked.length < SHOWN) picked.push(best);
	}
	for (const candidate of ranked) {
		if (picked.length < SHOWN && fits(candidate)) picked.push(candidate);
	}

	// Shown in the bank's own order, the order of the matrix further down the page.
	const order = (c: Candidate) => AREAS.findIndex((a) => a.key === c.finding.area.key);
	return picked
		.sort((a, b) => order(a) - order(b) || score(b) - score(a))
		.map((c) => ({ ...c.finding, models: c.models }));
}

/** »Gemini tar ställning till 21 av 91 påståenden, Grok till 88.«, when the spread between the
 *  model that abstains most and the one that abstains least is a quarter of the bank or more. */
export function stanceSpread(shares: readonly StanceShare[]): string | null {
	const sorted = [...shares].sort((a, b) => a.taken - b.taken);
	const low = sorted[0];
	const high = sorted.at(-1);
	if (!(low && high) || high.total === 0 || (high.taken - low.taken) / high.total < 0.25)
		return null;
	return `${low.family.label} tar ställning till ${low.taken} av ${low.total} påståenden, ${high.family.label} till ${high.taken}.`;
}

/** The hub's findings for the latest answers. Shared so the front page's rail block draws from
 *  exactly the list the hub leads with; empty before the first run. */
export function latestFindings(): Finding[] {
	if (!latestRun()) return [];
	return findings({
		twins: TWIN_SETS.map(twinRow),
		rows: matrixAreas().flatMap((a) => a.groups.flatMap((g) => g.rows)),
	});
}

/** The one finding the front page shows: the widest pattern of those that are not about the
 *  classical position, ties keeping the bank's order. A classical finding sets the models against
 *  the site's own position, which the hub prints beside that question's classical note; a 17rem
 *  rail has no room for the note, and the position must never stand there without it.
 *
 *  Ranked, not taken first in order: the hub sorts by area so all five read in the matrix's own
 *  order, but that order says nothing about strength. Taking the first one left the front page
 *  introducing the whole measurement with whatever sat in the earliest area — for the 13 September
 *  run, one model on its own maker, while »alla fem modellerna« patterns waited further down. */
export function frontPageFinding(list: readonly Finding[]): Finding | null {
	return (
		[...list].filter((f) => f.kind !== "classical").sort((a, b) => b.models - a.models)[0] ?? null
	);
}
