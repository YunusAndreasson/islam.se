// The client half of the news surfaces.
//
// It has two jobs, and which one it does depends on what the page already has:
//
//   /            renders the news bar under the lead from scratch. Nothing on
//                the front page is edge-injected — the homepage is this site's
//                most important document and it does not get a fetch-dependent
//                Function in front of it.
//
//   /nyheter/    normally has nothing to do: `functions/nyheter/index.js`
//                already rendered the list at the edge. It re-labels the
//                relative timestamps against the reader's own clock (the edge
//                render may have been cached for minutes), resolves a
//                `#nyhet-…` deep link, and fills the list itself only if the
//                edge fetch failed.
//
// Boots on `astro:page-load`, not `DOMContentLoaded`: Base.astro ships
// <ClientRouter />, and a listener bound only to first load silently stops
// firing after the reader's first in-site navigation.
import {
	FEED_URL,
	FONSTER_H,
	inomFonster,
	listaHtml,
	RAIL_ANTAL,
	rangordna,
	statusHtml,
	tidsetiketter,
} from "../../functions/nyheter/_nyheter.js";

/** The payload shape is declared once, as a JSDoc typedef beside the renderer. */
type Nyhet = import("../../functions/nyheter/_nyheter.js").Nyhet;

/** One request feeds both surfaces and belongs to the current Astro page. */
function hamta(signal: AbortSignal): Promise<Nyhet[] | null> {
	return (
		fetch(FEED_URL, { headers: { accept: "application/json" }, signal })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => (Array.isArray(d?.artiklar) ? (d.artiklar as Nyhet[]) : null))
			// A blocked or failed cross-origin fetch is an ordinary outcome here —
			// a content blocker is enough to cause it — and it must degrade to "no
			// news", never to a console full of errors on the front page.
			.catch(() => null)
	);
}

/** Re-label the relative times against the clock in front of the reader. The
 *  edge render can be up to five minutes old, and "för 2 timmar sedan" that is
 *  quietly wrong is worse than no relative time at all. */
function uppdateraTider(rot: ParentNode): void {
	const nu = Date.now();
	for (const el of rot.querySelectorAll<HTMLElement>(".nyhet-relativ")) {
		const iso = el.dataset.datum;
		if (!iso) continue;
		el.textContent = tidsetiketter({ datum: iso }, nu).relativ;
	}
}

function fyll(lista: HTMLElement, artiklar: Nyhet[], variant: "rail" | "full"): void {
	lista.innerHTML = listaHtml(artiklar, { variant, now: Date.now() });
	lista.removeAttribute("aria-busy");
}

/** The count and the freshness line above the list. Only /nyheter/ carries it —
 *  the rail states neither, because it is openly a selection and a count of a
 *  selection answers nothing. */
function fyllStatus(artiklar: Nyhet[]): void {
	const status = document.getElementById("nyheter-status");
	if (!status) return;
	const html = statusHtml(artiklar, Date.now());
	if (!html) return;
	status.innerHTML = html;
	status.hidden = false;
}

/** The deep link. A shared `/nyheter/#nyhet-<slug>` outlives the item it points
 *  at — the payload holds 48h and the list shows 24 — so the miss is designed
 *  for rather than left to 404 into silence: the reader is handed the same
 *  story on zuhd.news, where it keeps a permanent home. */
function losUppLank(signal: AbortSignal): void {
	const hash = location.hash;
	if (!hash.startsWith("#nyhet-")) return;
	const slug = hash.slice("#nyhet-".length);
	// zuhd's slugs are `YYYY-MM-DD-kebab-case` and nothing else. Validating here
	// rather than escaping keeps a hand-edited hash out of both the id lookup
	// and the zuhd.news URL built from it below.
	if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) return;
	const traff = document.getElementById(`nyhet-${slug}`);
	if (traff) {
		traff.scrollIntoView({ block: "center", behavior: "smooth" });
		traff.classList.add("nyhet--utpekad");
		markeraTillfalligt(traff, signal);
		return;
	}
	const notis = document.getElementById("nyheter-passerad");
	if (!notis) return;
	const lank = notis.querySelector("a");
	if (lank) lank.setAttribute("href", `https://zuhd.news/s/${slug}`);
	notis.hidden = false;
}

/**
 * The landing mark is a signal, not a state.
 *
 * It answers one question — "which of these fifty near-identical notices did the
 * link mean?" — and once the reader has started reading, it has been answered.
 * Left on, it becomes an unexplained tinted band that outlives its own meaning,
 * which is precisely how it reads to someone who did not watch the page arrive.
 *
 * Cleared on the reader's first deliberate move. Deliberately NOT on `scroll`:
 * the smooth `scrollIntoView` above fires scroll events itself, so a scroll
 * listener would erase the mark before the reader ever saw it. `wheel`,
 * `touchstart`, `pointerdown` and `keydown` are the reader and only the reader.
 */
