/**
 * Step 0 of the /fordjupning/ pipeline: gather the internal corpus for a topic, with no
 * LLM in the loop.
 *
 * The point of the content type is that the corpus makes the page unique — freshly
 * translated primary text from the Arabic classics and the Swedish intellectual-history
 * parallel exist nowhere else. Leaving that to the model's own tool calls is not good
 * enough: Opus under-reaches for tools by default, so a page whose uniqueness rests on
 * the corpus would silently come out generic. This runs first and hands the material
 * over as prompt content.
 *
 * ⚠️ THREE MEASURED FACTS SHAPE THIS FILE (1–2 hijab 2026-07-30, 3 abort 2026-08-01):
 *
 * 1. Similarity scores are NOT comparable across queries, and the absolute band is
 *    meaningless. Every verse scored 0.83–0.86 whether or not it was relevant. The
 *    query that returned pure noise ("anständighet och att inte visa upp sin skönhet"
 *    → 3:20, 46:15, 34:19) scored HIGHER (0.863) than the query that returned the two
 *    verses the article is actually built on (24:30, 24:31 at 0.841). So merging several
 *    queries by best score systematically promotes the worst query's results, and no
 *    minScore threshold can separate signal from noise. Only WITHIN-query rank carries
 *    information — hence results are grouped per query and never pooled.
 * 2. Which database answers which question is not symmetric. books.db carries the
 *    Arabic classics and answers thematic English queries well; its Swedish half
 *    returned near-noise (a novel's table of contents, witch trials). The Swedish
 *    material that landed — Karin Boye, Ellen Key, Albert Engström — came from
 *    quotes.db. So Arabic goes to books.db, the Swedish bridge goes to quotes.db, and
 *    the Swedish books.db sweep is kept only as a clearly-labelled low-confidence extra.
 * 3. Antalet träffar var flaskhalsen, inte korpusen — och råare djup är inte lösningen.
 *    Med `arabic: 4` nådde som mest 20 arabiska passager författaren oavsett om
 *    beståndet var 33 verk eller 333; på abort-sidan var 0 av 19 fiqh. Men att bara
 *    höja taket gav olika utfall per ämne: på en angle var 11 av 15 nya träffar samma
 *    bok, på en annan låg al-Mughnī först på plats 17. Ett tak PER VERK skiljer de
 *    fallen åt där ett antalstak inte kan. Efter både import och tak: 64 % fiqh, och
 *    alla fyra skolorna representerade. Se capPerBook.
 *    ⚠️ `findQuotesLocal` (quotes.db) har haft MMR-diversitet hela tiden; boksökningen
 *    har aldrig haft något motsvarande. Samma asymmetri finns kvar i
 *    `book-service.ts`, som essäpipelinen använder — se anteckningen där.
 */

import {
	cleanOpenITIText,
	type FormattedQuoteWithId,
	findQuotesLocal,
	generateLocalEmbedding,
	getBookInventory,
	getInventory,
	getVerse,
	type PassageWithScore,
	type StoredVerse,
	searchBooks,
	searchVersesSemantic,
	type VerseWithScore,
} from "@islam-se/quotes";

/** Search angles for one topic. Several per database: a single query on the head term
 *  misses the thematic material (searching "hijab" alone never reaches the passages on
 *  modesty, the gaze and shame that carry the article's middle sections).
 *
 *  Angle wording is the highest-leverage input to this whole stage — a badly worded
 *  angle returns confident noise. Write them as full phrases in the language of the text
 *  being searched, never as bare terms. */
export interface CorpusAngles {
	/** Swedish queries for quran.db — the stored translation is Bernström's Swedish. */
	quran: string[];
	/** Thematic English queries for the Arabic classics in books.db. */
	arabic: string[];
	/** Swedish queries for quotes.db — the Swedish intellectual-history bridge. */
	swedish: string[];
}

export interface CorpusBriefInput {
	/** The head entity, e.g. "Hijab". */
	term: string;
	angles: CorpusAngles;
	/** Verses fetched BY REFERENCE ("24:31", "33:59"), not by search.
	 *
	 *  ⚠️ Load-bearing, not a convenience. Semantic search demonstrably fails to find
	 *  the loci classici: on the hijab topic it never returned 33:59, the jilbāb verse,
	 *  under any angle. A reference article that omits the central text is worthless, and
	 *  which texts are central is known in advance — so they are pinned rather than hoped
	 *  for. Search is for the material you would not have thought to look for. */
	pinnedVerses?: string[];
	/** Results kept per angle (default 5 / 4 / 5 / 2). */
	perAngle?: {
		quran?: number;
		arabic?: number;
		swedish?: number;
		swedishBooks?: number;
		/** Högst så här många passager ur samma verk per sökning (standard 3). */
		arabicPerBook?: number;
	};
}

