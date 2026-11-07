import { describe, expect, it, vi } from "vitest";

// tankare.ts reads the content collections at module scope; tankarePairs() itself is
// pure and never touches them.
vi.mock("astro:content", () => ({ getCollection: vi.fn() }));
vi.mock("./articles", () => ({ getArticles: vi.fn(), articleBody: vi.fn() }));

const { tankarePairs } = await import("./tankare");

type Input = Parameters<typeof tankarePairs>[0][number];

const t = (slug: string, tradition: "sunni" | "western", essays: string[]): Input => ({
	slug,
	tradition,
	essays: essays.map((e) => ({ slug: e })),
});

// A corpus shaped like the real one: one prolific voice on each side (q, s) who meet
// often simply because both are everywhere, and quieter voices with one real partner.
const corpus = [
	t("q", "sunni", ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"]),
	t("m", "sunni", ["e1", "e9", "e10"]),
	t("g", "sunni", ["e11", "e12"]),
	t("s", "western", ["e1", "e2", "e3", "e4", "e5", "e6", "e9"]),
	t("k", "western", ["e2", "e9", "e10"]),
	t("l", "western", ["e11", "e12", "e3"]),
];

describe("tankarePairs", () => {
	it("counts the essays a classical and a Western voice share, and nothing else", () => {
		const pairs = tankarePairs(corpus, { minShared: 1, maxPairs: 99 });
		const count = (a: string, b: string) => pairs.find((p) => p.a === a && p.b === b)?.shared;
		expect(count("q", "s"), "q and s share e1–e6").toBe(6);
		expect(count("m", "k"), "m and k share e9 and e10").toBe(2);
		expect(count("g", "l"), "g and l share e11 and e12").toBe(2);
		expect(count("g", "s"), "g and s share nothing, so no line is drawn").toBeUndefined();
	});

	it("only ever joins a sunni thinker (a) to a western one (b) — never two of one tradition", () => {
		const sunni = new Set(corpus.filter((c) => c.tradition === "sunni").map((c) => c.slug));
		for (const p of tankarePairs(corpus, { minShared: 1, maxPairs: 99 })) {
			expect(sunni.has(p.a), `${p.a} is on the classical side`).toBe(true);
			expect(sunni.has(p.b), `${p.b} must be on the Western side`).toBe(false);
		}
	});

	it("does not depend on the order the thinkers arrive in", () => {
		const forward = tankarePairs(corpus, { maxPairs: 4 });
		const reversed = tankarePairs([...corpus].reverse(), { maxPairs: 4 });
		expect(reversed).toEqual(forward);
	});

	it("honours minShared: no line for a pair that meets fewer times", () => {
		for (const p of tankarePairs(corpus, { minShared: 2, maxPairs: 99 })) {
			expect(p.shared, `${p.a}–${p.b} was drawn below the threshold`).toBeGreaterThanOrEqual(2);
		}
	});

	it("honours maxPairs even when coverage alone would need more", () => {
		expect(tankarePairs(corpus, { minShared: 1, maxPairs: 2 })).toHaveLength(2);
	});

	it("gives every thinker with a qualifying partner a line before the prolific pairs fill up", () => {
		// With room for three lines, a plain top-3 by count would spend them all on q
		// (q–s 6, then q–k 1 / q–l 1 …) and leave g and l unconnected — the failure the
		// homepage had with Ibn Qayyim and Strindberg.
		const pairs = tankarePairs(corpus, { minShared: 2, maxPairs: 3 });
		const joined = new Set(pairs.flatMap((p) => [p.a, p.b]));
		for (const slug of ["q", "m", "g", "s", "k", "l"]) {
			expect(joined.has(slug), `${slug} has a partner sharing ≥2 essays but got no line`).toBe(
				true,
			);
		}
	});

	it("ranks strokes against the strongest pair drawn, heaviest first", () => {
		const pairs = tankarePairs(corpus, { minShared: 2 });
		expect(pairs[0]?.tier, "the strongest pair takes the heaviest stroke").toBe(3);
		for (let i = 1; i < pairs.length; i++) {
			const prev = pairs[i - 1];
			const here = pairs[i];
			if (!(prev && here)) continue;
			expect(here.shared, "pairs are listed strongest first").toBeLessThanOrEqual(prev.shared);
			expect(here.tier, "a weaker pair never outranks a stronger one").toBeLessThanOrEqual(
				prev.tier,
			);
		}
	});

	it("draws nothing rather than failing when no pair qualifies", () => {
		expect(tankarePairs(corpus, { minShared: 99 })).toEqual([]);
	});
});

describe("getTankare", () => {
	// A thinker's page used to list essays newest first, so Linné's opened on an election
	// essay that names him once while the one naming him 28 times sat further down
	// (2026-11-07). The page is read to find where to start with a person.
	it("lists the essays that name a thinker most first, newest first among equals", async () => {
		const { getCollection } = await import("astro:content");
		const { getArticles, articleBody } = await import("./articles");
		const { getTankare } = await import("./tankare");
		const bodies: Record<string, string> = {
			nyast: "Linné nämns en gång.",
			mitten: "Linné, Linné och åter linné.",
			aldst: "Här står Linné en gång.",
			utan: "Ingen naturforskare alls.",
		};
		vi.mocked(getCollection).mockResolvedValue([
			{
				data: {
					name: "Carl von Linné",
					slug: "linne",
					tradition: "western",
					framing: "",
					match: ["Linné"],
				},
			},
		] as never);
		// getArticles returns the feed newest first.
		vi.mocked(getArticles).mockResolvedValue(
			Object.keys(bodies).map((slug) => ({ slug })) as never,
		);
		vi.mocked(articleBody).mockImplementation((a) => bodies[(a as { slug: string }).slug] ?? "");

		const [linne] = await getTankare();
		expect(
			linne?.essays.map((e) => e.slug),
			"the essay that names the thinker most must come first, ties keep the feed's date order, and an essay that never names them is not listed",
		).toEqual(["mitten", "nyast", "aldst"]);
	});
});
