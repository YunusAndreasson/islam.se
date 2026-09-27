// The news vocabulary, shared by the two surfaces that render it.
//
// Two consumers, one renderer:
//   - `functions/nyheter/index.js` injects the list into the built /nyheter/
//     page at the edge, so crawlers and JS-less readers get real HTML.
//   - `src/scripts/nyheter.ts` renders the "Världen just nu" sidolinje on the front
//     page in the browser.
//
// It lives here rather than in `src/lib/` because a Pages Function is bundled
// by wrangler and cannot reach into the Astro source tree, while Astro can
// import a plain relative module from anywhere. The underscore prefix is this
// project's existing "not a route" marker (`functions/api/_corrections.js`).
//
// Framework-free and dependency-free on purpose: it has to run inside a
// Worker, inside Vite's browser bundle, and inside vitest.

/**
 * One notice, as `/api/sv/feed.json` carries it. Swedish keys throughout —
 * zuhd's payload is Swedish-only by design, so there is no English `title`
 * sitting beside `stycken` for anyone to render by mistake.
 *
 * @typedef {object} Nyhet
 * @property {string} slug        zuhd's `YYYY-MM-DD-kebab-case` id
 * @property {string} titel
 * @property {string[]} stycken   the body, one entry per paragraph
 * @property {string|null} plats  the dateline city, Swedish exonym. zuhd keeps
 *   the ENGLISH `location` on its own side so its map matching still works; this
 *   is the display name, and `stycken[0]` opens with it.
 * @property {string|null} kategori  politik | ekonomi | vetenskap | teknik
 * @property {string|null} datum  ISO 8601, when it happened
 * @property {number} addedAt     when zuhd last wrote the file
 * @property {string|null} kalla
 * @property {string|null} kallaUrl
 * @property {string[]} lander    ISO-2 of the SOURCES, not of the story
 * @property {string|null} region coarse continent bucket of the dateline
 * @property {number|null} lat
 * @property {number|null} lng
 * @property {string|null} kartaUrl  the story on zuhd's map
 */

/** zuhd's Swedish payload. A new endpoint, not a changed one — zuhd's JSON
 *  APIs are a published contract with a live app behind them. */
export const FEED_URL = "https://zuhd.news/api/sv/feed.json";

/** What the reader sees. The payload carries 48h so a link shared yesterday
 *  evening still resolves this morning; the list only ever shows a day. */
export const FONSTER_H = 24;

/** How many the sidolinje shows.
 *
 *  Five, a product decision (2026-09-25). It was twelve, measured to fill the rail
 *  beside Ämnen to the last pixel — which made twelve bold world-politics headlines
 *  the loudest thing beside the essays, on a page whose subject is not the news.
 *  The rail is a glance at the day, not a wire; »Alla nyheter →« under it carries
 *  the ~55 a day zuhd publishes. The rail now simply ends where its three blocks
 *  end, and the departments beside it run on.
 *
 *  On a thin day the window holds fewer and the column is shorter — which is
 *  honest, and is why the count is a ceiling rather than a target. */
export const RAIL_ANTAL = 5;

export const KATEGORI_SV = {
	politik: "Politik",
	ekonomi: "Ekonomi",
	vetenskap: "Vetenskap",
	teknik: "Teknik",
};

/** Swedish readers read Swedish clocks. Workers run in UTC, so an implicit
 *  timezone would print the wrong hour into the edge-rendered HTML for every
 *  reader — the explicit zone is not optional here. */
const TIDSZON = "Europe/Stockholm";

const klockformat = new Intl.DateTimeFormat("sv-SE", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: TIDSZON,
});
const dagformat = new Intl.DateTimeFormat("sv-SE", {
	day: "numeric",
	month: "long",
	timeZone: TIDSZON,
});
/** `sv-SE` renders a bare date as `YYYY-MM-DD`, so this key both compares and
 *  sorts as a plain string — and it is computed in Stockholm, which is the
 *  whole point: the day a notice belongs to is the reader's day, not UTC's. */
const dagnyckelformat = new Intl.DateTimeFormat("sv-SE", { timeZone: TIDSZON });
const veckodagformat = new Intl.DateTimeFormat("sv-SE", {
	weekday: "long",
	timeZone: TIDSZON,
});
const relativformat = new Intl.RelativeTimeFormat("sv", { numeric: "auto" });

export function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * zuhd's inline `[Label](country:XX)` markup, reduced to its label.
 *
 * The markup drives zuhd's own map affordances and has no meaning here, but the
 * label is ordinary prose and dropping the whole span would delete the country
 * from the sentence. Applied before escaping, so a bracket in the label cannot
 * survive as markup.
 */
export function plattaLandslankar(text) {
	return String(text ?? "").replace(/\[([^\]]*)\]\(country:[A-Za-z]{2}\)/g, "$1");
}

