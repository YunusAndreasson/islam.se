import latestRaw from "../../data/ai-barometern/latest.json";
import modelsRaw from "../../data/ai-barometern/models.json";
import seriesRaw from "../../data/ai-barometern/series.json";
import {
	type Change,
	cellCodes,
	type HistoryPoint,
	type PartyCell,
	partyCell,
	type ScaleCell,
	scaleCell,
	scaleChanges,
	scaleHistory,
	type TwinCell,
	twinCell,
} from "./aggregate";
import { BASELINE_NOTE } from "./catalogue";
import { FAMILIES } from "./families";
import { CODE, codeLabel } from "./options";
import { AREAS, activeQuestions, THEME_LABELS } from "./questions";
import { everyOf, stancePhrase, svJoin } from "./summary";
import type { TwinMember, TwinSet } from "./twins";
import {
	type AdoptedModel,
	type Excerpt,
	type Family,
	type FamilyKey,
	type LatestFile,
	type ModelsFile,
	type Question,
	questionKey,
	type SeenModel,
	type SeriesFile,
	type SeriesRun,
	type Theme,
} from "./types";

// What the /ai-barometern/ pages read. The pages import the derived files only through this
// module, and every reader-facing label for a cell is decided here, once.
//
// Every question shows ITS OWN latest measurement, not simply the newest run: a run may ask
// only the questions added since the last full measurement, and the others must keep showing
// the answers they have.

const SERIES = seriesRaw as unknown as SeriesFile;
const LATEST = latestRaw as unknown as LatestFile;
const MODELS = modelsRaw as unknown as ModelsFile;

export const BASE_PATH = "/ai-barometern/";
export const METHOD_PATH = "/ai-barometern/metod/";

/** The hub's section anchors, named once: the findings link to them. */
export const HUB_SECTIONS = {
	why: "varfor",
	findings: "det-har-visar-matningen",
	twins: "samma-pastaende",
	stance: "vem-tar-stallning",
	matrix: "sa-svarar-modellerna",
	party: "partivalet",
	changes: "forandringar",
	models: "modellerna",
} as const;

export function getSeries(): SeriesFile {
	return SERIES;
}

export function latestRun(): SeriesRun | null {
	return SERIES.runs.at(-1) ?? null;
}

export function latestIndex(): number {
	return SERIES.runs.length - 1;
}

/** A model family's own page: every answer it gave, gathered. */
export function modelPath(family: FamilyKey): string {
	return `${BASE_PATH}modell/${family}/`;
}

export function questionPath(q: Pick<Question, "id">): string {
	return `${BASE_PATH}${q.id}/`;
}

const DATE = new Intl.DateTimeFormat("sv-SE", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});

/** "2026-09-14" → "14 september 2026". */
export function svDate(iso: string): string {
	return DATE.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
}

/** "12 september–14 oktober 2026"; the year is written once when both ends share it. */
export function svDateRange(fromIso: string, toIso: string): string {
	const from = svDate(fromIso);
	const sameYear = fromIso.slice(0, 4) === toIso.slice(0, 4);
	return `${sameYear ? from.replace(/\s\d{4}$/, "") : from}–${svDate(toIso)}`;
}

/** "12 september 2026", "12 och 13 september 2026", "30 augusti 2026 och 6 september 2026". */
export function svDateList(isos: readonly string[]): string {
	// Two runs on one day (a full run and a --new run) are one date to a reader.
	const dates = [...new Set(isos.map((iso) => iso.slice(0, 10)))].map(svDate);
	const monthYear = (d: string) => d.replace(/^\d+\s/, "");
	const first = dates[0] ?? "";
	const sameMonth = dates.every((d) => monthYear(d) === monthYear(first));
	const items = sameMonth
		? dates.map((d, i) => (i < dates.length - 1 ? (d.split(" ")[0] ?? d) : d))
		: dates;
	return svJoin(items);
}

function perFamily<T>(fn: (family: FamilyKey) => T): Record<FamilyKey, T> {
	return Object.fromEntries(FAMILIES.map((f) => [f.key, fn(f.key)])) as Record<FamilyKey, T>;
}

/** Whether a run asked this question. */
export function askedIn(q: Question, runIndex = latestIndex()): boolean {
	return FAMILIES.some((f) => cellCodes(SERIES, questionKey(q), f.key, runIndex) !== null);
}

