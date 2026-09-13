import { describe, expect, it } from "vitest";
import { passesGate } from "./gate";
import { POLLS } from "./opinion";
import { activeQuestions } from "./questions";

// Survey figures printed beside the models' answers. A figure that does not add up, or a survey
// question shown as if it were ours when it is not, misinforms the reader the section is for.

const active = new Map(activeQuestions().map((q) => [q.id, q]));

describe("survey figures", () => {
	it("belong to active scale statements", () => {
		const wrong = POLLS.flatMap((p) =>
			p.questionIds
				.filter((id) => active.get(id)?.kind !== "scale")
				.map((id) => `${p.pollster}: ${id}`),
		);
		expect(wrong).toEqual([]);
	});

	it("add up to a whole, with every category placed against the statement", () => {
		const wrong = POLLS.flatMap((p) => {
			const total = p.shares.reduce((n, s) => n + s.percent, 0);
			const out = total < 98 || total > 102 ? [`${p.pollster}: shares sum to ${total}`] : [];
			if (p.shares.length < 2) out.push(`${p.pollster}: a bar needs at least two categories`);
			for (const share of p.shares)
				if (![-2, -1, 0, 1, 2, null].includes(share.v))
					out.push(`${p.pollster}: ${share.label} has no place`);
			return out;
		});
		expect(wrong).toEqual([]);
	});

	it("say how a survey question differs from the statement it stands beside", () => {
		expect(POLLS.filter((p) => p.match === "close" && !p.note).map((p) => p.pollster)).toEqual([]);
	});

	it("link the survey itself and print copy the site could print", () => {
		const wrong = POLLS.flatMap((p) => {
			const out = p.url.startsWith("https://") ? [] : [`${p.pollster}: url must be https`];
			for (const text of [p.pollster, p.wording, p.note ?? "", ...p.shares.map((s) => s.label)]) {
				if (text.includes("—")) out.push(`${p.pollster}: em dash in »${text}«`);
				if (!passesGate(text)) out.push(`${p.pollster}: gate word in »${text}«`);
			}
			return out;
		});
		expect(wrong).toEqual([]);
	});
});
