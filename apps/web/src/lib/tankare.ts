import { getCollection } from "astro:content";
import { type Article, articleBody, getArticles } from "./articles";
import { memoize } from "./cache";
import { byTradition, type Tradition } from "./traditions";

// Tänkare — the recurring interlocutors. Membership is DERIVED from the corpus:
// each thinker's `match` terms (the distinctive spelling of the name, diacritics
// included) are searched, case-insensitively, against every essay body. An essay
// that contains one is engaging that thinker. Framing prose is authored in
// tankare.json (§13.7); nothing about who-appears-where is hand-maintained, so
// the lists track the corpus automatically as essays come and go.

export type { Tradition } from "./traditions";

export interface Tankare {
	name: string;
	slug: string;
	tradition: Tradition;
	framing: string;
	/** Authoritative external identities (Wikipedia/Wikidata) → schema.org sameAs. */
	sameAs?: string[];
	/** Essays engaging this thinker, in the feed's date order (newest first). */
	essays: Article[];
}

async function build(): Promise<Tankare[]> {
	const [entries, articles] = await Promise.all([getCollection("tankare"), getArticles()]);

	// Lowercase each body once; getArticles already returns newest-first, so the
	// filtered slices inherit that order.
	const bodies = articles.map((a) => ({
		article: a,
		body: articleBody(a).toLowerCase(),
	}));

	return entries.map((entry) => {
		const terms = entry.data.match.map((m) => m.toLowerCase());
		const essays = bodies
			.filter(({ body }) => terms.some((t) => body.includes(t)))
			.map(({ article }) => article);

		// A thinker that matches nothing means the spelling drifted (an essay was
		// renamed, or the term has a typo) — fail loudly rather than ship an empty
		// directory page and a dead homepage row.
		if (essays.length === 0) {
			throw new Error(
				`Tänkare "${entry.data.slug}" matches no essay — check the \`match\` terms [${entry.data.match.join(", ")}] in tankare.json.`,
			);
		}

		return {
			name: entry.data.name,
			slug: entry.data.slug,
			tradition: entry.data.tradition,
			framing: entry.data.framing,
			...(entry.data.sameAs === undefined ? {} : { sameAs: entry.data.sameAs }),
			essays,
		};
	});
}

/** All tänkare with their derived essay lists. Memoized for the build. */
export const getTankare = memoize(build);

/** One line of the dialogue: a classical voice and a Swedish/Western one that meet in
 *  the same essays. `tier` ranks the stroke (3 heaviest) relative to the strongest
 *  pair drawn, so the weights keep meaning as the corpus grows. */
export interface TankarePair {
	/** The sunni thinker's slug. */
	a: string;
	/** The western thinker's slug. */
	b: string;
	/** Essays both appear in. */
	shared: number;
	tier: 1 | 2 | 3;
}

type PairInput = Pick<Tankare, "slug" | "tradition"> & { essays: readonly { slug: string }[] };

interface Candidate {
	a: string;
	b: string;
	shared: number;
	lift: number;
}

/** Every sunni × western pair that shares at least `minShared` essays, with its lift. */
function pairCandidates(thinkers: readonly PairInput[], minShared: number): Candidate[] {
	const essaysOf = new Map(thinkers.map((t) => [t.slug, new Set(t.essays.map((e) => e.slug))]));
	const { sunni, western } = byTradition(thinkers, (t) => t.tradition);
	const candidates: Candidate[] = [];
	for (const s of sunni) {
		const ofA = essaysOf.get(s.slug) ?? new Set<string>();
		for (const w of western) {
			const ofB = essaysOf.get(w.slug) ?? new Set<string>();
			const shared = [...ofA].filter((slug) => ofB.has(slug)).length;
			if (shared >= minShared) {
				candidates.push({ a: s.slug, b: w.slug, shared, lift: shared / (ofA.size * ofB.size) });
			}
		}
	}
	return candidates;
}

/**
 * Which classical and Western thinkers meet, and how often — the homepage's two facing
 * columns drawn as a conversation (TankareGroups).
 *
 * Only sunni × western pairs: two voices of the same tradition agreeing is not the
 * dialogue the site is about.
 *
 * NOT simply the N largest counts. Measured on the 6 × 6 homepage selection (2026-09-25,
 * 64 essays), 32 of the 36 pairs share at least two essays, and the raw counts are ruled
 * by how prolific a name is — Ibn Qayyim appears in 39 essays and Strindberg in 25, so a
 * top-12 by count drew seven of its twelve lines out of those two names and none at all to al-Māwardī,
 * al-Ghazālī, Geijer or Lagerlöf: a picture of who is quoted most, not of who meets whom.
 * So every thinker first gets its strongest partner (ties broken by lift — shared essays
 * over the product of both lists, i.e. the pair that meets more often than their sizes
 * alone predict), and only then do the strongest remaining pairs fill up to `maxPairs`.
 * If coverage alone exceeds `maxPairs` (a long directory), the strongest of it is kept.
 */
export function tankarePairs(
	thinkers: readonly PairInput[],
	{ minShared = 2, maxPairs = 12 }: { minShared?: number; maxPairs?: number } = {},
): TankarePair[] {
	const candidates = pairCandidates(thinkers, minShared);

	// Strongest first; lift, then the slugs, make every tie deterministic.
	const stronger = (x: Candidate, y: Candidate) =>
		y.shared - x.shared || y.lift - x.lift || x.a.localeCompare(y.a) || x.b.localeCompare(y.b);
	candidates.sort(stronger);

	const key = (c: Candidate) => `${c.a}\u0000${c.b}`;
	const chosen = new Map<string, Candidate>();

	// Pass 1 — coverage: each thinker's strongest partner.
	for (const t of thinkers) {
		const side = t.tradition === "sunni" ? "a" : "b";
		const best = candidates.find((c) => c[side] === t.slug);
		if (best) chosen.set(key(best), best);
	}
	let picked = [...chosen.values()].sort(stronger).slice(0, maxPairs);

	// Pass 2 — fill with the strongest pairs not yet drawn.
	if (picked.length < maxPairs) {
		const have = new Set(picked.map(key));
		for (const c of candidates) {
			if (picked.length >= maxPairs) break;
			if (!have.has(key(c))) picked.push(c);
		}
		picked = picked.sort(stronger);
	}

	const max = picked[0]?.shared ?? 0;
	return picked.map(({ a, b, shared }) => ({
		a,
		b,
		shared,
		tier: shared >= 0.6 * max ? 3 : shared >= 0.35 * max ? 2 : 1,
	}));
}