/** The index of the latest run that asked a question, or -1 for a question added to the
 *  bank since, which the pages mark as coming instead of drawing five empty cells. */
export function latestIndexOf(q: Question): number {
	for (let i = SERIES.runs.length - 1; i >= 0; i--) if (askedIn(q, i)) return i;
	return -1;
}

/** What the active questions show right now: how many have answers, how many answers
 *  that is, and the runs those answers come from, oldest first. */
export function shownData(): { questions: number; answers: number; runs: SeriesRun[] } {
	let questions = 0;
	let answers = 0;
	const indexes = new Set<number>();
	for (const q of activeQuestions()) {
		const index = latestIndexOf(q);
		if (index < 0) continue;
		questions += 1;
		indexes.add(index);
		for (const f of FAMILIES)
			answers += cellCodes(SERIES, questionKey(q), f.key, index)?.length ?? 0;
	}
	const runs = [...indexes].sort((a, b) => a - b).flatMap((i) => SERIES.runs[i] ?? []);
	return { questions, answers, runs };
}

/** Whether any question the newest run asked also has an earlier measurement. Without one
 *  there is nothing to compare, and the hub leaves out its changes section. */
export function hasComparison(): boolean {
	const last = latestIndex();
	return activeQuestions().some(
		(q) => askedIn(q, last) && SERIES.runs.some((_, i) => i < last && askedIn(q, i)),
	);
}

/** How many questions a run asked, retired ones included. */
export function questionCountOf(runIndex: number): number {
	return Object.values(SERIES.cells).filter((row) =>
		Object.values(row).some((samples) => samples?.[runIndex]),
	).length;
}

// ── cell labels ───────────────────────────────────────────────────────────────────────

const SCALE_GLYPH: Record<string, string> = {
	"2": "++",
	"1": "+",
	"0": "0",
	"-1": "−",
	"-2": "−−",
};

/** The short mark inside a matrix chip. Colour is never the only carrier of a position. */
export function cellGlyph(cell: ScaleCell): string {
	if (cell.state === "position") return SCALE_GLYPH[String(cell.display)] ?? "";
	if (cell.state === "abstain") return "A";
	if (cell.state === "refused") return "×";
	if (cell.state === "split") return "±";
	return "";
}

export function cellLabel(cell: ScaleCell): string {
	if (cell.state === "position") return codeLabel(String(cell.display));
	if (cell.state === "abstain") return "Avstår";
	if (cell.state === "refused") return "Vägrar svara";
	if (cell.state === "split") return "Splittrad";
	return "Inget svar";
}

/** Full sentence for a cell: tooltip and screen readers. */
export function cellTitle(familyLabel: string, cell: ScaleCell): string {
	const n = cell.codes.length;
	if (n === 0) return `${familyLabel}: inget svar`;
	const agreement = cell.consistent ? `samma svar alla ${n} gånger` : `${n} svar som skilde sig åt`;
	return `${familyLabel}: ${cellLabel(cell)} (${agreement})`;
}

export interface LegendItem {
	state: ScaleCell["state"];
	v?: number;
	glyph: string;
	label: string;
}

export const SCALE_LEGEND: readonly LegendItem[] = [
	{ state: "position", v: -2, glyph: "−−", label: "Tar helt avstånd" },
	{ state: "position", v: -1, glyph: "−", label: "Tar delvis avstånd" },
	{ state: "position", v: 0, glyph: "0", label: "Varken eller" },
	{ state: "position", v: 1, glyph: "+", label: "Instämmer delvis" },
	{ state: "position", v: 2, glyph: "++", label: "Instämmer helt" },
	{ state: "abstain", glyph: "A", label: "Avstår" },
	{ state: "split", glyph: "±", label: "Splittrad" },
	{ state: "refused", glyph: "×", label: "Vägrar svara" },
];

// ── overview ──────────────────────────────────────────────────────────────────────────

export interface MatrixRow {
	question: Question;
	/** False for a question no run has asked yet: the matrix prints one »not yet« cell. */
	measured: boolean;
	cells: Record<FamilyKey, ScaleCell>;
}

export interface MatrixGroup {
	theme: Theme;
	label: string;
	rows: MatrixRow[];
}

export interface MatrixArea {
	/** The anchor of the area's heading. */
	key: string;
	label: string;
	groups: MatrixGroup[];
}

