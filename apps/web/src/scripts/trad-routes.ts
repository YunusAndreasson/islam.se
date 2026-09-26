// Fills the stops on the front page's trådar that the reader has already read, and
// says how far along each route they are. Progress lives in localStorage (see
// reading-progress.ts), so this is the one part of the movement that cannot be
// rendered at build time; without it the routes are simply all unread.
//
// Boots on `astro:page-load`, not DOMContentLoaded: Base.astro ships <ClientRouter />,
// and a reader who finishes an essay and comes back to the front page arrives by a
// client navigation, which never fires DOMContentLoaded again.
import { hasRead } from "./reading-progress";

function markRoutes(): void {
	for (const route of document.querySelectorAll<HTMLElement>(".trad-route")) {
		const stops = route.querySelectorAll<HTMLElement>(".trad-stop[data-slug]");
		let read = 0;
		for (const stop of stops) {
			const done = hasRead(stop.dataset.slug ?? "");
			stop.toggleAttribute("data-read", done);
			// The filled dot is the visible mark; this word is the one a screen
			// reader gets, since a dot changing colour is announced by nothing.
			const flag = stop.querySelector<HTMLElement>(".trad-stop-flag");
			if (flag) flag.hidden = !done;
			if (done) read++;
		}
		const progress = route.querySelector<HTMLElement>(".trad-progress");
		if (progress) {
			progress.hidden = read === 0;
			progress.textContent =
				read === stops.length ? "Hela tråden läst" : `${read} av ${stops.length} lästa`;
		}
	}
}

document.addEventListener("astro:page-load", markRoutes);
