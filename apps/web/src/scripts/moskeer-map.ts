// Client mount for the /moskeer map. MapLibre GL with the keyless OpenFreeMap Positron
// basemap, recolored on load into the site's warm editorial palette so the map reads as
// part of islam.se rather than a generic slippy map. The mosque list is server-rendered
// (always present, the keyboard/no-JS path); this script adds the interactive map, the
// search/län filter that drives both, and the selection callout.
//
// Bundled once by Astro but re-mounted on every `astro:page-load` (View Transitions),
// so all state lives inside mount() and is torn down on `astro:before-swap`.
import maplibregl, {
	type GeoJSONSource,
	type LngLatBoundsLike,
	type MapGeoJSONFeature,
} from "maplibre-gl";
// maplibre-gl.css is imported from the page frontmatter (moskeer.astro) so Astro emits
// it as a real <link> in <head> — no runtime style injection / flash.
import { SWEDEN_BBOX } from "../lib/bonetider/sweden-outline";
import { haversineKm } from "../lib/geom";

interface MosqueDatum {
	id: string;
	name: string;
	lng: number;
	lat: number;
	location: string;
	opened?: number;
	organisation?: string;
	google: string;
	apple: string;
	geo: string;
}

type Scheme = "light" | "dark";

// Palette matched to the Bönetider canvas so the two map surfaces feel identical.
const PALETTE = {
	light: {
		land: "#ece6d8", // warm parchment
		water: "#dfe7ec",
		building: "#e6dfce",
		road: "#d8cfbe",
		border: "#cdbfa6", // soft, low-contrast country/admin line
		label: "#776d61",
		halo: "#faf8f5",
		brass: "#b8862f",
		brassOn: "#fffaf0",
		clusterText: "#fffaf0",
	},
	dark: {
		land: "#1d2333",
		water: "#141a26",
		building: "#222a3c",
		road: "#2a3142",
		border: "#333c52",
		label: "#9aa0ac",
		halo: "#141a26",
		brass: "#c89a48",
		brassOn: "#141a26",
		clusterText: "#141a26",
	},
} as const;

const [minLon, minLat, maxLon, maxLat] = SWEDEN_BBOX;
const SWEDEN_BOUNDS: LngLatBoundsLike = [
	[minLon, minLat],
	[maxLon, maxLat],
];

// Swedish UI strings for MapLibre's built-in controls + the cooperative-gesture overlay.
// Set once on the Map; every control reads it via `_getUIString` when added, and the
// cooperative-gesture hint pulls from it at render — so this one option localizes the
// formerly-English overlay AND all control tooltips. Keys verified against maplibre-gl 5.24.
const LOCALE: Record<string, string> = {
	"NavigationControl.ZoomIn": "Zooma in",
	"NavigationControl.ZoomOut": "Zooma ut",
	"NavigationControl.ResetBearing": "Återställ riktning",
	"GeolocateControl.FindMyLocation": "Visa min plats",
	"GeolocateControl.LocationNotAvailable": "Platsen är inte tillgänglig",
	"FullscreenControl.Enter": "Helskärm",
	"FullscreenControl.Exit": "Avsluta helskärm",
	"AttributionControl.ToggleAttribution": "Visa eller dölj upphovsuppgifter",
	"AttributionControl.MapFeedback": "Återkoppling om kartan",
	"Popup.Close": "Stäng",
	"CooperativeGesturesHandler.WindowsHelpText": "Använd Ctrl + rulla för att zooma kartan",
	"CooperativeGesturesHandler.MacHelpText": "Använd ⌘ + rulla för att zooma kartan",
	"CooperativeGesturesHandler.MobileHelpText": "Använd två fingrar för att flytta kartan",
};

// "Visa hela Sverige" — refit the whole country. MapLibre ships no home/reset control, so
// this minimal IControl drops one button into the top-right control group.
class ResetViewControl implements maplibregl.IControl {
	private map?: maplibregl.Map;
	private container?: HTMLDivElement;

