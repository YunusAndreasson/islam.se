import { fold } from "../lib/search-text";

// The directory remains useful while MapLibre loads, and if it never loads.
document.addEventListener("astro:page-load", () => {
	const page = document.querySelector<HTMLElement>(".moskeer");
	if (!page) return;
	const controller = new AbortController();
	const { signal } = controller;
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
	const params = new URLSearchParams(location.search);
	if (search) search.value = params.get("q") ?? "";
	if (county) county.value = params.get("lan") ?? "";
	const filter = () => {
		if (map?.dataset.interactive === "true") return;
		const query = search?.value.trim() ?? "";
		const term = fold(query);
		const selected = county?.value ?? "";
		let count = 0;
		for (const row of rows) {
			const visible =
				(!selected || row.dataset.lan === selected) && (row.dataset.search ?? "").includes(term);
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
		syncUrl(query, selected);
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
	document.addEventListener("astro:before-swap", () => controller.abort(), { once: true });
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

function syncUrl(query: string, selected: string) {
	const url = new URL(location.href);
	if (query) url.searchParams.set("q", query);
	else url.searchParams.delete("q");
	if (selected) url.searchParams.set("lan", selected);
	else url.searchParams.delete("lan");
	history.replaceState(history.state, "", url);
}
