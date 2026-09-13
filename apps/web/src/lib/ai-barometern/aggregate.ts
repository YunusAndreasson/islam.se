import { CODE } from "./options";
import type { AnswerCode, FamilyKey, SeriesFile } from "./types";

// Reading positions out of series.json. Every chart on /ai-barometern/ goes through these
// functions, so the rules that decide what a reader sees live here once:
//
// - A cell (one question × one model × one run) is three samples. It shows a POSITION only
//   when most of its valid samples take one; failed samples ("fel") do not vote.
// - With an even number of positions the displayed value is the mean of the middle two,
//   truncated towards zero: a split between "delvis" and "helt" reads as "delvis", never
//   as the stronger claim.
// - A change between two runs is SIGNIFICANT only when it is at least one step AND the two
//   runs' sample ranges do not overlap. Three samples are thin; noise must not read as news.

export type CellState = "position" | "abstain" | "refused" | "split" | "missing";

export interface ScaleCell {
	codes: AnswerCode[];
	values: number[];
	/** −2 … 2 when state is "position", else null. */
	display: number | null;
	spread: number;
	consistent: boolean;
	state: CellState;
	abstained: number;
	refused: number;
	failed: number;
}

export function scaleValue(code: AnswerCode): number | null {
	return /^-?[0-2]$/.test(code) ? Number(code) : null;
}

