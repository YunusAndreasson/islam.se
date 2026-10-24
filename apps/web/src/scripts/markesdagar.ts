// Keeps every calendar list on the page honest about "upcoming".
//
// The rows are generated at build time and the site is deployed by hand, so a
// list left alone starts showing observances that have already passed — §7.9's
// standing caveat. Each list is re-filtered against the real Date.now() on load.
//
// ⚠️ This replaces an inline script in Markesdagar.astro that read
// `document.querySelector(".md-list")` — FIRST match only — with a hard-coded
// count of five. That was correct while exactly one such list could exist per
// page, and stopped being correct the moment the front page grew a second one in
// the news rail: the rail's three rows would have been governed by the year
// page's five, or not refreshed at all depending on which list came first in the
// DOM. Each list now declares its own `data-max` and every list gets walked.

import { localIsoDate } from "../lib/daily";
import { untilLabel } from "../lib/markesdagar";
import { onPage } from "./page";

function uppdatera(): void {
	const idag = localIsoDate();

	for (const list of document.querySelectorAll<HTMLElement>(".md-list[data-max]")) {
		const max = Number.parseInt(list.dataset.max ?? "0", 10);
		let visade = 0;
		for (const row of list.querySelectorAll<HTMLElement>("[data-end]")) {
			const keep = (row.dataset.end ?? "") >= idag && visade < max;
			row.hidden = !keep;
			// The rail's countdown belongs to the first row still to come.
			const until = row.querySelector<HTMLElement>("[data-until]");
			if (until) {
				const start = row.querySelector("time")?.getAttribute("datetime") ?? "";
				until.textContent =
					keep && visade === 0 && start ? untilLabel(start, row.dataset.end, idag) : "";
			}
			if (keep) visade++;
		}
	}
}

onPage(uppdatera);
