import { getCollection } from "astro:content";
import { type Amne, amneByName } from "./amnen";
import { type Article, getArticles } from "./articles";
import { getVersesByEssay } from "./citations";
import { getTankare } from "./tankare";

// Everything one essay is connected to, derived from data the site already
// holds — its ämne (category), the tänkare it engages (corpus-derived), the
// curated trådar it belongs to, and the essays nearest it on those axes. None
// of this is authored per-essay; it falls out of the existing graph (§13.6/7).

export interface TankareRef {
	name: string;
	slug: string;
}

export interface TradRef {
	id: string;
	title: string;
}

export interface EssayConnections {
	amne: Amne | null;
	tankare: TankareRef[];
	tradar: TradRef[];
	/** Up to `limit` thematically nearest essays, strongest first. */
	related: Article[];
}

// Relatedness weights. A shared tråd is the strongest signal (it is an explicit
// editorial pairing); a shared cited verse is a concrete textual overlap; shared
// tänkare and a shared ämne are softer thematic kinship.
const W_TRAD = 5;
const W_VERSE = 3;
const W_TANKARE = 2;
const W_AMNE = 1;

export async function getEssayConnections(slug: string, limit = 3): Promise<EssayConnections> {
	const [articles, thinkers, threads, versesByEssay] = await Promise.all([
		getArticles(),
		getTankare(),
		getCollection("tradar"),
		getVersesByEssay(),
	]);

	const self = articles.find((a) => a.slug === slug);
	const amne = self?.category ? (amneByName.get(self.category) ?? null) : null;

	// The thinkers this essay engages, and (for scoring) every essay's thinker set.
	const tankare: TankareRef[] = [];
	const thinkersByEssay = new Map<string, Set<string>>();
	for (const t of thinkers) {
		const slugs = new Set(t.essays.map((e) => e.slug));
		if (slugs.has(slug)) tankare.push({ name: t.name, slug: t.slug });
		for (const s of slugs) {
			const set = thinkersByEssay.get(s) ?? new Set<string>();
			set.add(t.slug);
			thinkersByEssay.set(s, set);
		}
	}

	// The trådar this essay belongs to, and (for scoring) co-members per essay.
	const tradar: TradRef[] = [];
	const threadMatesByEssay = new Map<string, Set<string>>();
	for (const thread of threads) {
		const members: string[] = thread.data.essays;
		if (!members.includes(slug)) continue;
		tradar.push({ id: thread.id, title: thread.data.title });
		for (const m of members) {
			if (m === slug) continue;
			const set = threadMatesByEssay.get(slug) ?? new Set<string>();
			set.add(m);
			threadMatesByEssay.set(slug, set);
		}
	}

	const myThinkers = thinkersByEssay.get(slug) ?? new Set();
	const myVerses = versesByEssay.get(slug) ?? new Set();
	const myThreadMates = threadMatesByEssay.get(slug) ?? new Set();

	const scored = articles
		.filter((a) => a.slug !== slug)
		.map((a) => {
			let score = 0;
			if (myThreadMates.has(a.slug)) score += W_TRAD;

			const theirVerses = versesByEssay.get(a.slug);
			if (theirVerses) for (const v of theirVerses) if (myVerses.has(v)) score += W_VERSE;

			const theirThinkers = thinkersByEssay.get(a.slug);
			if (theirThinkers) for (const t of theirThinkers) if (myThinkers.has(t)) score += W_TANKARE;

			if (amne && a.category === amne.name) score += W_AMNE;

			return { article: a, score };
		})
		.filter((x) => x.score > 0)
		// Strongest first; break ties toward the more recent essay.
		.sort(
			(x, y) =>
				y.score - x.score ||
				new Date(y.article.publishedAt).getTime() - new Date(x.article.publishedAt).getTime(),
		);

	return {
		amne,
		tankare,
		tradar,
		related: scored.slice(0, limit).map((x) => x.article),
	};
}