/**
 * The last `timmar` hours of the payload, newest first.
 *
 * @param {Nyhet[]|null|undefined} artiklar
 * @param {number} [now]
 * @param {number} [timmar]
 * @returns {Nyhet[]}
 */
export function inomFonster(artiklar, now = Date.now(), timmar = FONSTER_H) {
	const cutoff = now - timmar * 3600_000;
	return (artiklar ?? [])
		.filter((a) => a && typeof a.slug === "string" && tid(a) >= cutoff)
		.sort((a, b) => tid(b) - tid(a));
}

/** When it happened. `datum` is the event; `addedAt` is when zuhd's file was
 *  last written, which moves whenever an article is corrected.
 *  @param {{datum?: string|null, addedAt?: number}} a */
export function tid(a) {
	const parsed = a?.datum ? Date.parse(a.datum) : Number.NaN;
	return Number.isNaN(parsed) ? Number(a?.addedAt) || 0 : parsed;
}

/**
 * What the front page leads with.
 *
 * islam.se is a reference site about islam, so its sidolinje should open on the
 * Muslim world and on Sweden rather than on whatever happened to break. This is
 * a presentation choice about six rows, not a filter: `/nyheter/` stays strictly
 * chronological and carries everything in the window.
 *
 * The signal is `region` — a coarse continent bucket derived from the dateline's
 * own coordinates, so it is where the story *is*. `lander` is deliberately used
 * only for the Sweden test: it lists the countries of the *sources*, not of the
 * story (the Iran-strikes piece cites Israeli, Australian, Indian, Greek and
 * Ukrainian outlets and no Iranian one), so it answers "did Swedish media cover
 * this" and nothing else.
 *
 * @param {Nyhet[]} artiklar
 * @returns {Nyhet[]}
 */
const REGIONVIKT = { ME: 4, AF: 2, AS: 2, EU: 1, AM: 0, OC: 0, GL: 0 };
const KATEGORIVIKT = { politik: 1, vetenskap: 0, ekonomi: -1, teknik: -1 };

/**
 * @param {Nyhet[]} artiklar
 * @returns {Nyhet[]}
 */
export function rangordna(artiklar) {
	const poang = (a) =>
		(REGIONVIKT[a.region] ?? 0) +
		(KATEGORIVIKT[a.kategori] ?? 0) +
		((a.lander ?? []).includes("SE") ? 3 : 0);
	// Sorted on a copy: the caller's array is the chronological record.
	return [...artiklar].sort((a, b) => poang(b) - poang(a) || tid(b) - tid(a));
}

/** Absolute time, relative time, and a machine-readable stamp.
 *  @param {{datum?: string|null, addedAt?: number}} a
 *  @param {number} [now] */
export function tidsetiketter(a, now = Date.now()) {
	const ms = tid(a);
	const d = new Date(ms);
	const minuter = Math.round((ms - now) / 60000);
	const relativ =
		Math.abs(minuter) < 60
			? relativformat.format(minuter, "minute")
			: Math.abs(minuter) < 60 * 24
				? relativformat.format(Math.round(minuter / 60), "hour")
				: relativformat.format(Math.round(minuter / 1440), "day");
	return {
		datetime: d.toISOString(),
		klocka: klockformat.format(d),
		dag: dagformat.format(d),
		relativ,
	};
}

/**
 * The dateline, set the way Swedish news sets it.
 *
 * zuhd writes the body as »Kryvyj Rih — En andra drönare slog till…«, which is
 * the English wire convention. A Swedish paper does not use a dash there: DN and
 * TT open a notis with the place in bold and a full stop — »**Kryvyj Rih.** En
 * andra drönare…« — and that is what a Swedish reader recognises as a notis at
 * all. The dash version read as a subtitle, not as a dateline.
 *
 * It is a display transform and nothing more. The prefix is only rewritten when
 * the payload's own `plats` field actually opens the paragraph, which zuhd's
 * `translationFault` already enforces; anything else is rendered untouched
 * rather than guessed at, because a paragraph that begins with a dash for some
 * other reason must not lose its first clause to a regex.
 *
 * @param {string} stycke
 * @param {string|null|undefined} plats
 * @param {(s: string) => string} text  the flatten-and-escape pipeline
 */
function forstaStycket(stycke, plats, text) {
	const prefix = plats ? `${plats} — ` : null;
	if (!(prefix && String(stycke ?? "").startsWith(prefix))) {
		return `<p>${text(stycke)}</p>`;
	}
	const resten = String(stycke).slice(prefix.length);
	return `<p><b class="nyhet-plats">${text(plats)}.</b> ${text(resten)}</p>`;
}