/** One angle's own ranking, kept intact. */
export interface AngleResult<T> {
	query: string;
	hits: T[];
}

export interface CorpusBrief {
	term: string;
	/** Verses asked for by reference. `missing` lists refs not in quran.db. */
	pinned: { verses: StoredVerse[]; missing: string[] };
	verses: AngleResult<VerseWithScore>[];
	arabicPassages: AngleResult<PassageWithScore>[];
	swedishQuotes: AngleResult<FormattedQuoteWithId>[];
	swedishPassages: AngleResult<PassageWithScore>[];
	counts: { quotesTotal: number; booksTotal: number; bookPassagesTotal: number };
}

/** Drop items already shown under an earlier angle, so the brief doesn't repeat itself.
 *  First occurrence wins, which preserves the finding angle's own ranking. */
function dedupeAcrossAngles<T>(
	groups: AngleResult<T>[],
	key: (item: T) => string,
): AngleResult<T>[] {
	const seen = new Set<string>();
	return groups
		.map((g) => ({
			query: g.query,
			hits: g.hits.filter((h) => {
				const k = key(h);
				if (seen.has(k)) return false;
				seen.add(k);
				return true;
			}),
		}))
		.filter((g) => g.hits.length > 0);
}

/**
 * Håll nere hur många passager ETT verk får bidra med inom en och samma sökning.
 *
 * ⚠️ Mätt 2026-08-01 på abort-ämnet: djup betalar sig helt olika beroende på ämne.
 * På angeln om själen och moderlivet var 11 av de 15 träffarna på plats 11–25 samma
 * bok (*Kitāb al-Rūḥ*) — ren upprepning. På angeln om ingrepp före besjälningen låg
 * däremot *al-Mughnī* på plats 17 och 18 och *Bidāyat al-mujtahid* på 14, verk som
 * inte fanns med bland de tio första alls. Det var den hanbalitiska och den
 * jämförande hållningen, alltså precis det material vars frånvaro lät sidan påstå
 * att malikiter och hanbaliter förlägger besjälningen till fyrtionde dagen.
 *
 * Ett tak på antalet träffar kan inte skilja de två fallen åt. Ett tak per VERK kan:
 * djupet hämtar då in nya böcker i stället för fler sidor ur samma bok.
 */
function capPerBook<T extends { bookTitle: string }>(
	hits: T[],
	perBook: number,
	total: number,
): T[] {
	const count = new Map<string, number>();
	const out: T[] = [];
	for (const h of hits) {
		if (out.length >= total) break;
		const n = count.get(h.bookTitle) ?? 0;
		if (n >= perBook) continue;
		count.set(h.bookTitle, n + 1);
		out.push(h);
	}
	return out;
}

