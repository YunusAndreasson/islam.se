import { getCollection } from "astro:content";
import { type Amne, type AmneName, amneByName } from "./amnen";
import { type Article, articleBody, getArticles } from "./articles";
import { memoize } from "./cache";
import { getVersesByEssay } from "./citations";
import { FAKTA_SLUGS } from "./fakta";
import { getTankare } from "./tankare";

// Everything one essay is connected to, derived from data the site already
// holds — its ämne (category), the tänkare it engages (corpus-derived), the
// curated trådar it belongs to, and the essays nearest it on those axes. None
// of this is authored per-essay; it falls out of the existing graph (§13.6/7).

interface TankareRef {
	name: string;
	slug: string;
}

interface TradRef {
	id: string;
	title: string;
}

interface SvarRef {
	slug: string;
	title: string;
}

export interface EssayConnections {
	amne: Amne | null;
	tankare: TankareRef[];
	tradar: TradRef[];
	/** Up to `limit` thematically nearest essays, strongest first. */
	related: Article[];
	/** The reference pages this essay touches — the one link out of the essay
	 *  corpus and into FAKTA / Frågor & svar. */
	svar: SvarRef[];
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

	// The trådar this essay belongs to, and (for scoring) its co-members.
	const tradar: TradRef[] = [];
	const myThreadMates = new Set<string>();
	for (const thread of threads) {
		const members: string[] = thread.data.essays;
		if (!members.includes(slug)) continue;
		tradar.push({ id: thread.id, title: thread.data.title });
		for (const m of members) if (m !== slug) myThreadMates.add(m);
	}

	const myThinkers = thinkersByEssay.get(slug) ?? new Set();
	const myVerses = versesByEssay.get(slug) ?? new Set();

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
		svar: await getRelatedSvar(slug),
	};
}

// ---------------------------------------------------------------------------
// Essays → answers
// ---------------------------------------------------------------------------

// The essay corpus and the reference corpus were two closed worlds: essays link
// densely to essays (above), answers link out to essays via a curated
// `essays[]`, and nothing pointed the other way. Not one of the 53 essay bodies
// contains a link, so a reader finishing an essay was never offered the page
// that plainly explains what it circled.
//
// Membership is derived, like tänkare — nothing is authored per essay.
//
// Matching whole `keywords` against the body does not work: they are search
// phrases ("hur ber man i islam", "bönen steg för steg") that essay prose never
// contains verbatim, so nearly every essay fell through to its ämne default and
// all fifteen Själen essays were offered the same link. Tokenising both sides
// fixes it — "bönen steg för steg" contributes *bönen* and *steg*, words that do
// occur.
//
// Terms are weighted by inverse document frequency across the essay corpus, so a
// word in three essays counts and a word in forty barely does. That makes a
// stoplist unnecessary: Swedish function words appear everywhere and price
// themselves out.
//
// CANDIDATES ARE BOUNDED, and this is the load-bearing decision. Scoring against
// all 63 answers was measured over the whole corpus and produced links that were
// not merely weak but wrong: an essay on a woman waking for the night prayer was
// offered "Vad säger islam om kvinnlig omskärelse?", and one on the Birmingham
// Qur'an fragment was offered "Krävs fyra vittnen för att en våldtäkt ska
// räknas?" — both on one or two incidentally shared words. Fifty-three essays
// against sixty-three answers is too little text for statistics to be trusted
// with a link that a reader will read as an editorial judgement.
//
// So candidates are the reference spine only: the twelve FAKTA cornerstones plus
// the seven general ämne pages. Every one of them is a broad "what is X" page, so
// the worst case is a link that is merely unsurprising, never one that is
// tonally wrong. It is also where the link equity was meant to go.

/** Below this length a token is a Swedish function word or a fragment. */
const TOKEN_MIN_LENGTH = 4;

/** One shared word is a coincidence. Require a real overlap of subject. */
const MIN_MATCHED_TOKENS = 2;

/** A token this common across the essays describes the site, not a subject.
 *  IDF already discounts it, but on a nineteen-page candidate pool the short
 *  questions ("Hur blir man muslim?") are mostly such words, and a small vector
 *  of them still scored high everywhere. Dropping them outright is what makes
 *  the match land on *ramadan*, *qadar* and *shahada* rather than on *muslim*. */
const TOKEN_MAX_DOC_SHARE = 0.6;

/** Below this the overlap is incidental, and the honest ämne default is better
 *  than a link that implies a connection the essay does not have. */
const SCORE_FLOOR = 0.5;

/** Split Swedish (and transliterated Arabic) prose into comparable tokens. */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((t) => t.length >= TOKEN_MIN_LENGTH);
}

