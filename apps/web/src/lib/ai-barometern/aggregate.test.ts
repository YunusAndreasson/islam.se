import { describe, expect, it } from "vitest";
import { partyCell, scaleCell, scaleChanges, scaleHistory, twinCell } from "./aggregate";
import { FAMILY_KEYS } from "./families";
import type { AnswerCode, FamilyKey, SeriesFile } from "./types";

// Every chart on /ai-barometern/ reads its cells through these functions. The properties
// below are the promises the method page makes to the reader, checked over every possible
// three-sample cell rather than a handful of examples.

const CODES: AnswerCode[] = ["2", "1", "0", "-1", "-2", "avstar", "vagrar", "fel"];
const TRIPLES: AnswerCode[][] = CODES.flatMap((a) =>
	CODES.flatMap((b) => CODES.map((c) => [a, b, c])),
);
const negate = (c: AnswerCode) => (/^-?[0-2]$/.test(c) ? String(-Number(c) + 0) : c);

describe("a scale cell", () => {
	it("reads the same whatever order its samples arrived in", () => {
		const unstable = TRIPLES.filter(([a = "", b = "", c = ""]) => {
			const x = scaleCell([a, b, c]);
			const y = scaleCell([c, a, b]);
			return x.display !== y.display || x.state !== y.state;
		});
		expect(unstable).toEqual([]);
	});

	it("is symmetric: flipping every sample flips the shown position", () => {
		const asymmetric = TRIPLES.filter((t) => {
			const x = scaleCell(t);
			const y = scaleCell(t.map(negate));
			return (
				x.state !== y.state || (x.display === null ? y.display !== null : y.display !== -x.display)
			);
		});
		expect(asymmetric).toEqual([]);
	});

	it("never shows a position stronger or weaker than every sample", () => {
		const outside = TRIPLES.filter((t) => {
			const cell = scaleCell(t);
			if (cell.display === null) return false;
			return cell.display < Math.min(...cell.values) || cell.display > Math.max(...cell.values);
		});
		expect(outside).toEqual([]);
	});

	it("shows a position only when most valid samples take one", () => {
		expect(scaleCell(["2", "2", "avstar"])).toMatchObject({ state: "position", display: 2 });
		expect(scaleCell(["2", "avstar", "avstar"])).toMatchObject({ state: "abstain", display: null });
		expect(scaleCell(["vagrar", "vagrar", "avstar"]).state).toBe("refused");
		// Two of three samples took no position, one by choice and one by refusal: no position.
		expect(scaleCell(["2", "avstar", "vagrar"]).state).toBe("abstain");
		expect(scaleCell(["2", "-1", "avstar"]).state).toBe("split");
		expect(scaleCell(["fel", "fel", "-1"])).toMatchObject({ state: "position", display: -1 });
		expect(scaleCell(["fel", "fel", "fel"]).state).toBe("missing");
		expect(scaleCell(null).state).toBe("missing");
	});

	it("reports a model that contradicts itself as split, not as a calm middle", () => {
		// The median of 2, 0 and −2 is 0 – »Varken eller« – which would misreport it.
		expect(scaleCell(["2", "0", "-2"])).toMatchObject({ state: "split", display: null });
		expect(scaleCell(["2", "-2", "avstar"]).state).toBe("split");
		expect(scaleCell(["1", "1", "-1"])).toMatchObject({ state: "position", display: 1 });
	});

	it("rounds an even split towards the weaker claim", () => {
		expect(scaleCell(["1", "2"]).display).toBe(1);
		expect(scaleCell(["-2", "-1", "fel"]).display).toBe(-1);
	});

	it("marks identical samples as consistent", () => {
		expect(scaleCell(["1", "1", "1"])).toMatchObject({ consistent: true, spread: 0 });
		expect(scaleCell(["1", "1", "2"])).toMatchObject({ consistent: false, spread: 1 });
	});
});