/**
 * One row.
 *
 * `variant: "rail"` is the sidolinje on the front page, and it is modelled on
 * the Swedish news-day index — Sydsvenskan's *Nyhetsdygnet* is the reference:
 * a time, a category, a headline, and nothing else. No summary, no source, no
 * body. It is a *list of what has happened*, scannable in a column 17rem wide,
 * and its headline links inward to /nyheter/ where the notice can be read.
 *
 * `variant: "full"` is that reading surface, where the whole article is four
 * short paragraphs and there is nothing to click through to; the row *is* the
 * article. This is what "nyheten displays på islam.se" means in practice — the
 * reader never has to leave to read the news.
 *
 * @param {Nyhet} a
 * @param {{variant?: "rail"|"full", now?: number}} [opts]
 * @returns {string}
 */
export function radHtml(a, { variant = "rail", now = Date.now() } = {}) {
	const t = tidsetiketter(a, now);
	const kategori = KATEGORI_SV[a.kategori] ?? null;
	const text = (s) => esc(plattaLandslankar(s));
	// ⚠️ text(), not esc(). zuhd can carry `[Bulgarien](country:BG)` markup in the
	// TITLE as well as the body, and escaping alone would ship the raw source
	// string as a headline.
	const titel = text(a.titel ?? "");

	if (variant === "rail") {
		// The sidolinje: time, category, headline. Nothing else, and deliberately —
		// this is a news-day index in a 17rem column, not a summary. The headline
		// links INWARD, to the notice on /nyheter/, because the news is read here.
		// No relative time either: a bare HH:MM is what a Swedish reader expects of
		// a "senaste nytt" column, and it needs no re-labelling as it ages.
		//
		// Except across midnight. The column is a day long, so its last rows are
		// yesterday's, and a bare clock runs 00:03 then 21:56 — the same backwards
		// sequence the day headings fix on /nyheter/. Here there is no room for a
		// heading, so the day rides on the stamp itself: »I går 21:56«.
		const dag = dagnyckel(tid(a)) === dagnyckel(now) ? "" : `${dagetikett(tid(a), now)} `;
		const meta = [
			`<time class="nyhet-klocka" datetime="${esc(t.datetime)}">${esc(dag)}${esc(t.klocka)}</time>`,
			kategori ? `<span class="nyhet-kategori">${esc(kategori)}</span>` : null,
		]
			.filter(Boolean)
			.join(' <span class="nyhet-skiljetecken" aria-hidden="true">·</span> ');
		return (
			'<li class="nyhet nyhet--rail">' +
			`<p class="label nyhet-meta">${meta}</p>` +
			`<h3 class="nyhet-titel"><a href="/nyheter/#nyhet-${esc(a.slug)}">${titel}</a></h3>` +
			"</li>"
		);
	}

	// /nyheter/ — the reading surface, and it is built as a news-day index rather
	// than as a stack of articles.
	//
	// The clock is not meta here, it is the STRUCTURE. It sits in its own column
	// down the left edge of the page and the reader scans it the way they scan the
	// hours in Sydsvenskan's *Nyhetsdygnet*: what was three grey tokens above a
	// headline — clock, freshness, category, all at one rung, all the same colour —
	// is now when-and-what-kind on the left, the notice on the right. At ~55
	// notices a day the flat version was a 20 000px column with no landmark in it;
	// this one can be read down the left margin alone.
	//
	// The relative label is gone from the row. Repeated once per notice down a
	// column that is already in time order and already cut into I dag/I går, "för 7
	// timmar sedan" tells the reader nothing they cannot see, and it was the widest
	// and loudest thing on the line. Freshness is stated once, at the top of the
	// page, by `statusHtml`.
	const tidkolumn =
		'<div class="nyhet-tid">' +
		`<time class="nyhet-klocka" datetime="${esc(t.datetime)}">${esc(t.klocka)}</time>` +
		(kategori ? `<span class="nyhet-kategori">${esc(kategori)}</span>` : "") +
		"</div>";

	const brodtext = (a.stycken ?? [])
		.map((stycke, i) => (i === 0 ? forstaStycket(stycke, a.plats, text) : `<p>${text(stycke)}</p>`))
		.join("");

	// The source is named in plain text, not linked. islam.se is where the news is
	// read; a link out on every notice turned the page into ten exits, and the one
	// sentence explaining where they led sat at the very bottom. zuhd.news is
	// credited once per page in the colophon instead — secondary, as it should be.
	//
	// Two ranks on one line, and they are two different things: the source is a
	// fact and carries no signifier, "Dela" is a control and carries the underline.
	// Set identically — which they were — the reader has to try one to learn which
	// is which.
	const kalla = a.kalla ? `<span class="nyhet-kalla">${esc(a.kalla)}</span>` : "";
	// Share is a real anchor to the notice's own fragment, not a button. With no
	// JavaScript it still does something useful — it puts the shareable URL in the
	// address bar — and the client script upgrades the click to a native share or
	// a clipboard copy. A <button> here would render as a control that does
	// nothing for a reader with JS off.
	const dela = `<a class="nyhet-dela" href="#nyhet-${esc(a.slug)}" data-dela="${esc(a.slug)}">Dela</a>`;
	const fot = `<p class="nyhet-fot">${[kalla, dela].filter(Boolean).join(' <span class="nyhet-skiljetecken" aria-hidden="true">·</span> ')}</p>`;

	return (
		`<li class="nyhet nyhet--full" id="nyhet-${esc(a.slug)}">` +
		tidkolumn +
		'<div class="nyhet-kropp">' +
		`<h3 class="nyhet-titel">${titel}</h3>` +
		brodtext +
		fot +
		"</div>" +
		"</li>"
	);
}