/** Where an essay has no real overlap, its ämne still says something. One
 *  canonical reference page per ämne, so every essay reaches the corpus. */
const AMNE_FALLBACK: Record<AmneName, string> = {
	Skapelsen: "varfor-skapade-gud-manniskan",
	Skriften: "vad-ar-koranen",
	Själen: "vad-sager-islam-om-livet-efter-doden",
	Rättvisa: "vad-ar-sharia",
	Samhälle: "vad-ar-zakat",
	Sökandet: "finns-bevis-for-gud",
	Norden: "hur-blir-man-muslim",
};

interface SvarIndexEntry {
	slug: string;
	/** The short `question`, not the SEO `title` — it reads as a link. */
	label: string;
	/** Distinct tokens with their IDF weight, plus the vector norm to divide by. */
	terms: { token: string; weight: number }[];
	norm: number;
}

async function buildSvarIndex(): Promise<{
	entries: SvarIndexEntry[];
	tokensBySlug: Map<string, Set<string>>;
	labelBySlug: Map<string, string>;
}> {
	const [answers, articles] = await Promise.all([getCollection("svar"), getArticles()]);

	// One token set per essay, built once for the whole build.
	const tokensBySlug = new Map(articles.map((a) => [a.slug, new Set(tokenize(articleBody(a)))]));
	const docs = [...tokensBySlug.values()];

	const maxDocs = docs.length * TOKEN_MAX_DOC_SHARE;
	const dfCache = new Map<string, number>();
	const idf = (token: string): number => {
		let df = dfCache.get(token);
		if (df === undefined) {
			df = docs.reduce((n, doc) => n + (doc.has(token) ? 1 : 0), 0);
			dfCache.set(token, df);
		}
		// df 0 never occurs in an essay and above the cap it occurs in most of
		// them; either way the token is dropped from the vector. The +1 floor keeps
		// a surviving token's weight positive.
		return df === 0 || df > maxDocs ? 0 : Math.log(docs.length / df) + 1;
	};

	const candidates = new Set([...FAKTA_SLUGS, ...Object.values(AMNE_FALLBACK)]);

	const entries = answers
		.filter((entry) => candidates.has(entry.id))
		.map((entry) => {
			// The question and the keywords, together: both are curated, compact and
			// about this answer specifically. The SEO title mostly repeats the question.
			const source = [entry.data.question, ...(entry.data.keywords ?? [])].join(" ");
			const terms = [...new Set(tokenize(source))]
				.map((token) => ({ token, weight: idf(token) }))
				.filter((t) => t.weight > 0);

			const norm = Math.sqrt(terms.reduce((s, t) => s + t.weight * t.weight, 0)) || 1;
			return { slug: entry.id, label: entry.data.question, terms, norm };
		});

	return {
		entries,
		tokensBySlug,
		labelBySlug: new Map(entries.map((e) => [e.slug, e.label])),
	};
}

const getSvarIndex = memoize(buildSvarIndex);

/** The reference pages nearest one essay, strongest first. Falls back to the
 *  essay's ämne when nothing genuinely overlaps. */
async function getRelatedSvar(slug: string, limit = 2): Promise<SvarRef[]> {
	const [{ entries, tokensBySlug, labelBySlug }, articles] = await Promise.all([
		getSvarIndex(),
		getArticles(),
	]);

	const essayTokens = tokensBySlug.get(slug);
	if (!essayTokens) return [];

	const scored = entries
		.map((e) => {
			let overlap = 0;
			let matched = 0;
			for (const t of e.terms) {
				if (!essayTokens.has(t.token)) continue;
				overlap += t.weight;
				matched++;
			}
			return { slug: e.slug, label: e.label, score: overlap / e.norm, matched };
		})
		.filter((x) => x.matched >= MIN_MATCHED_TOKENS && x.score >= SCORE_FLOOR)
		.sort(
			(x, y) =>
				y.score - x.score ||
				// Tie-break toward a cornerstone — the pages that most want the link —
				// then alphabetically, purely so the build is deterministic.
				Number(FAKTA_SLUGS.has(y.slug)) - Number(FAKTA_SLUGS.has(x.slug)) ||
				x.slug.localeCompare(y.slug, "sv"),
		);

	if (scored.length > 0) {
		return scored.slice(0, limit).map(({ slug: s, label }) => ({ slug: s, title: label }));
	}

	const category = articles.find((a) => a.slug === slug)?.category;
	const fallback = category ? AMNE_FALLBACK[category] : undefined;
	const label = fallback ? labelBySlug.get(fallback) : undefined;
	return fallback && label ? [{ slug: fallback, title: label }] : [];
}