/** The matrix, area by area and theme by theme. A theme with no scale question (the party
 *  questions have their own chart) is left out, and so is an area left empty by that. */
export function matrixAreas(): MatrixArea[] {
	const scale = activeQuestions().filter((q) => q.kind === "scale");
	const groupOf = (theme: Theme): MatrixGroup => ({
		theme,
		label: THEME_LABELS[theme],
		rows: scale
			.filter((q) => q.theme === theme)
			.map((question) => {
				const index = latestIndexOf(question);
				return { question, measured: index >= 0, cells: scaleRow(question, index) };
			}),
	});
	return AREAS.map((area) => ({
		key: area.key,
		label: area.label,
		groups: area.themes.map(groupOf).filter((group) => group.rows.length > 0),
	})).filter((area) => area.groups.length > 0);
}

/** How many of these rows a model took a position on. Abstention is the most visible pattern in
 *  the matrix, and it differs by model and by area. */
export function positionsTaken(rows: readonly MatrixRow[], family: FamilyKey): number {
	return rows.filter((r) => r.measured && r.cells[family].state === "position").length;
}

export interface StanceShare {
	family: Family;
	areas: { key: string; label: string; taken: number; total: number }[];
	taken: number;
	total: number;
}

/** Per model: positions taken out of the statements measured, area by area and in all. */
export function stanceShares(areas: readonly MatrixArea[]): StanceShare[] {
	return FAMILIES.map((family) => {
		const perArea = areas.map((area) => {
			const rows = area.groups.flatMap((g) => g.rows.filter((r) => r.measured));
			return {
				key: area.key,
				label: area.label,
				taken: positionsTaken(rows, family.key),
				total: rows.length,
			};
		});
		return {
			family,
			areas: perArea,
			taken: perArea.reduce((n, a) => n + a.taken, 0),
			total: perArea.reduce((n, a) => n + a.total, 0),
		};
	});
}

export interface PartyRow {
	question: Question;
	cells: Record<FamilyKey, PartyCell>;
}

export function partyRows(): PartyRow[] {
	return activeQuestions()
		.filter((q) => q.kind === "party")
		.map((question) => {
			const index = latestIndexOf(question);
			return {
				question,
				cells: perFamily((f) => partyCell(cellCodes(SERIES, questionKey(question), f, index))),
			};
		});
}

export interface PartyChip {
	text: string;
	title: string;
	modal: boolean;
	none: boolean;
}

export function partyChips(cell: PartyCell): PartyChip[] {
	const n = cell.codes.length;
	const chips: PartyChip[] = cell.counts.map(([code, count]) => ({
		text: code === CODE.otherParty ? "Annat" : code,
		title: `${codeLabel(code)}, ${count} av ${n} svar`,
		modal: code === cell.modal,
		none: false,
	}));
	for (const [code, text] of [
		[CODE.abstain, "Avstår"],
		[CODE.refused, "Vägrar"],
	] as const) {
		const count = cell.codes.filter((c) => c === code).length;
		if (count > 0)
			chips.push({ text, title: `${text}, ${count} av ${n} svar`, modal: false, none: true });
	}
	return chips;
}

/** The line under a party cell. It always counts, because a cell can hold a named party
 *  beside a majority of »Avstår«, and a flat »ville inte rekommendera något parti« under a
 *  visible »V« contradicts the chip above it. */
export function partyNote(cell: PartyCell): string {
	const n = cell.codes.length;
	const count = (code: string) => cell.codes.filter((c) => c === code).length;
	if (cell.state === "missing") return "Inget svar";
	if (cell.modal) return `${count(cell.modal)} av ${n} svar`;
	if (cell.state === "abstain") return `Avstod i ${count(CODE.abstain)} av ${n} svar`;
	if (cell.state === "refused") return `Vägrade i ${count(CODE.refused)} av ${n} svar`;
	return "Olika partier vid olika tillfällen";
}

// ── question page ─────────────────────────────────────────────────────────────────────

export function scaleRow(q: Question, runIndex = latestIndexOf(q)): Record<FamilyKey, ScaleCell> {
	return perFamily((f) => scaleCell(cellCodes(SERIES, questionKey(q), f, runIndex)));
}

export function historyOf(q: Question): { family: Family; points: HistoryPoint[] }[] {
	return FAMILIES.map((family) => ({
		family,
		points: scaleHistory(SERIES, questionKey(q), family.key),
	}));
}

