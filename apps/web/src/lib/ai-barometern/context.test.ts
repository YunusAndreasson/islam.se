import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BACKGROUND, READ_MORE } from "./context";
import { passesGate } from "./gate";
import { activeQuestions } from "./questions";
import { TWIN_SETS } from "./twins";
import type { Theme } from "./types";

// »Läs mer på islam.se« under a question. The build fails on an unknown slug (requireBySlug in
// [fraga].astro); these tests say so earlier, and hold the one editorial line the links must keep.

const DATA = fileURLToPath(new URL("../../../../../data/", import.meta.url));
const active = new Map(activeQuestions().map((q) => [q.id, q]));

describe("read-more links", () => {
	it("belong to active questions", () => {
		expect(Object.keys(READ_MORE).filter((id) => !active.has(id))).toEqual([]);
	});

	it("point at pages that exist", () => {
		const missing = Object.entries(READ_MORE).flatMap(([id, links]) =>
			[
				...(links?.svar ?? []).map((slug) => `svar/${slug}`),
				...(links?.fordjupning ?? []).map((slug) => `fordjupning/${slug}`),
				...(links?.essays ?? []).map((slug) => `articles/${slug}`),
			]
				.filter((path) => !existsSync(`${DATA}${path}.md`))
				.map((path) => `${id}: ${path}`),
		);
		expect(missing).toEqual([]);
	});

	it("never hang a doctrine page under a question of war, world politics or party choice", () => {
		// On those questions the site reports and takes no position. A link from »Palestinierna
		// har rätt till väpnat motstånd« to a page on jihad would read as the site's answer.
		const POLITICAL: readonly Theme[] = [
			"folkmord",
			"gaza",
			"sjalvforsvar",
			"ockupation",
			"omvarlden",
			"varlden",
			"politik",
		];
		const wrong = Object.keys(READ_MORE).filter((id) => {
			const theme = active.get(id)?.theme;
			return theme !== undefined && POLITICAL.includes(theme);
		});
		expect(wrong).toEqual([]);
	});
});

describe("question backgrounds", () => {
	it("belong to active questions, name a source and say when they were checked", () => {
		const wrong = Object.entries(BACKGROUND).flatMap(([id, b]) => {
			const out: string[] = [];
			if (!active.has(id)) out.push(`${id}: not an active question`);
			if (!b) return out;
			if (!/^\d{4}-\d{2}-\d{2}$/.test(b.asOf)) out.push(`${id}: asOf must be an ISO date`);
			if (b.sources.length === 0) out.push(`${id}: no source`);
			for (const s of b.sources) if (!s.url.startsWith("https://")) out.push(`${id}: ${s.url}`);
			return out;
		});
		expect(wrong).toEqual([]);
	});

	it("stay short and printable", () => {
		const wrong = Object.entries(BACKGROUND).flatMap(([id, b]) => {
			if (!b) return [];
			const out: string[] = [];
			if (b.text.length > 600) out.push(`${id}: ${b.text.length} characters, cap is 600`);
			if (b.text.includes("—")) out.push(`${id}: em dash`);
			if (!passesGate(b.text)) out.push(`${id}: gate word`);
			return out;
		});
		expect(wrong).toEqual([]);
	});

	it("explain every member of a parallel twin set, or none of them", () => {
		// Explaining the ICJ on Israel and saying nothing about Russia on the same statement would
		// be the double standard the set exists to measure.
		const lopsided = TWIN_SETS.filter((set) => set.kind === "parallel")
			.filter((set) => new Set(set.members.map((m) => Boolean(BACKGROUND[m.id]))).size > 1)
			.map((set) => set.key);
		expect(lopsided).toEqual([]);
	});

	it("leave the religious ruling to the classical note", () => {
		// The note is last on the page so the classical position has the last word; a verse or »de
		// lärda« in the background above would speak on the ruling first.
		const wrong = Object.entries(BACKGROUND)
			.filter(([id, b]) => active.get(id)?.religious && b && /\(\d+:\d+|de lärda/i.test(b.text))
			.map(([id]) => id);
		expect(wrong).toEqual([]);
	});
});