export async function buildCorpusBrief(input: CorpusBriefInput): Promise<CorpusBrief> {
	const { term, angles } = input;
	// ⚠️ `arabic` var 4 fram till 2026-08-01, vilket gjorde briefen till flaskhalsen och
	// inte korpusen: fem angles × 4 = som mest 20 arabiska passager nådde författaren,
	// oavsett om beståndet var 33 verk eller 333. Höjt först NÄR korpusen fått rätt
	// genrer — furūʿ al-fiqh från alla fyra skolorna, två tafsīrer, de sex
	// hadithsamlingarna. Före den importen hade en höjning bara hämtat mer taṣawwuf.
	const n = {
		quran: input.perAngle?.quran ?? 5,
		arabic: input.perAngle?.arabic ?? 12,
		swedish: input.perAngle?.swedish ?? 5,
		swedishBooks: input.perAngle?.swedishBooks ?? 2,
	};
	/** Högst så här många passager ur samma verk per sökning — se capPerBook. */
	const ARABIC_PER_BOOK = input.perAngle?.arabicPerBook ?? 2;

	// ⚠️ The bare term is a FALLBACK only. Against quran.db (Swedish text) a single
	// non-Swedish token produced measurable noise — "Hijab" returned 4:106, 32:4, 22:64,
	// none of them about veiling — so it is used there only when no angle was supplied.
	const quranQueries = angles.quran.length > 0 ? angles.quran : [term];
	const arabicQueries = angles.arabic.length > 0 ? angles.arabic : [term];
	const swedishQueries = angles.swedish.length > 0 ? angles.swedish : [term];

	const [verseGroups, arabicGroups, swedishGroups, swedishBookGroups] = await Promise.all([
		Promise.all(
			quranQueries.map(async (query) => ({
				query,
				hits: searchVersesSemantic(await generateLocalEmbedding(query), n.quran),
			})),
		),
		Promise.all(
			arabicQueries.map(async (query) => ({
				query,
				// Hämta djupare än vi behåller, så att taket per verk har något att välja
				// bland: annars kan en dominerande bok fylla hela kvoten före kapningen.
				hits: capPerBook(
					(
						await searchBooks(query, {
							passageLimit: n.arabic * 3,
							conceptLimit: 0,
							language: "ar",
						})
					).passages,
					ARABIC_PER_BOOK,
					n.arabic,
				),
			})),
		),
		Promise.all(
			swedishQueries.map(async (query) => ({
				query,
				hits: await findQuotesLocal(query, {
					limit: n.swedish,
					language: "sv",
					minStandalone: 4,
					diverse: true,
				}),
			})),
		),
		Promise.all(
			swedishQueries.map(async (query) => ({
				query,
				hits: (
					await searchBooks(query, {
						passageLimit: n.swedishBooks,
						conceptLimit: 0,
						language: "sv",
					})
				).passages,
			})),
		),
	]);

	const quotesInv = getInventory();
	const booksInv = getBookInventory();

	// Pinned verses are fetched by reference, so a bad ref is a silent gap unless
	// reported — the caller needs to know a locus classicus is absent from the DB.
	const pinnedVerses: StoredVerse[] = [];
	const missing: string[] = [];
	for (const ref of input.pinnedVerses ?? []) {
		const m = /^(\d{1,3}):(\d{1,3})$/.exec(ref.trim());
		const verse = m ? getVerse(Number(m[1]), Number(m[2])) : null;
		if (verse) pinnedVerses.push(verse);
		else missing.push(ref);
	}

	return {
		term,
		pinned: { verses: pinnedVerses, missing },
		verses: dedupeAcrossAngles(verseGroups, (v) => `${v.surahNumber}:${v.verseNumber}`),
		arabicPassages: dedupeAcrossAngles(arabicGroups, (p) => String(p.id)),
		swedishQuotes: dedupeAcrossAngles(swedishGroups, (q) => String(q.id)),
		swedishPassages: dedupeAcrossAngles(swedishBookGroups, (p) => String(p.id)),
		counts: {
			quotesTotal: quotesInv.total,
			booksTotal: booksInv.totalBooks,
			bookPassagesTotal: booksInv.totalPassages,
		},
	};
}

