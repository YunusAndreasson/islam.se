// The news vocabulary's contract. Both surfaces render from this module — the
// edge Function for /nyheter/ and the browser for the front-page band — so a
// bug here is a bug in the served HTML, not just in a component.
import { describe, expect, it } from "vitest";
import {
	dagetikett,
	esc,
	inomFonster,
	listaHtml,
	plattaLandslankar,
	RAIL_ANTAL,
	radHtml,
	rangordna,
	statusHtml,
	tid,
	tidsetiketter,
} from "./_nyheter.js";

const NU = Date.parse("2026-08-22T15:00:00Z");

const nyhet = (over: Record<string, unknown> = {}) => ({
	slug: "2026-08-22-en-nyhet",
	titel: "Iran väger anfall mot mål i Europa",
	stycken: [
		"Teheran — Insiders pekar ut [Bulgarien](country:BG) som mål.",
		"Båda är EU-territorium.",
	],
	plats: "Teheran",
	kategori: "politik",
	datum: "2026-08-22T13:00:00Z",
	addedAt: NU,
	kalla: "The Times of Israel",
	kallaUrl: "https://example.test/a",
	kartaUrl: "https://zuhd.news/s/2026-08-22-en-nyhet",
	lat: 35.6892,
	lng: 51.389,
	lander: ["IL"],
	region: "ME",
	...over,
});

describe("fönstret", () => {
	it("keeps the last day, newest first", () => {
		const artiklar = [
			nyhet({ slug: "gammal", datum: "2026-08-20T13:00:00Z" }),
			nyhet({ slug: "ny", datum: "2026-08-22T14:00:00Z" }),
			nyhet({ slug: "mitten", datum: "2026-08-22T09:00:00Z" }),
		];
		expect(inomFonster(artiklar, NU).map((a) => a.slug)).toEqual(["ny", "mitten"]);
	});

	// `addedAt` is zuhd's file mtime and moves whenever an article is corrected.
	// Ordering on it would jump a two-day-old story back to the top of the list
	// because somebody fixed a typo in it.
	it("orders on when it happened, not on when the file was last written", () => {
		const artiklar = [
			nyhet({ slug: "rattad", datum: "2026-08-22T08:00:00Z", addedAt: NU }),
			nyhet({ slug: "farsk", datum: "2026-08-22T14:00:00Z", addedAt: NU - 9e6 }),
		];
		expect(inomFonster(artiklar, NU).map((a) => a.slug)).toEqual(["farsk", "rattad"]);
	});

	it("falls back to addedAt when the date is unusable", () => {
		expect(tid({ datum: null, addedAt: 42 })).toBe(42);
		expect(tid({ datum: "inte ett datum", addedAt: 42 })).toBe(42);
	});
});

describe("rangordningen för startsidan", () => {
	// The front page of a site about islam should open on the Muslim world, not
	// on whichever chip fab happened to report. This is a choice about six rows:
	// /nyheter/ stays chronological and carries the same set.
	it("puts the Middle East above a tech story that is newer", () => {
		const artiklar = [
			nyhet({ slug: "teknik", region: "AM", kategori: "teknik", datum: "2026-08-22T14:00:00Z" }),
			nyhet({
				slug: "mellanostern",
				region: "ME",
				kategori: "politik",
				datum: "2026-08-22T09:00:00Z",
			}),
		];
		expect(rangordna(artiklar)[0]?.slug).toBe("mellanostern");
	});

	it("treats Swedish coverage as a strong signal", () => {
		const artiklar = [
			nyhet({ slug: "utan", region: "AM", kategori: "ekonomi", lander: ["US"] }),
			nyhet({ slug: "svensk", region: "AM", kategori: "ekonomi", lander: ["US", "SE"] }),
		];
		expect(rangordna(artiklar)[0]?.slug).toBe("svensk");
	});

	it("does not reorder the caller's array", () => {
		const artiklar = [nyhet({ slug: "a", region: "AM" }), nyhet({ slug: "b", region: "ME" })];
		rangordna(artiklar);
		expect(artiklar.map((a) => a.slug)).toEqual(["a", "b"]);
	});

	it("ranks without crashing on a story that carries no region or countries", () => {
		const artiklar = [nyhet({ region: null, lander: [], kategori: null })];
		expect(rangordna(artiklar)).toHaveLength(1);
	});
});