export function partyHistory(
	q: Question,
): { run: SeriesRun; cells: Record<FamilyKey, PartyCell> }[] {
	const key = questionKey(q);
	return SERIES.runs
		.map((run, index) => ({
			run,
			cells: perFamily((f) => partyCell(cellCodes(SERIES, key, f, index))),
		}))
		.filter((row) => FAMILIES.some((f) => row.cells[f.key].state !== "missing"));
}

/** The excerpt to quote for a cell: one whose sample gave the answer the chart shows. The
 *  others go behind a disclosure. A split cell gets no lead quote. */
export function excerptsOf(
	q: Question,
	family: FamilyKey,
	shownCode: string | null,
): { lead: Excerpt | null; rest: Excerpt[] } {
	const all = LATEST.excerpts[questionKey(q)]?.[family] ?? [];
	const lead = (shownCode ? all.find((e) => e.code === shownCode) : undefined) ?? null;
	return { lead, rest: all.filter((e) => e !== lead) };
}

export function shownScaleCode(cell: ScaleCell): string | null {
	if (cell.state === "position") return String(cell.display);
	if (cell.state === "abstain") return CODE.abstain;
	return null;
}

export function shownPartyCode(cell: PartyCell): string | null {
	if (cell.modal) return cell.modal;
	return cell.state === "abstain" ? CODE.abstain : null;
}

// ── twin sets ───────────────────────────────────────────────────────────────────────

export interface TwinRow {
	set: TwinSet;
	members: {
		member: TwinMember;
		question: Question;
		measured: boolean;
		cells: Record<FamilyKey, ScaleCell>;
	}[];
	byFamily: Record<FamilyKey, TwinCell>;
	/** The runs the members' answers come from, oldest first. */
	runs: SeriesRun[];
}

export function twinRow(set: TwinSet): TwinRow {
	const byId = new Map(activeQuestions().map((q) => [q.id, q]));
	const indexes = new Set<number>();
	const members = set.members.map((member) => {
		const question = byId.get(member.id);
		if (!question) throw new Error(`Twin set ${set.key}: ${member.id} is not an active question`);
		const index = latestIndexOf(question);
		if (index >= 0) indexes.add(index);
		return { member, question, measured: index >= 0, cells: scaleRow(question, index) };
	});
	return {
		set,
		members,
		byFamily: perFamily((f) => twinCell(members.map((m) => m.cells[f]))),
		runs: [...indexes].sort((a, b) => a - b).flatMap((i) => SERIES.runs[i] ?? []),
	};
}

export interface TwinLine {
	/** A model, or several that answered alike. */
	who: string;
	parts: string[];
}

/** The lines under a twin chart. A model that answered the members differently gets a line of
 *  its own, »Claude – Netanyahu: avstår; Putin: instämmer helt«, and comes first; models that
 *  answered every member alike share one line. Nothing until every member has been asked. */
export function twinLines(row: TwinRow): TwinLine[] {
	if (row.members.some((m) => !m.measured)) return [];
	const every = everyOf(row.members.length);
	const differing: TwinLine[] = [];
	const alike = new Map<string, string[]>();
	for (const family of FAMILIES) {
		const phrases = row.members.map((m) => stancePhrase(m.cells[family.key]) ?? "inget svar");
		const { state } = row.byFamily[family.key];
		if (state === "same" || state === "silent") {
			const part =
				new Set(phrases).size === 1
					? `samma svar om ${every}: ${phrases[0]}`
					: `ingen ställning om ${every}`;
			alike.set(part, [...(alike.get(part) ?? []), family.label]);
			continue;
		}
		differing.push({ who: family.label, parts: familyTwinParts(row, family.key) });
	}
	return [
		...differing,
		...[...alike].map(([part, names]) => ({ who: svJoin(names), parts: [part] })),
	];
}

/** One model's answers across a twin set, grouped by answer: »Netanyahu: avstår«, »Putin:
 *  instämmer helt«. */
export function familyTwinParts(row: TwinRow, family: FamilyKey): string[] {
	const groups = new Map<string, string[]>();
	for (const m of row.members) {
		const phrase = stancePhrase(m.cells[family]) ?? "inget svar";
		groups.set(phrase, [...(groups.get(phrase) ?? []), m.member.label]);
	}
	return [...groups].map(([phrase, labels]) => `${svJoin(labels)}: ${phrase}`);
}

// ── changes and models ────────────────────────────────────────────────────────────────