describe("a model's answers to a twin set", () => {
	// One pattern per model across statements that differ only in whom they concern. Checked over
	// every pair and triple of the cell kinds a run produces.
	const KINDS: AnswerCode[][] = [
		["2", "2", "2"],
		["1", "1", "1"],
		["0", "0", "0"],
		["-1", "-1", "-1"],
		["-2", "-2", "-2"],
		["avstar", "avstar", "avstar"],
		["vagrar", "vagrar", "vagrar"],
		["2", "-2", "0"],
		[],
	];
	const SETS: AnswerCode[][][] = [
		...KINDS.flatMap((a) => KINDS.map((b) => [a, b])),
		...KINDS.flatMap((a) => KINDS.flatMap((b) => KINDS.map((c) => [a, b, c]))),
	];
	const read = (set: AnswerCode[][]) => twinCell(set.map(scaleCell));

	it("reads the same whatever order the statements come in", () => {
		const unstable = SETS.filter((set) => {
			const x = read(set);
			const y = read([...set].reverse());
			return x.state !== y.state || x.steps !== y.steps;
		});
		expect(unstable).toEqual([]);
	});

	it("reads the same when every answer is flipped", () => {
		const asymmetric = SETS.filter((set) => {
			const x = read(set);
			const y = read(set.map((codes) => codes.map(negate)));
			return x.state !== y.state || x.steps !== y.steps;
		});
		expect(asymmetric).toEqual([]);
	});

	it("measures a gap only between positions, and within the scale", () => {
		const outside = SETS.filter((set) => {
			const { state, steps } = read(set);
			if (state === "same") return steps !== 0;
			if (state === "gap") return steps === null || steps < 1 || steps > 4;
			return steps !== null;
		});
		expect(outside).toEqual([]);
	});

	it("calls a model selective exactly when it answers some statements and withholds on others", () => {
		const wrong = SETS.filter((set) => {
			const cells = set.map(scaleCell);
			const readable = cells.every((c) => c.state !== "split" && c.state !== "missing");
			const positioned = cells.some((c) => c.state === "position");
			const withheld = cells.some((c) => c.state === "abstain" || c.state === "refused");
			return (read(set).state === "selective") !== (readable && positioned && withheld);
		});
		expect(wrong).toEqual([]);
	});

	it("counts an abstention as part of the pattern", () => {
		// Claude abstained on arresting Netanyahu and agreed fully with arresting Putin
		// (2026-09-13). Reading positions only, that model looked consistent.
		expect(
			read([
				["avstar", "avstar", "avstar"],
				["2", "2", "2"],
			]).state,
		).toBe("selective");
		expect(
			read([
				["1", "1", "1"],
				["-2", "-2", "-2"],
			]),
		).toEqual({ state: "gap", steps: 3 });
		expect(
			read([
				["avstar", "avstar", "avstar"],
				["vagrar", "vagrar", "vagrar"],
			]).state,
		).toBe("silent");
	});
});

describe("a party cell", () => {
	it("names a party only when a majority of valid samples chose it", () => {
		expect(partyCell(["S", "S", "M"])).toMatchObject({ modal: "S", state: "position" });
		expect(partyCell(["S", "M", "SD"])).toMatchObject({ modal: null, state: "split" });
		expect(partyCell(["S", "fel", "fel"])).toMatchObject({ modal: "S", state: "position" });
		expect(partyCell(["avstar", "avstar", "S"])).toMatchObject({ modal: null, state: "abstain" });
		expect(partyCell(["vagrar", "vagrar", "avstar"]).state).toBe("refused");
	});

	it("counts every party chosen, most chosen first", () => {
		expect(partyCell(["M", "S", "M"]).counts).toEqual([
			["M", 2],
			["S", 1],
		]);
	});
});