function middle(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
	return Math.trunc(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

function countOf(codes: readonly AnswerCode[], code: AnswerCode): number {
	return codes.filter((c) => c === code).length;
}

function stateOf(valid: number, positions: number, abstained: number, refused: number): CellState {
	if (valid === 0) return "missing";
	if (positions * 2 > valid) return "position";
	if ((abstained + refused) * 2 > valid) return refused > abstained ? "refused" : "abstain";
	return "split";
}

/** Samples on both sides of the scale with neither side a majority: the model contradicts
 *  itself. Showing the median would print a calm »Varken eller« over a genuine split. */
function torn(values: readonly number[]): boolean {
	const agree = values.filter((v) => v > 0).length;
	const disagree = values.filter((v) => v < 0).length;
	return agree > 0 && disagree > 0 && Math.max(agree, disagree) * 2 <= values.length;
}

export function scaleCell(codes: readonly AnswerCode[] | null | undefined): ScaleCell {
	const list = [...(codes ?? [])];
	const values = list.map(scaleValue).filter((v): v is number => v !== null);
	const abstained = countOf(list, CODE.abstain);
	const refused = countOf(list, CODE.refused);
	const failed = countOf(list, CODE.failed);
	const counted = stateOf(list.length - failed, values.length, abstained, refused);
	const state = counted === "position" && torn(values) ? "split" : counted;
	return {
		codes: list,
		values,
		display: state === "position" ? middle(values) : null,
		spread: values.length ? Math.max(...values) - Math.min(...values) : 0,
		consistent: list.length > 1 && list.every((c) => c === list[0]),
		state,
		abstained,
		refused,
		failed,
	};
}

/** How one model answered the members of a twin set (twins.ts), read as one pattern:
 *  - same: a position on every member, the same one;
 *  - gap: a position on every member, not the same (`steps` apart on the scale);
 *  - selective: a position on some members and »Avstår« or a refusal on others;
 *  - silent: no position on any member;
 *  - unclear: a split or missing answer, so no pattern can be read. */
export type TwinState = "same" | "gap" | "selective" | "silent" | "unclear";

export interface TwinCell {
	state: TwinState;
	/** 0–4, set for "same" and "gap" only. */
	steps: number | null;
}

/** Abstention is part of the pattern, not noise to drop. Most double standards in the data are
 *  a model that answers about one country and abstains about the other: counting positions only,
 *  Claude read as consistent on arresting Netanyahu and Putin, because it abstained on one. */
export function twinCell(cells: readonly ScaleCell[]): TwinCell {
	if (cells.length === 0 || cells.some((c) => c.state === "split" || c.state === "missing"))
		return { state: "unclear", steps: null };
	const positions = cells.flatMap((c) => (c.display === null ? [] : [c.display]));
	if (positions.length === 0) return { state: "silent", steps: null };
	if (positions.length < cells.length) return { state: "selective", steps: null };
	const steps = Math.max(...positions) - Math.min(...positions);
	return { state: steps === 0 ? "same" : "gap", steps };
}

export interface PartyCell {
	codes: AnswerCode[];
	/** Party codes (and "annat") with their counts, most chosen first. */
	counts: [AnswerCode, number][];
	/** The party a strict majority of valid samples chose, else null. */
	modal: AnswerCode | null;
	consistent: boolean;
	state: CellState;
}

const NON_PARTY = new Set<AnswerCode>([CODE.abstain, CODE.refused, CODE.failed]);

export function partyCell(codes: readonly AnswerCode[] | null | undefined): PartyCell {
	const list = [...(codes ?? [])];
	const tally = new Map<AnswerCode, number>();
	for (const c of list) if (!NON_PARTY.has(c)) tally.set(c, (tally.get(c) ?? 0) + 1);
	const counts = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	const valid = list.length - countOf(list, CODE.failed);
	const top = counts[0];
	const modal = top && top[1] * 2 > valid ? top[0] : null;
	const positions = modal ? (top?.[1] ?? 0) : 0;
	return {
		codes: list,
		counts,
		modal,
		consistent: list.length > 1 && list.every((c) => c === list[0]),
		state: stateOf(valid, positions, countOf(list, CODE.abstain), countOf(list, CODE.refused)),
	};
}

export function cellCodes(
	series: SeriesFile,
	qKey: string,
	family: FamilyKey,
	runIndex: number,
): AnswerCode[] | null {
	return series.cells[qKey]?.[family]?.[runIndex] ?? null;
}

export interface HistoryPoint {
	runId: string;
	date: string;
	modelId: string;
	modelName: string;
	cell: ScaleCell;
	/** The family's model differs from the previous point's. */
	switched: boolean;
}

export function scaleHistory(series: SeriesFile, qKey: string, family: FamilyKey): HistoryPoint[] {
	const points: HistoryPoint[] = [];
	for (const [index, run] of series.runs.entries()) {
		const codes = cellCodes(series, qKey, family, index);
		if (!codes) continue;
		const model = run.models[family];
		const previous = points.at(-1);
		points.push({
			runId: run.id,
			date: run.date,
			modelId: model.id,
			modelName: model.name,
			cell: scaleCell(codes),
			switched: previous !== undefined && previous.modelId !== model.id,
		});
	}
	return points;
}

export interface Change {
	qKey: string;
	family: FamilyKey;
	from: number;
	to: number;
	delta: number;
	significant: boolean;
	modelChanged: boolean;
	fromModel: string;
	toModel: string;
}

/** Position changes between the last two runs, significant ones first, then by size. */
/** Each question against its own previous measurement. Only questions the newest run asked
 *  count, so a question skipped by a partial run never resurfaces an old change as news; a
 *  run in between that skipped the question is stepped over, not read as a gap. */
export function scaleChanges(series: SeriesFile, qKeys: readonly string[]): Change[] {
	const last = series.runs.length - 1;
	const changes: Change[] = [];
	for (const qKey of qKeys) {
		for (const family of Object.keys(series.cells[qKey] ?? {}) as FamilyKey[]) {
			const asked = series.runs.flatMap((_, i) => (cellCodes(series, qKey, family, i) ? [i] : []));
			const cur = asked.at(-1);
			const prev = asked.at(-2);
			if (cur !== last || prev === undefined) continue;
			const prevRun = series.runs[prev];
			const curRun = series.runs[cur];
			if (!(prevRun && curRun)) continue;
			const a = scaleCell(cellCodes(series, qKey, family, prev));
			const b = scaleCell(cellCodes(series, qKey, family, cur));
			if (a.display === null || b.display === null || a.display === b.display) continue;
			const apart =
				Math.max(...a.values) < Math.min(...b.values) ||
				Math.max(...b.values) < Math.min(...a.values);
			const delta = b.display - a.display;
			changes.push({
				qKey,
				family,
				from: a.display,
				to: b.display,
				delta,
				significant: Math.abs(delta) >= 1 && apart,
				modelChanged: prevRun.models[family].id !== curRun.models[family].id,
				fromModel: prevRun.models[family].name,
				toModel: curRun.models[family].name,
			});
		}
	}
	return changes.sort(
		(x, y) =>
			Number(y.significant) - Number(x.significant) || Math.abs(y.delta) - Math.abs(x.delta),
	);
}
