// TABS ON THE FRONT PAGE — one behaviour for every set of them: the essays by ämne
// (AmnenHome) and the AI-barometern's findings (BarometerRail).
//
// The markup is a list of links and a list of panels, and works as that without this
// script: the first panel is served open, the others carry `hidden`, and every tab is a
// real link to the page its panel is a glimpse of. Here the links become a tablist: a
// click (without a modifier, so »open in new tab« still opens the page) or an arrow key
// swaps the panel in place.
//
//   [data-home-tabs]   the set: one tablist and its panels
//   .home-tabs         the tablist (layout.css draws it)
//   [data-tab]         a tab, in the panels' order
//   [data-tab-panel]   a panel; needs an id

/** The tab a key moves to from tab `index` of `count`, or undefined for any other key.
 *  Space re-selects the focused tab. */
function keyTarget(key: string, index: number, count: number): number | undefined {
	switch (key) {
		case "ArrowRight":
		case "ArrowDown":
			return (index + 1) % count;
		case "ArrowLeft":
		case "ArrowUp":
			return (index - 1 + count) % count;
		case "Home":
			return 0;
		case "End":
			return count - 1;
		case " ":
			return index;
		default:
			return undefined;
	}
}

function initHomeTabs(): void {
	for (const set of document.querySelectorAll<HTMLElement>("[data-home-tabs]")) {
		if (set.dataset.ready) continue;
		set.dataset.ready = "true";
		const tabs = [...set.querySelectorAll<HTMLAnchorElement>("[data-tab]")];
		const panels = [...set.querySelectorAll<HTMLElement>("[data-tab-panel]")];
		if (tabs.length === 0 || tabs.length !== panels.length) continue;
		const row = set.querySelector<HTMLElement>(".home-tabs");
		row?.setAttribute("role", "tablist");

		// On a phone the row scrolls sideways (layout.css); a tab the reader chooses is
		// brought whole into it. The row's own scroll, never scrollIntoView, which would
		// scroll the page as well, and only on the reader's choice: select(0) runs on
		// every load and must not move anything.
		const reveal = (tab: HTMLElement) => {
			if (!row || row.scrollWidth <= row.clientWidth) return;
			const style = getComputedStyle(row);
			const start = row.getBoundingClientRect().left + Number.parseFloat(style.paddingInlineStart);
			const end = row.getBoundingClientRect().right - Number.parseFloat(style.paddingInlineEnd);
			const box = tab.getBoundingClientRect();
			if (box.left < start) row.scrollBy({ left: box.left - start, behavior: "smooth" });
			else if (box.right > end) row.scrollBy({ left: box.right - end, behavior: "smooth" });
		};

		const select = (index: number, focus = false) => {
			tabs.forEach((tab, i) => {
				const selected = i === index;
				tab.setAttribute("aria-selected", String(selected));
				tab.dataset.selected = String(selected);
				tab.tabIndex = selected ? 0 : -1;
				const panel = panels[i];
				if (panel) panel.hidden = !selected;
			});
			if (focus) tabs[index]?.focus({ preventScroll: true });
		};

		tabs.forEach((tab, index) => {
			const panel = panels[index];
			if (!panel) return;
			tab.setAttribute("role", "tab");
			tab.setAttribute("aria-controls", panel.id);
			panel.setAttribute("role", "tabpanel");
			panel.setAttribute("aria-labelledby", tab.id);
			tab.addEventListener("click", (event) => {
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
				event.preventDefault();
				select(index);
				reveal(tab);
			});
			tab.addEventListener("keydown", (event) => {
				const next = keyTarget(event.key, index, tabs.length);
				if (next === undefined) return;
				event.preventDefault();
				select(next, true);
				const chosen = tabs[next];
				if (chosen) reveal(chosen);
			});
		});
		select(0);
	}
}

document.addEventListener("astro:page-load", initHomeTabs);
