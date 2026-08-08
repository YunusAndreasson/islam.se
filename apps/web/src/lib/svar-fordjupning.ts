/**
 * Which /fordjupning/ pillar an /svar/ answer belongs under — the "Fördjupning: …"
 * line on an answer page.
 *
 * Kept free of `astro:content` and `import.meta.glob` so the resolution can be
 * unit-tested; the caller passes plain objects read off the collection.
 */

/** One pillar's claim on the answers it sits above, in `related` order. */
export interface PillarSpokes {
	id: string;
	term: string;
	related: readonly string[];
}

export interface PillarRef {
	slug: string;
	term: string;
}

/** A spoke this late in a pillar's list is a see-also, not a parent. */
const MAX_HOME_RANK = 4;
/** Claimed by this many pillars and led by none: no pillar owns it. */
const HUB_CLAIMS = 3;

/**
 * Answer slug → its pillar. Answers absent from the map get no line.
 *
 * ⚠️ `related` does two jobs: it lists a pillar's spokes (generous — five pillars
 * name `vad-ar-sharia`) and it implies ownership (exclusive). Taking the first
 * claimant in collection order therefore resolved by FILENAME: `aktenskap.md`,
 * which names `vad-ar-hijab` last, beat `hijab.md`, which names it first, and the
 * hijab answer shipped reading "Fördjupning: Äktenskapet". Rank inside `related`
 * is the signal; the input is re-sorted here so collection order can never reach
 * the output.
 */
export function pillarBySvar(pillars: readonly PillarSpokes[]): ReadonlyMap<string, PillarRef> {
	const claims = new Map<string, { pillar: PillarSpokes; rank: number }[]>();
	for (const pillar of [...pillars].sort((a, b) => a.id.localeCompare(b.id, "sv"))) {
		for (const [rank, slug] of pillar.related.entries()) {
			const list = claims.get(slug) ?? [];
			list.push({ pillar, rank });
			claims.set(slug, list);
		}
	}

	const homes = new Map<string, PillarRef>();
	for (const [slug, list] of claims) {
		// Stable sort, and the pillars went in alphabetically, so an equal rank
		// resolves the same way on every build.
		const ranked = [...list].sort((a, b) => a.rank - b.rank);
		const led = ranked.find((c) => c.rank === 0);
		const winner = led ?? (list.length >= HUB_CLAIMS ? undefined : ranked[0]);
		if (!winner || winner.rank > MAX_HOME_RANK) continue;
		homes.set(slug, { slug: winner.pillar.id, term: winner.pillar.term });
	}
	return homes;
}