describe("landsmarkeringen", () => {
	// zuhd's `[Label](country:XX)` markup drives its own map affordances and has
	// no meaning here, but the label is ordinary prose — dropping the whole span
	// would delete the country from the sentence.
	it("keeps the label and drops the target", () => {
		expect(plattaLandslankar("ut [Bulgarien](country:BG) som")).toBe("ut Bulgarien som");
	});

	it("leaves prose without markup alone", () => {
		expect(plattaLandslankar("ingen markering här")).toBe("ingen markering här");
	});
});

describe("raden", () => {
	// The sidolinje is a news-day index, modelled on Sydsvenskan's Nyhetsdygnet:
	// a time, a category, a headline. Everything else belongs on /nyheter/.
	it("gives the rail a time, a category and a headline, and nothing else", () => {
		const html = radHtml(nyhet(), { variant: "rail", now: NU });
		expect(html).toContain("15:00");
		expect(html).toContain("Politik");
		expect(html).toContain("Iran väger anfall mot mål i Europa");
		expect(html).not.toContain("Båda är EU-territorium.");
		expect(html).not.toContain("nyhet-fot");
		expect(html).not.toContain("The Times of Israel");
	});

	// The bar sets a headline over its stamp, so the headline has the whole width of
	// its column: with the clock in front of it one headline in ten ended in an
	// ellipsis on the front page's thirds (2026-10-11). The order in the markup is the
	// order on the page, so a reader who hears the list hears it the way it is set.
	it("puts the rail's headline before its stamp", () => {
		const html = radHtml(nyhet(), { variant: "rail", now: NU });
		expect(
			html.indexOf("nyhet-titel"),
			"the bar's stylesheet lays a row out as headline, then stamp; the markup must be in that order",
		).toBeLessThan(html.indexOf("nyhet-meta"));
	});

	// The whole point of the redesign: the reader is sent inward, to the notice on
	// islam.se, not outward to a site they have never heard of.
	it("links the rail headline inward to /nyheter/, never to zuhd", () => {
		const html = radHtml(nyhet(), { variant: "rail", now: NU });
		expect(html).toContain('href="/nyheter/#nyhet-2026-08-22-en-nyhet"');
		expect(html).not.toContain("zuhd.news");
	});

	it("renders the whole notice on /nyheter/", () => {
		const html = radHtml(nyhet(), { variant: "full", now: NU });
		expect(html).toContain("Båda är EU-territorium.");
		expect(html).toContain("The Times of Israel");
		expect(html).toContain('id="nyhet-2026-08-22-en-nyhet"');
	});

	// »Se på kartan« named a mechanism the reader could not see — nobody knew what
	// map, or that zuhd.news was one — and it put an exit on every single notice.
	// The news is read here; zuhd is credited once per page in the colophon.
	it("puts no outbound link on any notice, on either surface", () => {
		for (const variant of ["rail", "full"] as const) {
			const html = radHtml(nyhet(), { variant, now: NU });
			expect(html).not.toContain("zuhd.news");
			expect(html).not.toContain("Se på kartan");
			expect(html).not.toContain("nyhet-karta");
		}
	});

	// zuhd writes the English wire's »Teheran — «. A Swedish notis opens with the
	// place in bold and a full stop; the dash version reads as a subtitle.
	it("sets the dateline the way Swedish news sets it", () => {
		const html = radHtml(nyhet(), { variant: "full", now: NU });
		expect(html).toContain('<p><b class="nyhet-plats">Teheran.</b> Insiders pekar ut');
		expect(html).not.toContain("Teheran —");
	});

	// A display transform, and it must not guess. A paragraph that opens with a
	// dash for any other reason keeps its first clause.
	it("leaves the paragraph alone when the place does not open it", () => {
		const utan = radHtml(nyhet({ plats: "Teheran", stycken: ["Kairo — något annat."] }), {
			variant: "full",
			now: NU,
		});
		expect(utan).toContain("<p>Kairo — något annat.</p>");
		expect(utan).not.toContain("nyhet-plats");
		const ingen = radHtml(nyhet({ plats: null }), { variant: "full", now: NU });
		expect(ingen).not.toContain("nyhet-plats");
	});

	it("keeps the source as a credit, not a link", () => {
		const html = radHtml(nyhet(), { variant: "full", now: NU });
		expect(html).toContain('<span class="nyhet-kalla">The Times of Israel</span>');
		expect(html).not.toContain('href="https://example.test/a"');
	});

	// Neither surface repeats a relative label per row. On the rail a bare HH:MM
	// is what a Swedish "senaste nytt" column shows; on /nyheter/ the column is in
	// time order and cut into I dag/I går, so nine copies of "för 7 timmar sedan"
	// state what the page already shows. Freshness is stated once, by statusHtml.
	it("leaves relative time out of the rows on both surfaces", () => {
		expect(radHtml(nyhet(), { variant: "rail", now: NU })).not.toContain("nyhet-relativ");
		expect(radHtml(nyhet(), { variant: "full", now: NU })).not.toContain("nyhet-relativ");
	});

	// The clock is the page's index, so it has to be structure rather than a token
	// in a meta line: its own column, ahead of the body, with the category under
	// it. A row that puts it back inside the prose cannot be scanned down the
	// margin, which is the one thing this layout is for.
	it("gives /nyheter/ a clock column ahead of the notice", () => {
		const html = radHtml(nyhet(), { variant: "full", now: NU });
		expect(html).toContain(
			'<div class="nyhet-tid"><time class="nyhet-klocka" datetime="2026-08-22T13:00:00.000Z">15:00</time><span class="nyhet-kategori">Politik</span></div>',
		);
		expect(html.indexOf("nyhet-tid")).toBeLessThan(html.indexOf("nyhet-titel"));
	});

	// The payload is model-generated text arriving from another origin and is
	// written into the DOM with innerHTML. Escaping is not optional.
	it("escapes every field it interpolates", () => {
		const html = radHtml(
			nyhet({
				titel: '<img src=x onerror="alert(1)">',
				kalla: "<script>",
				stycken: ["Teheran — <b>fet</b>"],
			}),
			{ variant: "full", now: NU },
		);
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<b>");
		expect(html).toContain("&lt;img");
	});

	// zuhd can carry `[Bulgarien](country:BG)` markup in the title as well as the
	// body; escaping alone would ship the raw source string as a headline.
	it("flattens country markup in the title", () => {
		const html = radHtml(nyhet({ titel: "[Bulgarien](country:BG) väger anfall" }), {
			variant: "rail",
			now: NU,
		});
		expect(html).toContain("Bulgarien väger anfall");
		expect(html).not.toContain("country:BG");
	});

	it("survives a notice with no source", () => {
		const html = radHtml(nyhet({ kalla: null }), { variant: "full", now: NU });
		expect(html).toContain("nyhet-titel");
		expect(html).toContain("Dela");
	});

	it("renders a list of rows", () => {
		const html = listaHtml([nyhet({ slug: "a" }), nyhet({ slug: "b" })], { now: NU });
		expect(html.match(/<li /g)).toHaveLength(2);
	});
});