export function topChanges(limit: number): (Change & { question: Question })[] {
	const byKey = new Map(activeQuestions().map((q) => [questionKey(q), q]));
	return scaleChanges(SERIES, [...byKey.keys()])
		.slice(0, limit)
		.flatMap((c) => {
			const question = byKey.get(c.qKey);
			return question ? [{ ...c, question }] : [];
		});
}

export function roster(): {
	family: Family;
	current: AdoptedModel | null;
	history: AdoptedModel[];
}[] {
	return FAMILIES.map((family) => {
		const slot = MODELS.families[family.key];
		const current = slot.history.find((h) => h.id === slot.current) ?? null;
		return { family, current, history: slot.history };
	});
}

/** Releases seen since the barometer started, newest first. */
export function releaseLog(): SeenModel[] {
	return MODELS.seen
		.filter((s) => s.note !== BASELINE_NOTE && s.decision !== "pending")
		.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.id.localeCompare(b.id));
}

/** One family's models before the current one, newest first, and the releases it passed over.
 *  The roster carries these per family: a flat release log grows by a dozen near-identical
 *  rows a month, most of them premium tiers and image models nobody asked about. */
export function familyReleases(key: FamilyKey): { previous: AdoptedModel[]; passed: SeenModel[] } {
	const slot = MODELS.families[key];
	return {
		previous: slot.history.filter((h) => h.id !== slot.current).reverse(),
		passed: releaseLog().filter((s) => s.family === key && s.decision === "ignored"),
	};
}

export interface FamilyShift {
	family: Family;
	fromModel: string;
	toModel: string;
	switched: boolean;
	/** Statements the newest run asked that this family had answered before. */
	compared: number;
	/** Of those, a position before and a different position now. */
	moved: number;
	/** Positions taken on the compared statements, before and now: the move into or out of
	 *  »Avstår« that `moved` cannot see. */
	takenBefore: number;
	takenNow: number;
}

/** What each family's answers did since its previous measurement, and the dates of the runs
 *  compared against. Same rule as `scaleChanges`: each statement against its own previous
 *  measurement. A family that switched model is flagged, because its shift is then two models
 *  compared, not one model moving. */
export function familyShifts(): { rows: FamilyShift[]; since: string[] } {
	const last = latestIndex();
	const curRun = SERIES.runs[last];
	if (!curRun) return { rows: [], since: [] };
	const sinceRuns = new Set<number>();
	const qKeys = activeQuestions()
		.filter((q) => q.kind === "scale")
		.map(questionKey);
	const rows = FAMILIES.map((family) => {
		let compared = 0;
		let moved = 0;
		let takenBefore = 0;
		let takenNow = 0;
		let prevModel: string | null = null;
		for (const qKey of qKeys) {
			const asked = SERIES.runs.flatMap((_, i) =>
				cellCodes(SERIES, qKey, family.key, i) ? [i] : [],
			);
			const cur = asked.at(-1);
			const prev = asked.at(-2);
			if (cur !== last || prev === undefined) continue;
			const a = scaleCell(cellCodes(SERIES, qKey, family.key, prev));
			const b = scaleCell(cellCodes(SERIES, qKey, family.key, cur));
			compared += 1;
			sinceRuns.add(prev);
			if (a.display !== null) takenBefore += 1;
			if (b.display !== null) takenNow += 1;
			if (a.display !== null && b.display !== null && a.display !== b.display) moved += 1;
			prevModel ??= SERIES.runs[prev]?.models[family.key].name ?? null;
		}
		const toModel = curRun.models[family.key].name;
		const fromModel = prevModel ?? toModel;
		return {
			family,
			fromModel,
			toModel,
			switched: fromModel !== toModel,
			compared,
			moved,
			takenBefore,
			takenNow,
		};
	});
	const since = [...sinceRuns].sort((x, y) => x - y).flatMap((i) => SERIES.runs[i]?.date ?? []);
	return { rows, since };
}

/** OpenRouter names carry the vendor ("OpenAI: GPT-5.6 Sol"); the family label beside the
 *  name already says it, so pages show "GPT-5.6 Sol". */
export function modelShortName(name: string): string {
	return name.replace(/^[^:]{1,40}:\s*/, "");
}

export function familyLabel(key: FamilyKey): string {
	return FAMILIES.find((f) => f.key === key)?.label ?? key;
}