function markeraTillfalligt(el: HTMLElement, signal: AbortSignal): void {
	const rensa = () => el.classList.remove("nyhet--utpekad");
	for (const typ of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
		window.addEventListener(typ, rensa, { once: true, passive: true, signal });
	}
}

/** Upgrade the share anchors. Delegated once per list rather than bound per
 *  row, because the rows can be replaced under us: the edge renders them, and a
 *  failed edge fetch means the client re-renders the lot. */
function kopplaDelning(rot: HTMLElement): void {
	if (rot.dataset.delningKopplad === "1") return;
	rot.dataset.delningKopplad = "1";
	rot.addEventListener("click", (e) => {
		const lank = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>("[data-dela]");
		if (!lank) return;
		const url = new URL(lank.getAttribute("href") ?? "", location.href).href;
		const titel = lank.closest("li")?.querySelector(".nyhet-titel")?.textContent ?? "";
		const tillbaka = () => {
			// The anchor's own behaviour is the fallback throughout: the fragment
			// lands in the address bar and the link has still done its job.
			location.hash = `#nyhet-${lank.dataset.dela}`;
		};
		e.preventDefault();
		if (navigator.share) {
			navigator.share({ title: titel, url }).catch(tillbaka);
			return;
		}
		const skrivbord = navigator.clipboard?.writeText(url);
		if (!skrivbord) {
			tillbaka();
			return;
		}
		skrivbord
			.then(() => {
				const fore = lank.textContent;
				lank.textContent = "Länk kopierad";
				setTimeout(() => {
					lank.textContent = fore;
				}, 2000);
			})
			.catch(tillbaka);
	});
}

async function boot(signal: AbortSignal): Promise<void> {
	const rail = document.querySelector<HTMLElement>('[data-nyheter="rail"]');
	const full = document.querySelector<HTMLElement>('[data-nyheter="full"]');
	if (!(rail || full)) return;

	// The edge already did the work: nothing to fetch, nothing to paint.
	if (full && full.dataset.nyheterKalla === "edge") {
		// The status line carries a `.nyhet-relativ` of its own, and it is outside
		// the list — so the re-labelling has to run over the section, not the <ol>.
		uppdateraTider(document);
		kopplaDelning(full);
		losUppLank(signal);
		return;
	}

	const artiklar = await hamta(signal);
	// Cancellation can race with a fulfilled response. Never paint into a later page.
	if (signal.aborted) return;
	const iFonster = artiklar ? inomFonster(artiklar, Date.now(), FONSTER_H) : [];

	if (rail) {
		// The bar holds its place from the first paint and is shown only when it has
		// rows (nyheter.css, »The front page's news bar«). With nothing to show it is
		// taken out: on a reference site an empty news frame reads as a broken page,
		// and there is no way for the reader to tell that it is simply a quiet day.
		//
		// Ranked, then re-sorted by time. zuhd publishes ~55 a day, so six rows is
		// a selection and something has to choose — `rangordna` picks the ones that
		// matter to this site's reader. But a news bar that is not in time order is
		// not one, so the chosen rows are shown newest first.
		const ram = document.getElementById("nyheter-rail");
		if (iFonster.length > 0) {
			const valda = rangordna(iFonster).slice(0, RAIL_ANTAL);
			fyll(rail, inomFonster(valda, Date.now(), FONSTER_H), "rail");
			ram?.setAttribute("data-lage", "klar");
		} else {
			ram?.setAttribute("data-lage", "tom");
		}
	}

	if (full) {
		const sektion = document.getElementById("nyheter-sektion");
		const tom = document.getElementById("nyheter-tom");
		if (iFonster.length > 0) {
			fyll(full, iFonster, "full");
			fyllStatus(iFonster);
			kopplaDelning(full);
			if (tom) tom.hidden = true;
			sektion?.removeAttribute("hidden");
		} else {
			full.removeAttribute("aria-busy");
			// ⚠️ Two different silences, and they must not read the same.
			//   artiklar === null → the fetch FAILED. Say so, and point at zuhd.
			//   artiklar present but empty → a quiet day. The feed is healthy and there is
			//     simply nothing inside the window; telling the reader it »kunde inte
			//     hämtas« would be false. Stay hidden, exactly as the rail does.
			if (artiklar === null && tom) {
				tom.hidden = false;
				sektion?.removeAttribute("hidden");
			}
		}
		losUppLank(signal);
	}
}

let page: AbortController | undefined;
document.addEventListener("astro:before-swap", () => page?.abort());
document.addEventListener("astro:page-load", () => {
	page?.abort();
	page = new AbortController();
	boot(page.signal);
});
