import { filterFromUrl, matchesFilter, queryTerms, urlWithFilter } from "../lib/moskeer/filter";
import { onPage } from "./page";

// The directory remains useful while MapLibre loads, and if it never loads. The filter's
// rule is the map's (lib/moskeer/filter.ts); the map takes over once it is interactive.
onPage((signal) => {
	const page = document.querySelector<HTMLElement>(".moskeer");
	if (!page) return;
	const map = page.querySelector<HTMLElement>("#moskeer-map");
	const switcher = page.querySelector<HTMLElement>(".mk-view-switch");
	const buttons = page.querySelectorAll<HTMLButtonElement>("[data-mk-view]");
	const setView = (view: string) => {
		page.dataset.view = view;
		for (const button of buttons)
			button.setAttribute("aria-pressed", String(button.dataset.mkView === view));
		document.dispatchEvent(new CustomEvent("mosques:view-changed"));
	};
	if (switcher) switcher.hidden = false;
	setView("list");
	for (const button of buttons)
		button.addEventListener("click", () => setView(button.dataset.mkView ?? "list"), { signal });
	document.addEventListener("mosques:show-map", () => setView("map"), { signal });
	document.addEventListener("mosques:show-list", () => setView("list"), { signal });

	const search = page.querySelector<HTMLInputElement>("#mk-search");
	const county = page.querySelector<HTMLSelectElement>("#mk-lan");
	const rows = page.querySelectorAll<HTMLElement>(".mk-item");
	const linked = filterFromUrl(
		location.search,
		county ? Array.from(county.options, (o) => o.value) : [],
	);
	if (search) search.value = linked.raw;
	if (county) county.value = linked.lan;
	const filter = () => {
		if (map?.dataset.interactive === "true") return;
		const query = search?.value.trim() ?? "";
		const terms = queryTerms(query);
		const selected = county?.value ?? "";
		let count = 0;
		for (const row of rows) {
			const visible = matchesFilter(row.dataset.search ?? "", row.dataset.lan, terms, selected);
			row.parentElement?.toggleAttribute("hidden", !visible);
			if (visible) count++;
		}
		syncGroups(page, Boolean(query || selected));
		const countLabel = page.querySelector("#mk-count");
		if (countLabel) countLabel.textContent = `${count} ${count === 1 ? "moské" : "moskéer"}`;
		const empty = page.querySelector<HTMLElement>("#mk-empty");
		if (empty) empty.hidden = count > 0;
		const reset = page.querySelector<HTMLButtonElement>("#mk-reset");
		if (reset) reset.hidden = !(query || selected);
		const next = urlWithFilter(location.href, query, selected);
		if (next !== location.href) history.replaceState(history.state, "", next);
	};
	search?.addEventListener("input", filter, { signal });
	county?.addEventListener("change", filter, { signal });
	for (const reset of page.querySelectorAll("#mk-reset, #mk-clear"))
		reset.addEventListener(
			"click",
			() => {
				if (map?.dataset.interactive === "true") return;
				if (search) search.value = "";
				if (county) county.value = "";
				filter();
				search?.focus();
			},
			{ signal },
		);
	page.querySelector("#mk-geo")?.addEventListener(
		"click",
		() => {
			if (map?.dataset.interactive === "true") return;
			const status = page.querySelector("#mk-geo-status");
			if (status) status.textContent = "Kartan är inte tillgänglig ännu. Sök efter din ort.";
		},
		{ signal },
	);
	filter();
});

function syncGroups(page: HTMLElement, expanded: boolean) {
	for (const group of page.querySelectorAll<HTMLDetailsElement>(".mk-lan")) {
		const visible = group.querySelectorAll(".mk-lan-list > li:not([hidden])").length;
		group.hidden = visible === 0;
		group.open = expanded;
		const label = group.querySelector(".mk-lan-count");
		if (label) label.textContent = String(visible);
	}
}
