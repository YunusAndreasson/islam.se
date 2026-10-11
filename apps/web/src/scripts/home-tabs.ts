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
function initHomeTabs(): void {
	for (const set of document.querySelectorAll<HTMLElement>("[data-home-tabs]")) {
		if (set.dataset.ready) continue;
		set.dataset.ready = "true";
		const tabs = [...set.querySelectorAll<HTMLAnchorElement>("[data-tab]")];
		const panels = [...set.querySelectorAll<HTMLElement>("[data-tab-panel]")];
		if (tabs.length === 0 || tabs.length !== panels.length) continue;
		set.querySelector(".home-tabs")?.setAttribute("role", "tablist");

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
			});
			tab.addEventListener("keydown", (event) => {
				let next: number;
				if (event.key === "ArrowRight" || event.key === "ArrowDown")
					next = (index + 1) % tabs.length;
				else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
					next = (index - 1 + tabs.length) % tabs.length;
				else if (event.key === "Home") next = 0;
				else if (event.key === "End") next = tabs.length - 1;
				else if (event.key === " ") next = index;
				else return;
				event.preventDefault();
				select(next, true);
			});
		});
		select(0);
	}
}

document.addEventListener("astro:page-load", initHomeTabs);