/** Which calendar day a notice belongs to, in Stockholm.
 *  @param {number} ms */
export function dagnyckel(ms) {
	return dagnyckelformat.format(new Date(ms));
}

/**
 * What a day heading says.
 *
 * The window is a day, so in practice this is only ever »I dag« and »I går«. The
 * weekday fallback is not decoration: a cycle that runs long, or a reader who
 * arrives at 00:20, can put three calendar days inside 24 hours, and two
 * headings both reading »I går« would be worse than no heading at all.
 *
 * @param {number} ms
 * @param {number} [now]
 */
export function dagetikett(ms, now = Date.now()) {
	const nyckel = dagnyckel(ms);
	if (nyckel === dagnyckel(now)) return "I dag";
	if (nyckel === dagnyckel(now - 86_400_000)) return "I går";
	return veckodagformat.format(new Date(ms));
}

/**
 * The two facts a news page has to state and this one did not: how much is here,
 * and how fresh it is.
 *
 * Without them the reader meets an unbounded column and has no way to judge
 * either — Norman's feedback gap, and the reason a news-day index always carries
 * a count and a timestamp. It reuses `.nyhet-relativ[data-datum]`, which the
 * client script already re-labels against the reader's own clock, so an
 * edge-cached »senast för 2 minuter sedan« corrects itself for free.
 *
 * @param {Nyhet[]} artiklar  in the order they are rendered, newest first
 * @param {number} [now]
 */
export function statusHtml(artiklar, now = Date.now()) {
	const antal = artiklar.length;
	if (antal === 0) return "";
	const t = tidsetiketter(artiklar[0], now);
	return (
		`<span class="nyheter-antal">${antal}</span> ${antal === 1 ? "notis" : "notiser"}` +
		' <span class="nyhet-skiljetecken" aria-hidden="true">·</span> ' +
		`uppdaterad <span class="nyhet-relativ" data-datum="${esc(t.datetime)}">${esc(t.relativ)}</span>`
	);
}

/**
 * The whole list.
 *
 * The rail is a flat run of rows. `/nyheter/` is cut into days, and that is a
 * correctness fix rather than a flourish: the window is 24 hours, so it crosses
 * midnight, and a strictly chronological column of bare clock times runs 05:19,
 * 00:03, 21:56 — the numbers go backwards and nothing on the page says why. The
 * day heading is what makes the sequence readable, and it doubles as the only
 * landmark in a column that is normally some 20 000px long.
 *
 * @param {Nyhet[]} artiklar
 * @param {{variant?: "rail"|"full", now?: number}} [opts]
 * @returns {string}
 */
export function listaHtml(artiklar, opts = {}) {
	const { variant = "rail", now = Date.now() } = opts;
	if (variant !== "full") return artiklar.map((a) => radHtml(a, opts)).join("");

	/** @type {{nyckel: string, ms: number, rader: Nyhet[]}[]} */
	const dagar = [];
	for (const a of artiklar) {
		const ms = tid(a);
		const nyckel = dagnyckel(ms);
		const sist = dagar[dagar.length - 1];
		// Grouped by adjacency, not by key: the caller's order is the record, and a
		// Map would quietly re-sort a list that arrived out of order rather than
		// showing it as it is.
		if (sist && sist.nyckel === nyckel) sist.rader.push(a);
		else dagar.push({ nyckel, ms, rader: [a] });
	}

	return dagar
		.map(
			(d) =>
				'<section class="nyheter-dag">' +
				// The space is not cosmetic: the flex row discards it, but a screen
				// reader reads the heading's text content, and without it the day
				// announces itself as "Idag22 augusti".
				`<h3 class="nyheter-dagrubrik">${esc(dagetikett(d.ms, now))} ` +
				`<span class="nyheter-dagdatum">${esc(dagformat.format(new Date(d.ms)))}</span>` +
				"</h3>" +
				`<ol class="nyheter-lista">${d.rader.map((a) => radHtml(a, opts)).join("")}</ol>` +
				"</section>",
		)
		.join("");
}