function seriesOf(runs: { id: string; grok: string; cell: AnswerCode[] | null }[]): SeriesFile {
	const models = (grok: string) =>
		Object.fromEntries(
			FAMILY_KEYS.map((k) => [
				k,
				{
					id: k === "grok" ? grok : `${k}/model`,
					name: k === "grok" ? grok : k,
					knowledgeCutoff: null,
				},
			]),
		) as Record<FamilyKey, { id: string; name: string; knowledgeCutoff: string | null }>;
	return {
		schemaVersion: 1,
		runs: runs.map((r) => ({
			id: r.id,
			date: r.id,
			variant: "A",
			samples: 3,
			answers: 0,
			costUsd: 0,
			models: models(r.grok),
		})),
		cells: { "q@1": { grok: runs.map((r) => r.cell) } },
	};
}

describe("change between runs", () => {
	it("calls a shift significant only when the sample ranges do not overlap", () => {
		const big = seriesOf([
			{ id: "2026-09-14", grok: "x-ai/grok-4.6", cell: ["1", "1", "1"] },
			{ id: "2026-09-21", grok: "x-ai/grok-4.6", cell: ["-1", "-1", "-2"] },
		]);
		expect(scaleChanges(big, ["q@1"])).toMatchObject([
			{ family: "grok", from: 1, to: -1, delta: -2, significant: true, modelChanged: false },
		]);

		const noise = seriesOf([
			{ id: "2026-09-14", grok: "x-ai/grok-4.6", cell: ["1", "1", "0"] },
			{ id: "2026-09-21", grok: "x-ai/grok-4.6", cell: ["0", "0", "1"] },
		]);
		expect(scaleChanges(noise, ["q@1"])).toMatchObject([{ delta: -1, significant: false }]);
	});

	it("attributes a shift that coincides with a model switch", () => {
		const switched = seriesOf([
			{ id: "2026-09-14", grok: "x-ai/grok-4.6", cell: ["2", "2", "2"] },
			{ id: "2026-09-21", grok: "x-ai/grok-5", cell: ["0", "0", "0"] },
		]);
		expect(scaleChanges(switched, ["q@1"])[0]).toMatchObject({
			modelChanged: true,
			fromModel: "x-ai/grok-4.6",
			toModel: "x-ai/grok-5",
		});
	});

	it("compares a question with its own previous measurement, across a run that skipped it", () => {
		const series = seriesOf([
			{ id: "2026-09-14", grok: "x-ai/grok-4.6", cell: ["2", "2", "2"] },
			{ id: "2026-09-15", grok: "x-ai/grok-4.6", cell: null },
			{ id: "2026-09-21", grok: "x-ai/grok-4.6", cell: ["-1", "-1", "-1"] },
		]);
		expect(scaleChanges(series, ["q@1"])).toMatchObject([{ from: 2, to: -1, significant: true }]);
	});

	it("reports no change for a question the newest run did not ask", () => {
		// A run of only newly added questions must not present an older question's last shift
		// as a change »since the previous measurement«.
		const series = seriesOf([
			{ id: "2026-09-14", grok: "x-ai/grok-4.6", cell: ["2", "2", "2"] },
			{ id: "2026-09-21", grok: "x-ai/grok-4.6", cell: ["-1", "-1", "-1"] },
			{ id: "2026-09-22", grok: "x-ai/grok-4.6", cell: null },
		]);
		expect(scaleChanges(series, ["q@1"])).toEqual([]);
	});

	it("follows a question's history, skipping runs where it was not asked", () => {
		const series = seriesOf([
			{ id: "2026-09-07", grok: "x-ai/grok-4.6", cell: null },
			{ id: "2026-09-14", grok: "x-ai/grok-4.6", cell: ["1", "1", "1"] },
			{ id: "2026-09-21", grok: "x-ai/grok-5", cell: ["2", "2", "1"] },
		]);
		expect(
			scaleHistory(series, "q@1", "grok").map((p) => [p.runId, p.cell.display, p.switched]),
		).toEqual([
			["2026-09-14", 1, false],
			["2026-09-21", 2, true],
		]);
	});
});