describe("tiderna", () => {
	// Workers run in UTC. An implicit timezone would print the wrong hour into
	// the edge-rendered HTML for every Swedish reader, and nothing in the page
	// would look broken.
	it("prints Stockholm time, not UTC", () => {
		// 13:00 UTC in August is 15:00 in Stockholm (CEST).
		expect(tidsetiketter({ datum: "2026-08-22T13:00:00Z" }, NU).klocka).toBe("15:00");
	});

	it("says how long ago in Swedish", () => {
		expect(tidsetiketter({ datum: "2026-08-22T13:00:00Z" }, NU).relativ).toMatch(/2 timmar/);
		expect(tidsetiketter({ datum: "2026-08-22T14:45:00Z" }, NU).relativ).toMatch(/minut/);
		expect(tidsetiketter({ datum: "2026-08-21T13:00:00Z" }, NU).relativ).toMatch(/går/);
	});
});

describe("esc", () => {
	it("neutralises the four characters that matter in an HTML attribute", () => {
		expect(esc('<>&"')).toBe("&lt;&gt;&amp;&quot;");
		expect(esc(null)).toBe("");
	});
});

// The front page's bar is a glance at the day, not a wire: at twelve bold headlines
// the news was the loudest thing on the page (2026-09-25); zuhd publishes ~55/day,
// and "Alla nyheter →" is what carries the rest.
//
// Six is also a layout contract. The bar holds its place before the fetch lands, at
// the height of two rows of thirds on a wide screen, three rows of halves on a tablet
// and six notices in one column (`--remsa-rader` in nyheter.css). A seventh notice
// would open a row the page did not hold a place for, and the essays under the bar
// would move when the news arrived.
it("keeps the front page's news to the six rows its bar holds a place for", () => {
	expect(
		RAIL_ANTAL,
		"the news bar reserves room for six headlines; more shift the page when the fetch lands, and nyheter.css must be changed with the count",
	).toBeLessThanOrEqual(6);
});