	onAdd(map: maplibregl.Map): HTMLElement {
		this.map = map;
		const container = document.createElement("div");
		container.className = "maplibregl-ctrl maplibregl-ctrl-group";
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "mk-ctrl-reset";
		btn.title = "Visa hela Sverige";
		btn.setAttribute("aria-label", "Visa hela Sverige");
		btn.innerHTML =
			'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg>';
		btn.addEventListener("click", () => {
			this.map?.fitBounds(SWEDEN_BOUNDS, { padding: 24 });
		});
		container.appendChild(btn);
		this.container = container;
		return container;
	}

	onRemove(): void {
		this.container?.parentNode?.removeChild(this.container);
		this.map = undefined;
	}
}

function currentScheme(): Scheme {
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function norm(s: string): string {
	return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function mount() {
	const el = document.getElementById("moskeer-map");
	const dataEl = document.getElementById("moskeer-data");
	if (!(el && dataEl)) return;
	if (el.dataset.mkMounted === "true") return;
	el.dataset.mkMounted = "true";

	let data: MosqueDatum[];
	try {
		data = JSON.parse(dataEl.textContent || "[]");
	} catch {
		return;
	}
	const byId = new Map(data.map((m) => [m.id, m]));

	const search = document.querySelector<HTMLInputElement>("#mk-search");
	const lanSelect = document.querySelector<HTMLSelectElement>("#mk-lan");
	const geoBtn = document.querySelector<HTMLButtonElement>("#mk-geo");
	const geoStatus = document.querySelector<HTMLElement>("#mk-geo-status");
	const count = document.querySelector<HTMLElement>("#mk-count");
	const callout = document.querySelector<HTMLElement>("#mk-callout");
	const empty = document.querySelector<HTMLElement>("#mk-empty");
	const clearBtn = document.querySelector<HTMLButtonElement>("#mk-clear");
	const groups = Array.from(document.querySelectorAll<HTMLDetailsElement>(".mk-lan"));
	const items = Array.from(document.querySelectorAll<HTMLElement>(".mk-item"));

	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	let scheme = currentScheme();

	const fc = (rows: MosqueDatum[]) =>
		({
			type: "FeatureCollection",
			features: rows.map((m) => ({
				type: "Feature" as const,
				geometry: { type: "Point" as const, coordinates: [m.lng, m.lat] },
				properties: { id: m.id, name: m.name },
			})),
		}) as const;

	const map = new maplibregl.Map({
		container: el,
		style: "https://tiles.openfreemap.org/styles/positron",
		bounds: SWEDEN_BOUNDS,
		// Frame all of Sweden on load; padding keeps the far north/south off the edges.
		fitBoundsOptions: { padding: 24 },
		// No maxBounds: with this wide container, clamping the pan range also pins the
		// minimum zoom, which cropped Sweden and disabled zoom-out. minZoom sits below
		// the Sweden-fit zoom so the – button still has room.
		minZoom: 2.6,
		maxZoom: 17,
		// Attribution is added manually (bottom-left) below so the bottom-right corner stays
		// clear for the selection callout. Compact = a small ⓘ that expands on click.
		attributionControl: false,
		// Don't trap the page scroll: require ⌘/ctrl-scroll or two fingers to zoom.
		cooperativeGestures: true,
		// Swedish tooltips + cooperative-gesture overlay (see LOCALE above).
		locale: LOCALE,
	});
	map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
	map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
	map.addControl(new ResetViewControl(), "top-right");
	// Fullscreen the whole .mk-stage (map + callout + controls) so the selection card
	// doesn't get orphaned outside the fullscreen subtree.
	map.addControl(
		new maplibregl.FullscreenControl({ container: el.closest<HTMLElement>(".mk-stage") ?? el }),
		"top-right",
	);
	// Native geolocation: the familiar user-location dot + accuracy ring. We drive it from
	// the labelled "Hitta moské nära mig" button (its own corner button is hidden in CSS),
	// then snap to the nearest mosque on success.
	const geolocate = new maplibregl.GeolocateControl({
		positionOptions: { enableHighAccuracy: false, timeout: 8000 },
		trackUserLocation: false,
		showUserLocation: true,
		showAccuracyCircle: true,
		fitBoundsOptions: { maxZoom: 11 },
	});
	map.addControl(geolocate, "top-right");
	geolocate.on("geolocate", (e) => {
		geoBtn?.removeAttribute("aria-busy");
		if (geoStatus) geoStatus.textContent = "";
		const c = (e as GeolocationPosition).coords;
		if (!c) return;
		// Longitude degrees get much shorter toward northern Sweden, so use a real
		// great-circle distance rather than treating latitude/longitude as a flat grid.
		let best: MosqueDatum | null = null;
		let bestD = Number.POSITIVE_INFINITY;
		for (const m of data) {
			const d = haversineKm(c.latitude, c.longitude, m.lat, m.lng);
			if (d < bestD) {
				bestD = d;
				best = m;
			}
		}
		if (best) selectMosque(best.id, true);
	});
	geolocate.on("error", () => {
		geoBtn?.removeAttribute("aria-busy");
		if (geoStatus)
			geoStatus.textContent = "Kunde inte hämta din position. Tillåt platsåtkomst och försök igen.";
	});

	// Which paint props to overwrite for a given Positron layer, keyed generically by
	// type + id so we don't hard-code Positron's (versioned) layer list.
	type Edit = [string, string | number];
	function fillEdits(id: string): Edit[] {
		const p = PALETTE[scheme];
		if (/water/.test(id)) return [["fill-color", p.water]];
		if (/building/.test(id)) return [["fill-color", p.building]];
		if (/landcover|landuse|wood|park|grass|forest|sand|wetland/.test(id)) {
			return [["fill-color", p.land]];
		}
		return [];
	}
	function lineEdits(id: string): Edit[] {
		const p = PALETTE[scheme];
		if (/water|waterway/.test(id)) return [["line-color", p.water]];
		// Country / admin borders: a soft, low-contrast line at reduced opacity.
		if (/boundary|admin|border/.test(id)) {
			return [
				["line-color", p.border],
				["line-opacity", 0.45],
			];
		}
		if (/road|street|highway|bridge|tunnel|transit|rail|path|motorway|trunk/.test(id)) {
			return [["line-color", p.road]];
		}
		return [];
	}
	function paintEdits(type: string, id: string): Edit[] {
		const p = PALETTE[scheme];
		if (type === "background") return [["background-color", p.land]];
		if (type === "symbol") {
			return [
				["text-color", p.label],
				["text-halo-color", p.halo],
			];
		}
		if (type === "fill") return fillEdits(id);
		if (type === "line") return lineEdits(id);
		return [];
	}

	// Recolor the Positron base into the warm palette. Each setPaintProperty is guarded
	// because some layers use data-driven values that reject a flat color.
	function recolorBase() {
		const layers = map.getStyle()?.layers;
		if (!layers) return;
		for (const layer of layers) {
			for (const [prop, color] of paintEdits(layer.type, layer.id)) {
				try {
					map.setPaintProperty(layer.id, prop, color);
				} catch {
					/* layer doesn't carry this paint prop — skip */
				}
			}
		}
	}

	function applyMarkerColors() {
		const p = PALETTE[scheme];
		for (const [layer, prop, val] of [
			["mk-clusters", "circle-color", p.brass],
			["mk-clusters", "circle-stroke-color", p.brassOn],
			["mk-cluster-count", "text-color", p.clusterText],
			["mk-points-active", "circle-color", p.brass],
			["mk-points-active", "circle-stroke-color", p.brass],
			["mk-points", "circle-color", p.brass],
			["mk-points", "circle-stroke-color", p.brassOn],
		] as const) {
			if (map.getLayer(layer)) {
				try {
					map.setPaintProperty(layer, prop, val);
				} catch {
					/* not ready */
				}
			}
		}
	}

	// The element that opened the current callout (a list row), so Esc/close can return
	// focus to it. Map-marker / geo / deep-link selections leave it null (focus stays put).
	let lastTrigger: HTMLElement | null = null;
	let activeId = "";

	// Drive the selected-mosque highlight ring; an empty id clears it.
	function setActiveRing(id: string) {
		if (!map.getLayer("mk-points-active")) return;
		map.setFilter("mk-points-active", [
			"all",
			["!", ["has", "point_count"]],
			["==", ["get", "id"], id],
		] as never);
	}

	function closeCallout() {
		if (callout) callout.hidden = true;
		for (const it of items) it.classList.remove("is-active");
		activeId = "";
		setActiveRing("");
		lastTrigger?.focus();
		lastTrigger = null;
	}

	// `scrollList` defaults to `fly`: a list/geo/deep-link selection (fly=true) also brings
	// the matching list row into view, but a tap on a map marker (fly=false) must NOT move
	// the page — the reader stays on the map and just gets the callout.
	function selectMosque(id: string, fly = true, scrollList = fly) {
		const m = byId.get(id);
		if (!m) return;
		activeId = id;
		setActiveRing(id);
		if (fly) {
			const target = {
				center: [m.lng, m.lat] as [number, number],
				zoom: Math.max(map.getZoom(), 11),
			};
			if (reduceMotion) map.jumpTo(target);
			else map.flyTo({ ...target, speed: 1.2 });
		}
		if (callout) renderCallout(m);
		for (const it of items) {
			const active = it.dataset.id === id;
			it.classList.toggle("is-active", active);
			if (active) {
				const details = it.closest("details");
				if (details && !details.open) details.open = true;
				// Only scroll the page to the row for non-map selections; a map tap keeps the
				// viewport put (just highlights the row in place for when the reader scrolls down).
				if (scrollList)
					it.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
			}
		}
	}

	function renderCallout(m: MosqueDatum) {
		if (!callout) return;
		const facts: string[] = [m.location];
		if (m.opened) facts.push(`Öppnad ${m.opened}`);
		const org = m.organisation
			? `<p class="mk-callout-org"><span class="label">Finansiering / huvudman</span>${escapeHtml(m.organisation)}</p>`
			: "";
		callout.innerHTML = `
			<button type="button" class="mk-callout-close" aria-label="Stäng">×</button>
			<h3 class="mk-callout-name">${escapeHtml(m.name)}</h3>
			<p class="mk-callout-meta">${facts.map(escapeHtml).join(" · ")}</p>
			${org}
			<div class="mk-dir">
				<span class="label">Vägbeskrivning</span>
				<a href="${escapeAttr(mapHref(m.apple))}" class="mk-dir-btn">Apple Maps</a>
				<a href="${escapeAttr(mapHref(m.google))}" class="mk-dir-btn">Google Maps</a>
			</div>`;
		callout.hidden = false;
		callout.querySelector(".mk-callout-close")?.addEventListener("click", closeCallout);
	}

	// ── Filtering: search + län drive the map source, the list, and the count together ──
	const lanById = new Map(items.map((it) => [it.dataset.id, it.dataset.lan]));
	// Reuse the server-rendered haystack for the map as well as the list. It includes
	// street addresses in addition to the name/location shown in the map payload.
	const searchById = new Map(items.map((it) => [it.dataset.id, it.dataset.search ?? ""]));

	function applyFilter() {
		const q = norm(search?.value.trim() ?? "");
		const lan = lanSelect?.value ?? "";
		// Map: filter the data array by query + län (län comes from the rendered list item).
		const visible = data.filter((m) => {
			const okQ =
				q === "" || (searchById.get(m.id) ?? norm(`${m.name} ${m.location}`)).includes(q);
			const okLan = lan === "" || lanById.get(m.id) === lan;
			return okQ && okLan;
		});
		if (activeId && !visible.some((m) => m.id === activeId)) closeCallout();
		const src = map.getSource("mosques") as GeoJSONSource | undefined;
		src?.setData(fc(visible) as never);

		// List: hide non-matching items + empty groups; auto-open groups when searching.
		let shown = 0;
		for (const g of groups) {
			let gShown = 0;
			const gLan = g.dataset.lan ?? "";
			const lanHidden = lan !== "" && gLan !== lan;
			for (const li of g.querySelectorAll<HTMLElement>("li")) {
				const it = li.querySelector<HTMLElement>(".mk-item");
				const hay = it?.dataset.search ?? "";
				const hit = !lanHidden && (q === "" || hay.includes(q));
				li.hidden = !hit;
				if (hit) gShown++;
			}
			g.hidden = gShown === 0;
			g.open = gShown > 0 && (q !== "" || lan !== "");
			shown += gShown;
		}
		if (count) count.textContent = `${shown} ${shown === 1 ? "moské" : "moskéer"}`;
		if (empty) empty.hidden = shown !== 0;
	}

	// ── Wire events ──────────────────────────────────────────────────────────────────
	const ac = new AbortController();
	const sig = ac.signal;

	// Desktop-only hover tooltip: one reusable popup showing the mosque name. Gated to
	// fine-pointer devices so it never appears on touch, and aria-hidden so it doesn't
	// double-announce alongside the aria-live callout.
	const hoverPopup = window.matchMedia("(hover: hover)").matches
		? new maplibregl.Popup({
				closeButton: false,
				closeOnClick: false,
				offset: 12,
				className: "mk-hover",
			})
		: null;

	map.on("load", () => {
		recolorBase();
		// Reveal the canvas now that the base is recolored — scheduled one frame on (so the
		// marker layers added below are already in) and up here rather than at the end, so the
		// dark base still shows even if a later call throws. Until this lands the canvas is held
		// at opacity 0 (see moskeer.astro) over the .mk-map dark background, so dark mode fades
		// in already-dark instead of flashing the light Positron base white.
		requestAnimationFrame(() => el.classList.add("is-ready"));
		map.addSource("mosques", {
			type: "geojson",
			data: fc(data) as never,
			cluster: true,
			// Lighter clustering: a small radius only merges genuinely-overlapping dots,
			// and a lower maxZoom lets points separate into individual dots sooner — so we
			// show more mosques as dots and fewer shared circles.
			clusterRadius: 16,
			clusterMaxZoom: 9,
		});
		map.addLayer({
			id: "mk-clusters",
			type: "circle",
			source: "mosques",
			filter: ["has", "point_count"],
			paint: {
				"circle-color": PALETTE[scheme].brass,
				"circle-opacity": 0.9,
				"circle-stroke-color": PALETTE[scheme].brassOn,
				"circle-stroke-width": 1.5,
				"circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 30, 24],
			},
		});
		map.addLayer({
			id: "mk-cluster-count",
			type: "symbol",
			source: "mosques",
			filter: ["has", "point_count"],
			layout: {
				"text-field": ["get", "point_count_abbreviated"],
				"text-font": ["Noto Sans Regular"],
				"text-size": 12,
			},
			paint: { "text-color": PALETTE[scheme].clusterText },
		});
		// Selected-marker highlight: a soft brass halo + ring drawn UNDER the dot. Filtered
		// to the active id (none on load); set in selectMosque, cleared on callout close.
		// If the selected mosque is filtered out of the source, the ring finds no feature
		// and disappears on its own.
		map.addLayer({
			id: "mk-points-active",
			type: "circle",
			source: "mosques",
			filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], ""]],
			paint: {
				"circle-radius": 13,
				"circle-color": PALETTE[scheme].brass,
				"circle-opacity": 0.16,
				"circle-stroke-width": 2,
				"circle-stroke-color": PALETTE[scheme].brass,
				"circle-stroke-opacity": 0.9,
			},
		});
		map.addLayer({
			id: "mk-points",
			type: "circle",
			source: "mosques",
			filter: ["!", ["has", "point_count"]],
			paint: {
				"circle-color": PALETTE[scheme].brass,
				// Grows gently with zoom: small enough to not crowd when Sweden is framed,
				// comfortable to aim at once a region fills the view.
				"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 8, 5.5, 12, 7],
				"circle-stroke-width": 2,
				"circle-stroke-color": PALETTE[scheme].brassOn,
			},
		});
		// A list item can be selected while the external style is still loading. In that
		// case setActiveRing() returned early because this layer did not exist yet.
		setActiveRing(activeId);

		// Cluster click → zoom to expand.
		map.on("click", "mk-clusters", async (e) => {
			const f = map.queryRenderedFeatures(e.point, { layers: ["mk-clusters"] })[0];
			const clusterId = f?.properties?.cluster_id;
			if (clusterId == null) return;
			const src = map.getSource("mosques") as GeoJSONSource;
			try {
				const zoom = await src.getClusterExpansionZoom(clusterId);
				const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
				map.easeTo({ center: coords, zoom });
			} catch {
				/* ignore */
			}
		});
		// Point click → select (no fly: the reader stays on the map). A marker click leaves
		// `lastTrigger` null so closing the callout doesn't yank focus away.
		map.on("click", "mk-points", (e) => {
			const f = e.features?.[0] as MapGeoJSONFeature | undefined;
			const id = f?.properties?.id as string | undefined;
			if (id) {
				lastTrigger = null;
				selectMosque(id, false);
			}
		});
		map.on("mouseenter", "mk-clusters", () => {
			map.getCanvas().style.cursor = "pointer";
		});
		map.on("mouseleave", "mk-clusters", () => {
			map.getCanvas().style.cursor = "";
		});
		// Hover a dot → pointer cursor + name tooltip (desktop only).
		map.on("mousemove", "mk-points", (e) => {
			map.getCanvas().style.cursor = "pointer";
			if (!hoverPopup) return;
			const f = e.features?.[0] as MapGeoJSONFeature | undefined;
			const name = f?.properties?.name as string | undefined;
			if (!name) return;
			const coords = (f?.geometry as { coordinates: [number, number] }).coordinates;
			hoverPopup
				.setLngLat(coords)
				.setHTML(`<span class="mk-hover-name">${escapeHtml(name)}</span>`)
				.addTo(map);
			hoverPopup.getElement()?.setAttribute("aria-hidden", "true");
		});
		map.on("mouseleave", "mk-points", () => {
			map.getCanvas().style.cursor = "";
			hoverPopup?.remove();
		});
		applyFilter();

		// Deep link from a Bönetider city page (/moskeer#<id>) → open that mosque.
		const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
		if (hash && byId.has(hash)) selectMosque(hash, true);
	});

	// List item click → select + fly.
	for (const it of items) {
		it.addEventListener(
			"click",
			() => {
				const id = it.dataset.id;
				if (id) {
					lastTrigger = it;
					selectMosque(id, true);
				}
			},
			{ signal: sig },
		);
	}

	search?.addEventListener("input", applyFilter, { signal: sig });
	lanSelect?.addEventListener("change", applyFilter, { signal: sig });

	clearBtn?.addEventListener(
		"click",
		() => {
			if (search) search.value = "";
			if (lanSelect) lanSelect.value = "";
			applyFilter();
			search?.focus();
		},
		{ signal: sig },
	);

	// The labelled CTA drives the native GeolocateControl; the `geolocate` / `error`
	// handlers wired at setup do the rest (user dot + accuracy ring, nearest-mosque snap,
	// or the Swedish denial message). aria-busy is cleared in those handlers.
	geoBtn?.addEventListener(
		"click",
		() => {
			if (geoStatus) geoStatus.textContent = "";
			geoBtn.setAttribute("aria-busy", "true");
			geolocate.trigger();
		},
		{ signal: sig },
	);

	// Esc closes the selection callout and returns focus to the row that opened it.
	document.addEventListener(
		"keydown",
		(e) => {
			if (e.key === "Escape" && callout && !callout.hidden) closeCallout();
		},
		{ signal: sig },
	);

	// OS theme change → recolor base + markers live.
	const mq = window.matchMedia("(prefers-color-scheme: dark)");
	const onScheme = () => {
		scheme = currentScheme();
		recolorBase();
		applyMarkerColors();
	};
	mq.addEventListener("change", onScheme, { signal: sig });

	// Teardown on View-Transitions navigation away.
	document.addEventListener(
		"astro:before-swap",
		() => {
			ac.abort();
			hoverPopup?.remove();
			map.remove();
			delete el.dataset.mkMounted;
		},
		{ once: true },
	);
}

function mapHref(s: string): string {
	return /^https:\/\/(maps\.apple\.com|www\.google\.com)\//.test(s) ? s : "#";
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => {
		switch (c) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			default:
				return "&#39;";
		}
	});
}

function escapeAttr(s: string): string {
	return escapeHtml(s);
}

document.addEventListener("astro:page-load", mount);