/** Strip OpenITI apparatus and collapse whitespace so a passage is readable in a prompt. */
function tidyArabic(text: string): string {
	return (
		cleanOpenITIText(text)
			// Page markers and milestone tags survive the OpenITI cleaner.
			.replace(/PageV\d+P\d+/g, " ")
			.replace(/\bms\d+\b/g, " ")
			.replace(/@QB@|@QE@/g, "")
			.replace(/[~#%]{2,}/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	);
}

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

/** ⚠️ The Swedish verse text in quran.db comes from a scan of the print edition and is
 *  NOT clean: words are split at the original line breaks ("dött rar" for döttrar,
 *  "kvinn folk" for kvinnfolk, "kläd nad" for klädnad) and Bernström's inline glosses are
 *  appended to the verse body, each opening with a repeat of the phrase it glosses.
 *
 *  Only the trailing translation sigla are stripped here. Rejoining split words would
 *  mean guessing where a space is legitimate, and a wrong guess corrupts scripture — so
 *  the rest is flagged for the author to repair against a clean source instead. */
function tidyVerse(text: string): string {
	return oneLine(text).replace(/\s*\((?:[TBKÖ][^)]{0,12})\)\s*$/u, "");
}

/** Render each angle's group with its own ranking intact. */
function renderGroups<T>(groups: AngleResult<T>[], body: (hit: T) => string, noun: string): string {
	return groups
		.map(
			(g) => `**Sökning: »${g.query}«** (${g.hits.length} ${noun})

${g.hits.map(body).join("\n\n")}`,
		)
		.join("\n\n");
}

/** The brief as prompt content. Deliberately explicit that this is raw material to be
 *  verified, not quotable copy, and grouped per search so a weak angle is visible
 *  instead of silently poisoning the pool. */
export function formatCorpusBrief(brief: CorpusBrief): string {
	const out: string[] = [];

	out.push(`# KORPUSMATERIAL FÖR »${brief.term}«

Hämtat maskinellt ur husets egna databaser (${brief.counts.quotesTotal} citat, ${brief.counts.booksTotal} böcker /
${brief.counts.bookPassagesTotal} passager, Koranen på svenska). Detta är sidans unika material – ingen
konkurrent har det.

⚠️ ALLT NEDAN ÄR RÅMATERIAL SOM SKA VERIFIERAS, INTE FÄRDIGA CITAT.
- I citatdatabasen är \`Attribution\` **bokens** författare, inte nödvändigtvis den som
  talar i citatet, och texten är ofta en parafras. Ungefär en av tre faller vid kontroll.
- De arabiska passagerna är råtext ur OpenITI-utgåvor, städade men inte korrekturlästa.
- Använd ALDRIG något härifrån som ordagrant citat utan att först ha kontrollerat
  ordalydelse och talare mot källan (\`mcp__quotes__get_quote_by_id\`, \`search_books\`,
  WebFetch mot utgåvan). Presentera aldrig en parafras som ett ordagrant citat.
- Materialet är ett GOLV, inte en gräns: sök vidare själv med MCP-verktygen.

⚠️ TRÄFFARNA ÄR GRUPPERADE PER SÖKNING, OCH DET ÄR AVSIKTLIGT. Likhetspoängen går inte
att jämföra mellan sökningar: allt landar mellan 0,83 och 0,86 oavsett relevans, och den
sökning som gav rent brus gav de HÖGSTA poängen. Bedöm därför varje grupp för sig, och
räkna med att en hel grupp kan vara oanvändbar.
`);

	if (brief.pinned.verses.length > 0 || brief.pinned.missing.length > 0) {
		out.push(`## Kärntexterna i Koranen (hämtade på referens, inte via sökning)

Dessa verser är ämnets loci classici och SKA behandlas i texten.

⚠️ CITERA INTE VERSTEXTEN NEDAN ORDAGRANT. Den är inläst ur den tryckta utgåvan och
bär spår av det: ord är delade vid den ursprungliga radbrytningen (»dött rar« för
döttrar, »kvinn folk« för kvinnfolk, »kläd nad« för klädnad), och Bernströms
förklarande noter ligger inklistrade efter versen, var och en inledd med en upprepning
av det uttryck den förklarar. Hämta den rena lydelsen från
quran.com/<sura>/<vers>?translations=48 (samma Bernström-översättning som svarssidorna
länkar) innan du sätter ett blockcitat.

${brief.pinned.verses
	.map(
		(v) =>
			`### ${v.surahNameSwedish} ${v.surahNumber}:${v.verseNumber}
${tidyVerse(v.textSwedish)}`,
	)
	.join("\n\n")}
${
	brief.pinned.missing.length > 0
		? `\n⚠️ Saknas i databasen och måste hämtas på annat sätt: ${brief.pinned.missing.join(", ")}.\n`
		: ""
}`);
	}

	if (brief.verses.length > 0) {
		out.push(`## Fler koranverser funna via sökning (svensk översättning: Knut Bernström)

${renderGroups(
	brief.verses,
	(v) =>
		`### ${v.surahNameSwedish} ${v.surahNumber}:${v.verseNumber}
${tidyVerse(v.textSwedish)}`,
	"verser",
)}
`);
	}

	if (brief.arabicPassages.length > 0) {
		out.push(`## Passager ur de arabiska klassikerna

Nyöversätt till svenska själv. ⚠️ \`Källa\` är boken passagen står i; vem som TALAR i
passagen måste du avgöra av innehållet (en hadith citerad av Ibn al-Qayyim ska
attribueras till hadithsamlingen, inte till Ibn al-Qayyim).

${renderGroups(
	brief.arabicPassages,
	(p) =>
		`### ${p.bookTitle} — ${p.bookAuthor}${p.chapterTitle ? `, »${p.chapterTitle}«` : ""} [passage-id ${p.id}]
${tidyArabic(p.text).slice(0, 900)}`,
	"passager",
)}
`);
	}

	if (brief.swedishQuotes.length > 0) {
		out.push(`## Svensk litteratur och idéhistoria (bryggan)

Materialet till avsnittet om ämnet i svensk idéhistoria. ⚠️ Avsnittet ska BESKRIVA en
svensk idéhistoria, aldrig argumentera för islams position genom den – falsk ekvivalens
är den enskilt största risken i den här texten. Kontrollera varje citat mot verket
innan du använder det.

${renderGroups(
	brief.swedishQuotes,
	// `attribution` already arrives with a leading em dash from the search layer.
	(q) =>
		`### citat-id ${q.id} — ${q.attribution.replace(/^[—–-]\s*/, "")} (bokens författare)
»${oneLine(q.text)}«`,
	"citat",
)}
`);
	}

	if (brief.swedishPassages.length > 0) {
		out.push(`## Längre svenska bokpassager (LÅG träffsäkerhet — granska hårt)

Den svenska halvan av bokdatabasen svarar dåligt på tematiska sökningar; förvänta dig
att det mesta här är irrelevant.

${renderGroups(
	brief.swedishPassages,
	(p) =>
		`### ${p.bookTitle} — ${p.bookAuthor}${p.chapterTitle ? `, »${p.chapterTitle}«` : ""}
${oneLine(p.text).slice(0, 600)}`,
	"passager",
)}
`);
	}

	return out.join("\n");
}