describe("nyhetsdygnet", () => {
	// The defect this grouping exists to fix. A 24-hour window crosses midnight,
	// so a strictly chronological column of bare clock times runs 05:19, 00:03,
	// 21:56 — the numbers appear to go backwards, and without a day boundary
	// nothing on the page explains why.
	it("cuts the list at midnight, in Stockholm", () => {
		const artiklar = [
			nyhet({ slug: "morgon", datum: "2026-08-22T03:19:00Z" }),
			// 01:00 Stockholm on the 22nd — the same Swedish day as the row above,
			// and a UTC-keyed grouping would have put it with the row below.
			nyhet({ slug: "strax-efter-midnatt", datum: "2026-08-21T23:00:00Z" }),
			nyhet({ slug: "kvall", datum: "2026-08-21T19:56:00Z" }),
		];
		const html = listaHtml(artiklar, { variant: "full", now: NU });
		const dagar = [...html.matchAll(/<h3 class="nyheter-dagrubrik">([^<]*)</g)].map((m) =>
			(m[1] ?? "").trim(),
		);
		expect(dagar).toEqual(["I dag", "I går"]);
		expect(html.indexOf("strax-efter-midnatt")).toBeLessThan(html.indexOf('">I går '));
	});

	// The same backwards-clock defect, in the one place a day heading will not
	// fit: the rail is a day long, so its last rows are yesterday's, and a bare
	// 21:56 under a 00:03 reads as a list that has lost its order.
	it("stamps the day onto the rail's clock once it is no longer today", () => {
		const igar = radHtml(nyhet({ datum: "2026-08-21T19:56:00Z" }), {
			variant: "rail",
			now: NU,
		});
		expect(igar).toContain(">I går 21:56</time>");
		expect(radHtml(nyhet(), { variant: "rail", now: NU })).toContain(">15:00</time>");
	});

	it("keeps the rail a flat list with no day headings", () => {
		const html = listaHtml([nyhet()], { variant: "rail", now: NU });
		expect(html).not.toContain("nyheter-dagrubrik");
		expect(html.startsWith("<li")).toBe(true);
	});

	// Three calendar days can fall inside 24 hours for a reader who arrives just
	// after midnight. Two headings both reading "I går" would be worse than none.
	it("names anything older than yesterday by its weekday", () => {
		expect(dagetikett(Date.parse("2026-08-22T13:00:00Z"), NU)).toBe("I dag");
		expect(dagetikett(Date.parse("2026-08-21T13:00:00Z"), NU)).toBe("I går");
		expect(dagetikett(Date.parse("2026-08-20T13:00:00Z"), NU)).toBe("torsdag");
	});

	// How much is here and how fresh it is — the two questions a reader asks of a
	// news page, and the ones an unbounded column cannot answer.
	it("states the count and the newest item", () => {
		const html = statusHtml([nyhet({ datum: "2026-08-22T14:30:00Z" }), nyhet()], NU);
		expect(html).toContain('<span class="nyheter-antal">2</span> notiser');
		expect(html).toContain("uppdaterad");
		// Re-uses the class the client script already re-labels, so an edge render
		// cached for five minutes corrects itself with no new machinery.
		expect(html).toContain('class="nyhet-relativ" data-datum="2026-08-22T14:30:00.000Z"');
	});

	it("declines to state a count of nothing", () => {
		expect(statusHtml([], NU)).toBe("");
	});

	it("says notis, not notiser, for one", () => {
		expect(statusHtml([nyhet()], NU)).toContain("</span> notis ");
	});
});
