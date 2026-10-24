// Marks the parts of the front page's essäserier that the reader has already read, and
// says how far along each series they are. A part is anything in the series' panel that
// carries a slug: the three cards that are shown, and the markers for the parts that
// are not (TradarHome.astro), so »2 av 6 lästa« counts the whole series. Progress lives in localStorage (see
// reading-progress.ts), so this is the one part of the movement that cannot be
// rendered at build time; without it the routes are simply all unread.
//
// Runs on every page, not on DOMContentLoaded: Base.astro ships <ClientRouter />, and a
// reader who finishes an essay and comes back to the front page arrives by a client
// navigation, which never fires DOMContentLoaded again (read-state.ts, onReadMarks).
import { onReadMarks } from "./read-state";
import { hasRead } from "./reading-progress";

function markRoutes(): void {
	for (const route of document.querySelectorAll<HTMLElement>(".trad-route")) {
		const stops = route.querySelectorAll<HTMLElement>("[data-slug]");
		let read = 0;
		for (const stop of stops) {
			const done = hasRead(stop.dataset.slug ?? "");
			// The muted title is the visible step back; the card's own number then
			// reads »Del 2 · läst« (TradarHome's styles), which says why.
			stop.toggleAttribute("data-read", done);
			if (done) read++;
		}
		const progress = route.querySelector<HTMLElement>(".trad-progress");
		if (progress) {
			progress.hidden = read === 0;
			progress.textContent =
				read === stops.length ? "Hela serien läst" : `${read} av ${stops.length} lästa`;
		}
	}
}

onReadMarks(markRoutes);
