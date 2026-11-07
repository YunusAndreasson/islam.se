// Client mount for the /moskeer map. MapLibre GL with the keyless OpenFreeMap Positron
// basemap, recolored on load into the site's warm editorial palette so the map reads as
// part of islam.se rather than a generic slippy map. The mosque list is server-rendered
// (always present, the keyboard/no-JS path); this script adds the interactive map, the
// search/län filter that drives both, and the selection callout.
//
// Bundled once by Astro but re-mounted on every `astro:page-load` (View Transitions),
// so all state lives inside mount() and is torn down on `astro:before-swap`.
// maplibre-gl 6 dropped the default export (named exports only) — a namespace import
// keeps every existing `maplibregl.X` reference in this file working unchanged.
//
// ⚠️ maplibre-gl and its stylesheet are loaded LAZILY, from inside mount(). Statically
// imported they were 978 kB of JS (252 kB gzipped) plus 130 kB of CSS inlined into
// <head> by `inlineStylesheets: "always"` — a 456 kB document on the page that has to
// rank for "moskéer i sverige". Keep every top-level maplibre import type-only.

import type * as maplibregl from "maplibre-gl";
import type {
	ExpressionSpecification,
	GeoJSONSource,
	LngLatBoundsLike,
	MapGeoJSONFeature,
} from "maplibre-gl";
// `?url` yields the emitted asset's href WITHOUT joining the page's stylesheet graph —
// a plain `import "…css"` here or in the frontmatter gets inlined into <head> by
// `inlineStylesheets: "always"`, all 130 kB of it. Linked at mount instead.
import maplibreCssUrl from "maplibre-gl/dist/maplibre-gl.css?url";
// ⚠️ maplibre-gl 6 derives its worker URL at RUNTIME —
// `new URL("./maplibre-gl-worker.mjs", import.meta.url)` — a template-string URL no
// bundler can see, so the file was never emitted and the worker 404'd. Style JSON
// loaded, then nothing: no tiles, no sprite, no glyphs, `load` never fired, and the
// canvas sat at opacity 0 behind a silent failure with no console error.
// `?worker&url` makes Vite bundle the worker (resolving its own
// ./maplibre-gl-shared.mjs import) and hand back the emitted href.
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { BURIAL_GLYPH_GRID, BURIAL_GLYPH_PATH } from "../lib/begravningsplatser/glyph";
import { SWEDEN_BBOX } from "../lib/bonetider/sweden-outline";
import { LOCATING, locationFailed } from "../lib/geolocation";
import { nearest } from "../lib/geom";
import { readJsonScript } from "../lib/json-script";
import { filterFromUrl, matchesFilter, queryTerms, urlWithFilter } from "../lib/moskeer/filter";
import { fold } from "../lib/search-text";
import { escapeXml } from "../lib/xml";
import { onPage } from "./page";
import { currentScheme, type Scheme, watchScheme } from "./scheme";

interface MosqueDatum {
	id: string;
	name: string;
	lng: number;
	lat: number;
	location: string;
	address?: string;
	opened?: number;
	organisation?: string;
	google: string;
	apple: string;
	geo: string;
}

/** A Muslim burial ground — the map's second kind of place (see moskeer.astro). */
interface BurialDatum {
	id: string;
	name: string;
	/** The section's own name, or "Muslimskt gravkvarter" when the huvudman gives none. */
	section: string;
	lng: number;
	lat: number;
	lan: string;
	location: string;
	address?: string;
	opened?: number;
	source: string;
	google: string;
	apple: string;
}

// Palette matched to the Bönetider canvas so the two map surfaces feel identical.
// Dark was the app's cold navy until 2026-07-27; now the same warm-axis ramp.
const PALETTE = {
	// ⚠️ Light is set by measured L*, not by eye. It used to run land 91.4 / water 91.2 —
	// ΔL* 0.22, far under the ~2 just-noticeable difference — so Sweden's coastline
	// carried no lightness signal at all and the whole map read as a faint wash. Dark had
	// 5.6 and was never affected. Separations now: land↔water 7.6, land↔page 7.2,
	// land↔road 13.4, water↔road 5.8 (a coastal road must not sink into the sea),
	// land↔border 21.0.
	light: {
		land: "#e9e2d1", // warm parchment
		water: "#bcd0de",
		building: "#ded4bf",
		road: "#c8bca2",
		border: "#b9a687", // country/admin line — the strongest mark on the base
		label: "#6f6555",
		halo: "#fff6e8",
		brass: "#b8862f",
		brassOn: "#fffaf0",
		clusterText: "#fffaf0",
	},
	dark: {
		land: "#24221c",
		water: "#15171a",
		building: "#2c2922",
		road: "#33302a",
		border: "#45403a",
		label: "#a09890",
		halo: "#1d1912",
		brass: "#c89a48",
		brassOn: "#1d1912",
		clusterText: "#1d1912",
	},
} as const;

/** Bind colours once; a theme change updates one global style value, not every layer. */
function themeColor(key: keyof (typeof PALETTE)[Scheme]): ExpressionSpecification {
	return [
		"case",
		["==", ["global-state", "mk-scheme"], "dark"],
		PALETTE.dark[key],
		PALETTE.light[key],
	];
}

const selectedOpacity = (opacity: number): ExpressionSpecification => [
	"case",
	["boolean", ["feature-state", "selected"], false],
	opacity,
	0,
];

/** The burial glyph's image id in the style, and its size in CSS px at icon-size 1. */
const GRAVE_IMAGE = "mk-grave";
const GRAVE_PX = 22;

/** The shared burial glyph (lib/begravningsplatser/glyph) rasterised for MapLibre in the
 *  marker palette: a brass grave inside a ring of the page ground — the pairing the mosque
 *  dots already wear (brass fill, brassOn stroke), so the two kinds of place read as one
 *  family and only the shape tells them apart. Drawn with Path2D from the path string rather
 *  than loaded as an image: no request, nothing for a CSP to block, no decode to wait on. */
function burialGlyph(p: (typeof PALETTE)[Scheme]): ImageData | null {
	const ratio = 2;
	const size = GRAVE_PX * ratio;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.scale(size / BURIAL_GLYPH_GRID, size / BURIAL_GLYPH_GRID);
	const path = new Path2D(BURIAL_GLYPH_PATH);
	ctx.lineJoin = "round";
	ctx.lineWidth = 2.4;
	ctx.strokeStyle = p.brassOn;
	ctx.stroke(path);
	ctx.fillStyle = p.brass;
	ctx.fill(path);
	return ctx.getImageData(0, 0, size, size);
}

const [minLon, minLat, maxLon, maxLat] = SWEDEN_BBOX;
const SWEDEN_BOUNDS: LngLatBoundsLike = [
	[minLon, minLat],
	[maxLon, maxLat],
];

/* Sweden is tall, so a near-square container fits it on latitude and the south of the
   country lands near the container floor — where the attribution pill used to sit,
   covering the densest clusters on the map (Skåne and Malmö). Fixed by moving the
   attribution to bottom-right (empty Baltic) rather than by padding the fit: padding
   would buy the clearance with a zoom step, and the whole map pays for that in
   sharpness. Bottom-left keeps the scale bar, which is narrow enough to sit beside
   the data rather than on it. */
const SWEDEN_FIT = { padding: 24 } as const;

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

// Lucide Scan icon. Astro components cannot render inside this MapLibre control,
// so the script uses the same path data as @lucide/astro's generated icon.
const RESET_ICON =
	'<svg class="lucide lucide-scan" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>';

// "Visa hela Sverige" — refit the whole country. MapLibre ships no home/reset control, so
// this minimal IControl drops one button into the top-right control group.
class ResetViewControl implements maplibregl.IControl {
	private map: maplibregl.Map | undefined;
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
		btn.innerHTML = RESET_ICON;
		btn.addEventListener("click", () => {
			this.map?.fitBounds(SWEDEN_BOUNDS, { ...SWEDEN_FIT });
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

/** Link MapLibre's stylesheet once, and resolve only when it has applied — mounting the
 *  map against unstyled controls leaves the zoom buttons stacked over the canvas. */
function loadMaplibreCss(): Promise<void> {
	const existing = document.querySelector<HTMLLinkElement>("link[data-mk-css]");
	if (existing) return Promise.resolve();
	return new Promise((resolve) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = maplibreCssUrl;
		link.dataset.mkCss = "";
		// Never block the map on a stylesheet that 404s or stalls.
		link.addEventListener("load", () => resolve(), { once: true });
		link.addEventListener("error", () => resolve(), { once: true });
		document.head.appendChild(link);
	});
}

/** The map could not be drawn: mark it, and say so in the stage's status line (role
 *  status), where a screen reader hears it as well. The list beside it still works. */
function showMapError(el: HTMLElement): void {
	el.classList.add("is-error");
	const status = el.closest(".mk-stage")?.querySelector<HTMLElement>(".mk-loading");
	if (status) status.textContent = "Kartan kunde inte laddas. Du kan fortfarande använda listan.";
}

async function mount() {
	const el = document.getElementById("moskeer-map");
	const dataEl = document.getElementById("moskeer-data");
	if (!(el && dataEl)) return;
	if (el.dataset.mkMounted === "true") return;
	el.dataset.mkMounted = "true";
	// Hoisted out of the helpers below: those are function declarations, so TypeScript
	// re-checks them without the `if (!el) return` narrowing above and `el` reads as
	// possibly-null inside them. Resolving the stage once here is also one DOM query
	// instead of one per selection.
	const stage: HTMLElement = el.closest<HTMLElement>(".mk-stage") ?? el;

	const parsed = readJsonScript<MosqueDatum[] | null>(dataEl, null);
	if (!parsed) return;
	// Its own binding: the function declarations below are hoisted, so they would not see
	// the check above narrow `parsed`.
	const data = parsed;

	// The heavy pair, fetched only once the stage is about to be seen.
	let maplibre: typeof maplibregl;
	try {
		[maplibre] = await Promise.all([import("maplibre-gl"), loadMaplibreCss()]);
	} catch {
		showMapError(el);
		delete el.dataset.mkMounted;
		return;
	}
	// Must precede the first Map: the worker pool is built on construction.
	maplibre.setWorkerUrl(maplibreWorkerUrl);
	// A View-Transitions navigation during the fetch leaves a detached container.
	if (!el.isConnected) {
		delete el.dataset.mkMounted;
		return;
	}
	const byId = new Map(data.map((m) => [m.id, m]));
	// The burial grounds share the map but not the list (see moskeer.astro). A missing or
	// broken payload leaves this a mosque map rather than a broken one.
	const burials = readJsonScript<BurialDatum[]>(document.getElementById("begravning-data"), []);
	const burialById = new Map(burials.map((b) => [b.id, b]));
	const burialSearch = new Map(
		burials.map((b) => [b.id, fold(`${b.name} ${b.section} ${b.location} ${b.address ?? ""}`)]),
	);
	const gravesToggle = document.querySelector<HTMLInputElement>("#mk-graves");

	const search = document.querySelector<HTMLInputElement>("#mk-search");
	const lanSelect = document.querySelector<HTMLSelectElement>("#mk-lan");
	const geoBtn = document.querySelector<HTMLButtonElement>("#mk-geo");
	const geoStatus = document.querySelector<HTMLElement>("#mk-geo-status");
	const count = document.querySelector<HTMLElement>("#mk-count");
	const callout = document.querySelector<HTMLElement>("#mk-callout");
	const empty = document.querySelector<HTMLElement>("#mk-empty");
	// Always-available escape from a filter, next to the controls that set it. The
	// "Rensa filter" button inside #mk-empty only appears once a search has already
	// failed, which is the one moment a reader does not need help getting back.
	const resetBtn = document.querySelector<HTMLElement>("#mk-reset");
	const clearBtn = document.querySelector<HTMLButtonElement>("#mk-clear");
	const groups = Array.from(document.querySelectorAll<HTMLDetailsElement>(".mk-lan"));
	const items = Array.from(document.querySelectorAll<HTMLElement>(".mk-item"));

	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	let scheme = currentScheme();

	// Typed as what `setData` accepts; this was built `as const` and forced through
	// with `as never`, which silenced checking on exactly the argument v6 could change.
	// Read off maplibre's own signature: @types/geojson is only a transitive dep, so
	// the global `GeoJSON` namespace is not reliably in scope.
	type FeatureCollection = Extract<
		Parameters<GeoJSONSource["setData"]>[0],
		{ type: "FeatureCollection" }
	>;
	const fc = (
		rows: readonly Pick<MosqueDatum, "id" | "name" | "lng" | "lat">[],
	): FeatureCollection => ({
		type: "FeatureCollection",
		features: rows.map((m) => ({
			type: "Feature",
			id: m.id,
			geometry: { type: "Point", coordinates: [m.lng, m.lat] },
			properties: { id: m.id, name: m.name },
		})),
	});

	// The constructor is the one place a missing WebGL context surfaces, and it throws
	// rather than firing `error` — so the handler below never saw it. Uncaught, the
	// rejection was swallowed by `mount().catch()` in observe() and the reader was left
	// with a 700px coloured rectangle and a search box, a län picker and a geo button
	// that all look live and are wired to nothing, because every listener in mount() is
	// registered after this line. WebGL is genuinely absent in the wild: blocked by a
	// privacy extension, unavailable on old hardware, off in a hardened profile.
	// showMapError marks the container and says in the status line that the list still works.
	let map: maplibregl.Map;
	try {
		map = new maplibre.Map({
			container: el,
			globalState: { "mk-scheme": scheme },
			style: "https://tiles.openfreemap.org/styles/positron",
			bounds: SWEDEN_BOUNDS,
			// Frame all of Sweden on load; padding keeps the far north/south off the
			// edges and the south clear of the scale bar and attribution pill.
			fitBoundsOptions: { ...SWEDEN_FIT },
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
	} catch (err) {
		showMapError(el);
		delete el.dataset.mkMounted;
		console.warn("[moskeer] kartan kunde inte skapas (saknad WebGL-kontext?):", err);
		return;
	}
	// Without this, a failure at tiles.openfreemap.org just means `load` never fires:
	// an empty rectangle, nothing logged. The list beside the map still works.
	let mapFailed = false;
	let styleReady = false;
	let contextLost = false;
	map.on("load", () => {
		styleReady = true;
	});
	// ⚠️ maplibre emits `error` for RECOVERABLE conditions too — one 404 or timed-out
	// vector tile, a missing sprite id. Only a failure before `load` is the blank-rectangle
	// case this guard exists for; latching on any error buried a map that was rendering
	// all 255 mosques under an undismissable overlay.
	map.on("error", (e) => {
		const detail = e?.error?.message ?? e;
		if (styleReady) {
			console.warn("[moskeer] kartfel (kartan är uppe):", detail);
			return;
		}
		if (mapFailed) return;
		mapFailed = true;
		showMapError(el);
		console.warn("[moskeer] kartan kunde inte laddas:", detail);
	});
	// Bottom-RIGHT: expanded, this pill is ~470px wide and bottom-left is where Skåne
	// and Malmö land once Sweden is framed, so it sat on top of the densest clusters.
	// Bottom-right is open Baltic at every zoom the Sweden fit produces.
	map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");
	map.addControl(
		new maplibre.NavigationControl({ showCompass: true, visualizePitch: true }),
		"top-right",
	);
	map.addControl(new ResetViewControl(), "top-right");
	map.addControl(new maplibre.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
	// Fullscreen the whole .mk-stage (map + callout + controls) so the selection card
	// doesn't get orphaned outside the fullscreen subtree.
	map.addControl(
		new maplibre.FullscreenControl({ container: el.closest<HTMLElement>(".mk-stage") ?? el }),
		"top-right",
	);
	// Native geolocation: the familiar user-location dot + accuracy ring. We drive it from
	// the labelled »Nära mig« button (its own corner button is hidden in CSS),
	// then snap to the nearest mosque on success.
	const geolocate = new maplibre.GeolocateControl({
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
		// maplibre-gl 6 types `coords` directly on the event (no cast needed anymore).
		const c = e.coords;
		if (!c) return;
		const best = nearest(data, { lat: c.latitude, lon: c.longitude }, (m) => ({
			lat: m.lat,
			lon: m.lng,
		}));
		// Not opened by a list row, so nothing to hand focus back to. Without this the
		// callout for the NEAREST mosque inherited whatever row was clicked earlier, and
		// Esc then threw the reader down the list to an unrelated mosque.
		if (best) {
			if (search) search.value = "";
			if (lanSelect) lanSelect.value = "";
			applyFilter();
			if (geoStatus) geoStatus.textContent = `Närmast dig: ${best.name}.`;
			lastTrigger = null;
			selectMosque(best.id, true);
		}
	});
	geolocate.on("error", (e) => {
		geoBtn?.removeAttribute("aria-busy");
		if (geoStatus) geoStatus.textContent = locationFailed(e.code);
	});

	// Which paint props to overwrite for a given Positron layer, keyed generically by
	// type + id so we don't hard-code Positron's (versioned) layer list.
	// The exact paint-property names touched below — maplibre-gl 6 tightened
	// setPaintProperty's key to `keyof AllPaintProperties` instead of a bare string.
	type PaintProp =
		| "background-color"
		| "text-color"
		| "text-halo-color"
		| "fill-color"
		| "line-color"
		| "line-opacity";
	type Edit = [PaintProp, ExpressionSpecification | number];
	function fillEdits(id: string): Edit[] {
		if (/water/.test(id)) return [["fill-color", themeColor("water")]];
		if (/building/.test(id)) return [["fill-color", themeColor("building")]];
		if (/landcover|landuse|wood|park|grass|forest|sand|wetland/.test(id)) {
			return [["fill-color", themeColor("land")]];
		}
		return [];
	}
	function lineEdits(id: string): Edit[] {
		if (/water|waterway/.test(id)) return [["line-color", themeColor("water")]];
		// Country / admin borders: a soft, low-contrast line at reduced opacity.
		if (/boundary|admin|border/.test(id)) {
			return [
				["line-color", themeColor("border")],
				["line-opacity", 0.45],
			];
		}
		if (/road|street|highway|bridge|tunnel|transit|rail|path|motorway|trunk/.test(id)) {
			return [["line-color", themeColor("road")]];
		}
		return [];
	}
	function paintEdits(type: string, id: string): Edit[] {
		if (type === "background") return [["background-color", themeColor("land")]];
		if (type === "symbol") {
			return [
				["text-color", themeColor("label")],
				["text-halo-color", themeColor("halo")],
			];
		}
		if (type === "fill") return fillEdits(id);
		if (type === "line") return lineEdits(id);
		return [];
	}

	// Bind the external base style once. Theme flips subsequently update global state.
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

	function updateGraveImage() {
		// The two-colour bitmap still needs a redraw; style expressions handle everything else.
		const glyph = burialGlyph(PALETTE[scheme]);
		if (glyph && map.hasImage(GRAVE_IMAGE)) map.updateImage(GRAVE_IMAGE, glyph);
	}

	// The element that opened the current callout (a list row), so Esc/close can return
	// focus to it. Map-marker / geo / deep-link selections leave it null (focus stays put).
	let lastTrigger: HTMLElement | null = null;
	let activeId = "";

	let ringId = "";
	// Stable GeoJSON ids keep selection attached to the same place across source updates.
	// Feature state changes paint without reparsing/filtering either source's tiles.
	function setActiveRing(id: string) {
		if (contextLost) {
			ringId = id;
			return;
		}
		for (const source of ["mosques", "burials"]) {
			if (!map.getSource(source)) continue;
			if (ringId) map.removeFeatureState({ source, id: ringId }, "selected");
			if (id) map.setFeatureState({ source, id }, { selected: true });
		}
		ringId = id;
	}

	/** `restoreFocus` returns focus to the row that opened the callout — right when the reader
	 *  dismissed it themselves (× or Esc), and WRONG when the filter dismissed it: syncMap
	 *  closes the callout as soon as the query stops matching the selected mosque, which
	 *  happens while the reader is still typing. Focusing a `<button class="mk-item">` then
	 *  took the caret out of the search field on the FIRST keystroke and scrolled the page
	 *  ~300 px down to the list, so every character after it went nowhere. (Measured in Zen:
	 *  activeElement lands on `body`, not the row — syncList hides the now-unmatched row
	 *  immediately after, and focus falls off the hidden element.) */
	function closeCallout(restoreFocus = true) {
		if (callout) callout.hidden = true;
		for (const it of items) {
			it.classList.remove("is-active");
			it.removeAttribute("aria-current");
		}
		activeId = "";
		setActiveRing("");
		if (restoreFocus && lastTrigger) {
			document.dispatchEvent(new CustomEvent("mosques:show-list"));
			lastTrigger.focus();
		}
		lastTrigger = null;
	}

	/** Is the map actually on screen? A 100px sliver at the viewport edge is not enough
	 *  to show a callout, so the margins are deliberately generous. */
	function mapInView(): boolean {
		const r = stage.getBoundingClientRect();
		const vh = window.innerHeight || document.documentElement.clientHeight;
		return r.bottom > 140 && r.top < vh - 140;
	}

	/** Bring the map back on screen when the selection came from elsewhere on the page.
	 *  Returns whether it scrolled, so the caller can drop the competing row scroll.
	 *
	 *  ⚠️ `behavior: "instant"`, and it has to be. Measured in Chrome against the live
	 *  page: called from inside the row's click, a scroll to the stage with "smooth"
	 *  moves nothing at all, and so does "auto" — the site sets `scroll-behavior: smooth`
	 *  on <html>, so "auto" resolves to smooth too. The animation is started and then
	 *  killed by the click's own default action focusing the <button>. The identical
	 *  call one tick later, outside the handler, scrolls fine, which is what made this
	 *  look like the reveal was never running. "instant" jumps every time.
	 *
	 *  No reduced-motion branch: an instant jump IS the reduced-motion behaviour, and a
	 *  1500 px glide down the page was never the nicer option anyway — the map's own
	 *  flyTo is the animation the reader is meant to watch. */
	function revealMap(): boolean {
		const card = callout && !callout.hidden ? callout.getBoundingClientRect() : null;
		const cardInView = !card || (card.top >= 100 && card.bottom <= window.innerHeight - 24);
		if (mapInView() && cardInView) return false;
		stage.scrollIntoView({ block: "center", behavior: "instant" });
		return true;
	}

	// `scrollList` defaults to `fly`: a list/geo/deep-link selection (fly=true) also brings
	// the matching list row into view, but a tap on a map marker (fly=false) must NOT move
	// the page — the reader stays on the map and just gets the callout.
	function selectMosque(id: string, fly = true, scrollList = fly) {
		document.dispatchEvent(new CustomEvent("mosques:show-map"));
		map.resize();
		// Either kind of place: mosques and graves share the callout, the rings and the fly.
		const m = byId.get(id) ?? burialById.get(id);
		if (!m) return;
		activeId = id;
		setActiveRing(id);

		// THE ANSWER HAS TO BE ON SCREEN. The län list runs a thousand-odd pixels below
		// the map, so clicking a row used to fly the map, open the callout with the
		// address, the opening year and both directions buttons — and leave every bit of
		// that above the fold. From the reader's chair: you click a mosque and the page
		// changes a border colour. "Hitta moské nära mig" had the same hole: press it
		// while reading the list and your nearest mosque was announced off-screen.
		//
		// Only for selections that did NOT come from the map (fly=true). A tap on a
		// marker must never move the page under the reader's finger — they are already
		// looking at the answer.
		// The row scroll would fight the map scroll; the map wins, because it is where
		// the newly opened callout is. Written out rather than `scrollList && !(fly &&
		// revealMap())`: that form only calls revealMap when scrollList happens to be
		// true, so a future `selectMosque(id, true, false)` would silently lose the
		// scroll-into-view this whole block exists for.
		if (callout) {
			if ("section" in m) renderBurialCallout(m);
			else renderCallout(m);
			if (lastTrigger && matchMedia("(width < 50rem)").matches)
				callout
					.querySelector<HTMLButtonElement>(".mk-callout-close")
					?.focus({ preventScroll: true });
		}
		const mapScrolled = fly ? revealMap() : false;
		const bringRowIntoView = scrollList && !mapScrolled;

		const offset: [number, number] = [
			0,
			-Math.min((callout?.offsetHeight ?? 0) / 2, stage.clientHeight / 4),
		];
		if (fly) {
			const target = {
				offset,
				center: [m.lng, m.lat] as [number, number],
				zoom: Math.max(map.getZoom(), 11),
			};
			if (reduceMotion) map.jumpTo(target);
			else map.flyTo({ ...target, speed: 1.2 });
		}
		if (!fly) map.easeTo({ center: [m.lng, m.lat], offset, duration: reduceMotion ? 0 : 250 });
		markActiveRow(id, bringRowIntoView);
	}

	/** Move the list's highlight to one row, open the län it sits in, and — only for
	 *  selections that did not come from the map — bring it into view. Lifted out of
	 *  selectMosque to keep that function under the complexity ceiling; it also reads
	 *  as what it is, which is the list's half of a selection. */
	function markActiveRow(id: string, bringIntoView: boolean) {
		for (const it of items) {
			const active = it.dataset.id === id;
			it.classList.toggle("is-active", active);
			if (active) it.setAttribute("aria-current", "true");
			else it.removeAttribute("aria-current");
			if (!active) continue;
			const details = it.closest("details");
			if (details && !details.open) details.open = true;
			// A map tap keeps the viewport put (the row is just highlighted in place, for
			// when the reader scrolls down to it later).
			const panel = it.closest<HTMLElement>(".mk-results");
			if (bringIntoView && panel && getComputedStyle(panel).overflowY === "auto") {
				const top =
					it.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
				panel.scrollTo({ top: Math.max(0, top - 16), behavior: reduceMotion ? "auto" : "smooth" });
			}
		}
	}

	function renderCallout(m: MosqueDatum) {
		if (!callout) return;
		callout.setAttribute("aria-label", "Vald moské");
		// The same words as the list row beside the map (MosqueList): »· öppnad 1995«,
		// »Huvudman«. The callout said »Öppnad« and »Finansiering / huvudman«.
		const facts: string[] = [m.location];
		if (m.opened) facts.push(`öppnad ${m.opened}`);
		const org = m.organisation
			? `<p class="mk-callout-org"><span class="label">Huvudman</span>${escapeXml(m.organisation)}</p>`
			: "";
		callout.innerHTML = `
			<button type="button" class="mk-callout-close" aria-label="Stäng">×</button>
			<p class="mk-callout-name">${escapeXml(m.name)}</p>
			${m.address ? `<p class="mk-callout-meta">${escapeXml(m.address)}</p>` : ""}
			<p class="mk-callout-meta">${facts.map(escapeXml).join(" · ")}</p>
			${org}
			<div class="mk-dir">
				<span class="label">Vägbeskrivning</span>
				<a href="${escapeXml(mapHref(m.apple))}" class="pill">Apple Maps</a>
				<a href="${escapeXml(mapHref(m.google))}" class="pill">Google Maps</a>
			</div>`;
		callout.hidden = false;
		// Wrapped, not passed directly: closeCallout now takes `restoreFocus`, and handing it
		// to addEventListener would feed it the click Event as that argument.
		callout.querySelector(".mk-callout-close")?.addEventListener("click", () => closeCallout());
	}

	/** The callout for a grave: the cemetery, which part of it is the Muslim one, and the
	 *  page that confirms it — linked, because that page is also where the huvudman publishes
	 *  opening hours and who to call. Only an https source becomes a link. */
	function renderBurialCallout(b: BurialDatum) {
		if (!callout) return;
		callout.setAttribute("aria-label", "Valt gravkvarter");
		const facts: string[] = [b.location];
		if (b.opened) facts.push(`i bruk sedan ${b.opened}`);
		const host = /^https:\/\/(?:www\.)?([^/?#]+)/.exec(b.source)?.[1];
		const source = host
			? `<p class="mk-callout-org"><a href="${escapeXml(b.source)}" rel="noopener">Källa: ${escapeXml(host)}</a></p>`
			: "";
		callout.innerHTML = `
			<button type="button" class="mk-callout-close" aria-label="Stäng">×</button>
			<p class="mk-callout-name">${escapeXml(b.name)}</p>
			<p class="mk-callout-meta">${escapeXml(b.section)}</p>
			${b.address ? `<p class="mk-callout-meta">${escapeXml(b.address)}</p>` : ""}
			<p class="mk-callout-meta">${facts.map(escapeXml).join(" · ")}</p>
			${source}
			<div class="mk-dir">
				<span class="label">Vägbeskrivning</span>
				<a href="${escapeXml(mapHref(b.apple))}" class="pill">Apple Maps</a>
				<a href="${escapeXml(mapHref(b.google))}" class="pill">Google Maps</a>
			</div>`;
		callout.hidden = false;
		callout.querySelector(".mk-callout-close")?.addEventListener("click", () => closeCallout());
	}

	// ── Filtering: search + län drive the map source, the list, and the count together ──
	const lanById = new Map(items.map((it) => [it.dataset.id, it.dataset.lan]));
	// Reuse the server-rendered haystack for the map as well as the list. It includes
	// street addresses in addition to the name/location shown in the map payload.
	const searchById = new Map(items.map((it) => [it.dataset.id, it.dataset.search ?? ""]));

	let fittedQuery = "";

	function fitSearchResults(
		q: string,
		lan: string,
		visible: readonly { lng: number; lat: number }[],
	) {
		const filterKey = q || lan ? JSON.stringify([q, lan]) : "";
		if (filterKey !== fittedQuery) {
			fittedQuery = filterKey;
			if (!filterKey) {
				map.fitBounds(SWEDEN_BOUNDS, { ...SWEDEN_FIT, duration: reduceMotion ? 0 : 350 });
			} else if (visible.length) {
				const bounds = new maplibre.LngLatBounds();
				for (const mosque of visible) bounds.extend([mosque.lng, mosque.lat]);
				map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: reduceMotion ? 0 : 350 });
			}
		}
	}

	const sourceKeys = new Map<string, string>();
	const rowsKey = (rows: readonly { id: string }[]) => JSON.stringify(rows.map((row) => row.id));
	let sourceRevision = 0;
	function updatePlaces(
		sourceId: string,
		rows: readonly Pick<MosqueDatum, "id" | "name" | "lng" | "lat">[],
	) {
		const source = map.getSource(sourceId) as GeoJSONSource | undefined;
		const key = rowsKey(rows);
		if (contextLost || !source || sourceKeys.get(sourceId) === key) return;
		sourceKeys.set(sourceId, key);
		sourceRevision++;
		// v6 queues/coalesces pending setData calls itself. Keep full filtered data so
		// cluster counts reflect the search, rather than hiding already-built clusters.
		source.setData(fc(rows)).catch((error: unknown) => {
			if (sig.aborted || map.getSource(sourceId) !== source) return;
			if (sourceKeys.get(sourceId) === key) sourceKeys.delete(sourceId);
			console.warn("[moskeer] Could not update map places", error);
		});
	}

	/** Map: filter both kinds of place by query + län (lib/moskeer/filter.ts, the list's rule
	 *  too). A mosque's län comes from its rendered list item; a grave has no list item and
	 *  carries its own. */
	function syncMap(q: string, terms: readonly string[], lan: string) {
		const visible = data.filter((m) =>
			matchesFilter(
				searchById.get(m.id) ?? fold(`${m.name} ${m.location}`),
				lanById.get(m.id),
				terms,
				lan,
			),
		);
		const visibleGraves = burials.filter((b) =>
			matchesFilter(burialSearch.get(b.id) ?? "", b.lan, terms, lan),
		);
		// The reader is typing — leave the caret where it is (see closeCallout).
		const stillShown =
			visible.some((m) => m.id === activeId) || visibleGraves.some((b) => b.id === activeId);
		if (activeId && !stillShown) closeCallout(false);
		// Frame everything the filter found, including cemetery-only searches.
		if (!contextLost && map.getSource("mosques"))
			fitSearchResults(q, lan, [...visible, ...visibleGraves]);
		updatePlaces("mosques", visible);
		updatePlaces("burials", visibleGraves);
	}

	/** List: hide non-matching items + empty groups; auto-open groups when searching.
	 *  Returns the number of items left visible, for the count and the empty state. */
	function syncList(terms: readonly string[], lan: string): number {
		let shown = 0;
		for (const g of groups) {
			let gShown = 0;
			for (const li of g.querySelectorAll<HTMLElement>("li")) {
				const hay = li.querySelector<HTMLElement>(".mk-item")?.dataset.search ?? "";
				const hit = matchesFilter(hay, g.dataset.lan, terms, lan);
				li.hidden = !hit;
				if (hit) gShown++;
			}
			const groupCount = g.querySelector(".mk-lan-count");
			if (groupCount) groupCount.textContent = String(gShown);
			g.hidden = gShown === 0;
			g.open = gShown > 0 && (terms.length > 0 || lan !== "");
			shown += gShown;
		}
		return shown;
	}

	/** Mirror the filter into the URL. Without this the search and the län picker were
	 *  the only state on the page that could not be linked, bookmarked or reloaded:
	 *  "moskéer i Skåne" was something you could see but not send to anyone, Back did
	 *  not undo a filter, and a refresh silently threw the reader back to all 234.
	 *
	 *  replaceState rather than pushState — a filter is not a page, and one history
	 *  entry per keystroke would bury the Back button under the search field. The raw
	 *  typed string goes in the URL, not the folded haystack form, so the link stays
	 *  readable ("?q=malmö", not "?q=malmo"). */
	function syncUrl(raw: string, lan: string) {
		const next = urlWithFilter(location.href, raw, lan);
		if (next !== location.href) history.replaceState(history.state, "", next);
	}

	function applyFilter() {
		const raw = search?.value.trim() ?? "";
		const terms = queryTerms(raw);
		const lan = lanSelect?.value ?? "";
		syncMap(terms.join(" "), terms, lan);
		const shown = syncList(terms, lan);
		if (count) count.textContent = `${shown} ${shown === 1 ? "moské" : "moskéer"}`;
		if (empty) empty.hidden = shown !== 0;
		if (resetBtn) resetBtn.hidden = raw === "" && lan === "";
		syncUrl(raw, lan);
	}

	/** The other half of syncUrl: put a linked ?q=/?lan= back into the controls before
	 *  the first filter pass, so the page opens showing what the link promised. An
	 *  unknown län is ignored rather than silently blanking the picker. */
	function restoreFilterFromUrl() {
		const linked = filterFromUrl(
			location.search,
			lanSelect ? Array.from(lanSelect.options, (o) => o.value) : [],
		);
		if (linked.raw && search) search.value = linked.raw;
		if (linked.lan && lanSelect) lanSelect.value = linked.lan;
	}

	// ── Wire events ──────────────────────────────────────────────────────────────────
	const ac = new AbortController();
	const sig = ac.signal;

	// Desktop-only hover tooltip: one reusable popup showing the mosque name. Gated to
	// fine-pointer devices so it never appears on touch, and aria-hidden so it doesn't
	// double-announce alongside the aria-live callout.
	const hoverPopup = window.matchMedia("(hover: hover)").matches
		? new maplibre.Popup({
				closeButton: false,
				closeOnClick: false,
				offset: 12,
				className: "mk-hover",
			})
		: null;

	/** Pointer cursor + name chip for whatever is under the mouse — a mosque dot or a grave. */
	function showHoverName(f: MapGeoJSONFeature | undefined) {
		map.getCanvas().style.cursor = "pointer";
		if (!(hoverPopup && f)) return;
		const name = f.properties?.name as string | undefined;
		if (!name) return;
		const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
		hoverPopup
			.setLngLat(coords)
			.setHTML(`<span class="mk-hover-name">${escapeXml(name)}</span>`)
			.addTo(map);
		hoverPopup.getElement()?.setAttribute("aria-hidden", "true");
	}

	function hideHoverName() {
		map.getCanvas().style.cursor = "";
		hoverPopup?.remove();
	}

	map.on("load", () => {
		map.setGlobalStateProperty("mk-scheme", scheme);
		recolorBase();
		// Reveal the canvas now that the base is recolored — scheduled one frame on (so the
		// marker layers added below are already in) and up here rather than at the end, so the
		// dark base still shows even if a later call throws. Until this lands the canvas is held
		// at opacity 0 (see moskeer.astro) over the .mk-map dark background, so dark mode fades
		// in already-dark instead of flashing the light Positron base white.
		requestAnimationFrame(() => el.classList.add("is-ready"));
		// Graves first, so every mosque layer below draws over them: where a cemetery and a
		// mosque meet at country scale, the mosque — what this page is for — stays in front.
		// No clustering: some eighty sparse points never need it. Overlap is allowed, so a
		// grave neither hides a cluster's count nor is hidden by one.
		const glyph = burialGlyph(PALETTE[scheme]);
		if (glyph) map.addImage(GRAVE_IMAGE, glyph, { pixelRatio: 2 });
		map.addSource("burials", { type: "geojson", data: fc(burials), promoteId: "id" });
		sourceKeys.set("burials", rowsKey(burials));
		map.addLayer({
			id: "mk-graves-active",
			type: "circle",
			source: "burials",
			paint: {
				"circle-radius": 14,
				"circle-color": themeColor("brass"),
				"circle-opacity": selectedOpacity(0.16),
				"circle-stroke-width": 2,
				"circle-stroke-color": themeColor("brass"),
				"circle-stroke-opacity": selectedOpacity(0.9),
			},
		});
		if (glyph) {
			map.addLayer({
				id: "mk-graves",
				type: "symbol",
				source: "burials",
				layout: {
					"icon-image": GRAVE_IMAGE,
					// Grows gently with zoom, like the mosque dots: small enough not to crowd the
					// country view, comfortable to aim at once a region fills the frame.
					"icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 8, 0.8, 12, 1],
					"icon-allow-overlap": true,
					"icon-ignore-placement": true,
				},
			});
			// The legend is only worth showing once there is a grave on the map to explain.
			const legend = gravesToggle?.closest("label");
			if (legend) legend.hidden = false;
			setGravesVisible(gravesToggle?.checked ?? true);
		}
		map.addSource("mosques", {
			type: "geojson",
			data: fc(data),
			// Tile encoding coerces string feature ids; promote the stable slug property.
			promoteId: "id",
			cluster: true,
			// Lighter clustering: a small radius only merges genuinely-overlapping dots,
			// and a lower maxZoom lets points separate into individual dots sooner — so we
			// show more mosques as dots and fewer shared circles.
			clusterRadius: 16,
			clusterMaxZoom: 9,
		});
		sourceKeys.set("mosques", rowsKey(data));
		map.addLayer({
			id: "mk-clusters",
			type: "circle",
			source: "mosques",
			filter: ["has", "point_count"],
			paint: {
				"circle-color": themeColor("brass"),
				"circle-opacity": 0.9,
				"circle-stroke-color": themeColor("brassOn"),
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
			paint: { "text-color": themeColor("clusterText") },
		});
		// Selected-marker highlight: a soft brass halo + ring drawn UNDER the dot, painted
		// through feature state; set in selectMosque, cleared on callout close.
		// If the selected mosque is filtered out of the source, the ring finds no feature
		// and disappears on its own.
		map.addLayer({
			id: "mk-points-active",
			type: "circle",
			source: "mosques",
			filter: ["!", ["has", "point_count"]],
			paint: {
				"circle-radius": 13,
				"circle-color": themeColor("brass"),
				"circle-opacity": selectedOpacity(0.16),
				"circle-stroke-width": 2,
				"circle-stroke-color": themeColor("brass"),
				"circle-stroke-opacity": selectedOpacity(0.9),
			},
		});
		map.addLayer({
			id: "mk-points",
			type: "circle",
			source: "mosques",
			filter: ["!", ["has", "point_count"]],
			paint: {
				"circle-color": themeColor("brass"),
				// Grows gently with zoom: small enough to not crowd when Sweden is framed,
				// comfortable to aim at once a region fills the view.
				"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 8, 5.5, 12, 7],
				"circle-stroke-width": 2,
				"circle-stroke-color": themeColor("brassOn"),
			},
		});
		// A list item can be selected while the external style is still loading. In that
		// case setActiveRing() returned early because this layer did not exist yet.
		setActiveRing(activeId);

		// Grave click → select (no fly, as a dot). Registered BEFORE the mosque handlers:
		// MapLibre fires every matching layer's handler in registration order, and on the rare
		// click that meets both a grave and the mosque dot drawn over it, the dot's handler
		// has to run last so the callout belongs to what the reader sees on top.
		map.on("click", "mk-graves", (e) => {
			const id = e.features?.[0]?.properties?.id as string | undefined;
			if (id) {
				lastTrigger = null;
				selectMosque(id, false);
			}
		});
		map.on("mousemove", "mk-graves", (e) =>
			showHoverName(e.features?.[0] as MapGeoJSONFeature | undefined),
		);
		map.on("mouseleave", "mk-graves", hideHoverName);
		// Cluster click → zoom to expand.
		map.on("click", "mk-clusters", async (e) => {
			const f = e.features?.[0];
			if (f?.geometry.type !== "Point") return;
			const clusterId = f?.properties?.cluster_id;
			if (clusterId == null) return;
			const src = map.getSource("mosques") as GeoJSONSource;
			const revision = sourceRevision;
			try {
				const zoom = await src.getClusterExpansionZoom(clusterId);
				if (sig.aborted || revision !== sourceRevision) return;
				const coords: [number, number] = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
				map.easeTo({ center: coords, zoom, duration: reduceMotion ? 0 : 350 });
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
		map.on("mousemove", "mk-points", (e) =>
			showHoverName(e.features?.[0] as MapGeoJSONFeature | undefined),
		);
		map.on("mouseleave", "mk-points", hideHoverName);
		// Re-run once the map has a source to filter. The first pass already happened
		// outside this handler (see below) so the LIST is correct from the start; this
		// one exists to push the same filter into the freshly created GeoJSON source.
		applyFilter();

		// Deep link from a Bönetider city page (/moskeer#<id>) → open that mosque.
		const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
		if (hash && (byId.has(hash) || burialById.has(hash))) selectMosque(hash, true);
	});

	// List item click → select + fly.
	for (const it of items) {
		it.addEventListener(
			"click",
			(event) => {
				if (
					event instanceof MouseEvent &&
					(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
				)
					return;
				event.preventDefault();
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

	/** Show or hide the graves — the legend's checkbox. Hiding the one whose callout is open
	 *  closes it: a card for a mark no longer on the map points at nothing. */
	function setGravesVisible(on: boolean) {
		for (const layer of ["mk-graves", "mk-graves-active"]) {
			if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", on ? "visible" : "none");
		}
		if (!on && burialById.has(activeId)) closeCallout(false);
	}
	gravesToggle?.addEventListener(
		"change",
		(e) => setGravesVisible((e.currentTarget as HTMLInputElement).checked),
		{ signal: sig },
	);

	// Restore a linked ?q=/?lan= and filter the list NOW, not inside map.on("load").
	// Everything in that handler is hostage to WebGL: on a machine or a browser profile
	// where the canvas never initialises — a blocked WebGL context, an extension, old
	// hardware — the load event does not fire, and with the restore in there a shared
	// link like /moskeer/?lan=Skåne silently opened as all 234. The list is plain DOM
	// and owes the map nothing, so it filters immediately; syncMap's `getSource` is
	// already optional-chained and simply no-ops until the map is ready.
	restoreFilterFromUrl();
	applyFilter();

	// Both routes back to "all 234": the one beside the controls (always there while a
	// filter is on) and the one inside the empty state (there when the search failed).
	const clearFilter = () => {
		if (search) search.value = "";
		if (lanSelect) lanSelect.value = "";
		applyFilter();
		search?.focus();
	};
	clearBtn?.addEventListener("click", clearFilter, { signal: sig });
	resetBtn?.addEventListener("click", clearFilter, { signal: sig });

	// The labelled CTA drives the native GeolocateControl; the `geolocate` / `error`
	// handlers wired at setup do the rest (user dot + accuracy ring, nearest-mosque snap,
	// or the Swedish denial message). aria-busy is cleared in those handlers.
	geoBtn?.addEventListener(
		"click",
		() => {
			if (geoBtn.getAttribute("aria-busy") === "true") return;
			if (geoStatus) geoStatus.textContent = LOCATING;
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

	el.dataset.interactive = "true";
	document.addEventListener("mosques:view-changed", () => map.resize(), { signal: sig });
	// A theme change, the OS's or the site switch's, recolours the base and markers live;
	// without it the basemap keeps the scheme it mounted with while the page flips.
	watchScheme(() => {
		const next = currentScheme();
		if (next === scheme) return;
		scheme = next;
		if (!styleReady || contextLost) return;
		map.setGlobalStateProperty("mk-scheme", scheme);
		updateGraveImage();
	}, sig);

	// v6 reconstructs sources/layers/images after context loss or a worker restart.
	// Feature state is transient; restore our UI state once the rebuilt style is ready.
	map.on("webglcontextlost", () => {
		contextLost = true;
		sourceRevision++;
	});
	map.on("style.load", () => {
		if (!contextLost) return;
		contextLost = false;
		if (!map.getLayer("mk-points")) return; // first load still installs the layers
		map.setGlobalStateProperty("mk-scheme", scheme);
		updateGraveImage();
		sourceKeys.clear();
		applyFilter();
		setActiveRing(activeId);
		setGravesVisible(gravesToggle?.checked ?? true);
	});

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

// Load the map when the stage comes within a screenful, not on parse. The stage is
// usually just inside the first viewport, so this normally fires straight away — the
// gain is that the 978 kB bundle and its stylesheet are no longer part of the document's
// critical path, and a reader who bounces never pays for them.
/** Run `job` immediately after the browser has painted one frame. Two nested rAFs are
 *  what actually clears the paint: the first fires BEFORE the frame it is scheduled in,
 *  so a single rAF would still land ahead of the pixels.
 *
 *  Deliberately NOT requestIdleCallback. The obvious version of this waited for an idle
 *  gap (timeout 1500 ms) and measured WORSE: the map canvas is far and away the largest
 *  element on this page, so it is the LCP element, and on a page whose own map work
 *  keeps the main thread busy for seconds the idle gap never arrives — every mount paid
 *  the full 1500 ms cap. FCP improved 2.3 s -> 1.5 s but LCP went 2.3 s -> 3.3 s and the
 *  Lighthouse score fell 65 -> 61. One frame is all the deferral that was ever needed:
 *  it is enough to let the server-rendered mast, heading and county list paint first,
 *  and it does not hold the LCP element hostage to a thread that is never quiet. */
function afterFirstPaint(job: () => void): void {
	let ran = false;
	const run = () => {
		if (ran) return;
		ran = true;
		job();
	};
	requestAnimationFrame(() => {
		requestAnimationFrame(run);
	});
	// ⚠️ The rAF pair is the fast path, NOT a guarantee. Chrome suspends animation
	// frames for a window it is not painting — including an OCCLUDED one, which still
	// reports document.visibilityState === "visible" and document.hidden === false.
	// Caught here by driving the built page from a non-focused window: rAF had not
	// fired after two seconds, #moskeer-map never gained .is-ready, and the map simply
	// never arrived — no canvas, no controls, no console error, exactly the silent
	// failure mode the worker-URL note above describes. mount() used to be called
	// straight from the observer and could not miss. This timeout restores that floor:
	// whichever path wins first, the map mounts, and `ran` keeps it to one mount.
	setTimeout(run, 1000);
}

// The search/län filter binds inside mount(), as it always has: it drives the map source
// and the list together.
function observe(): (() => void) | undefined {
	const stage = document.querySelector<HTMLElement>(".mk-stage");
	if (!stage) return;
	const io = new IntersectionObserver(
		(entries) => {
			if (!entries.some((e) => e.isIntersecting)) return;
			io.disconnect();
			// The stage sits ~367 px down the page — well inside the first viewport at
			// any width — so this observer fires during the initial layout, and the
			// lazy import therefore deferred nothing in practice: ~1 MB of maplibre was
			// parsed and initialised BEFORE the browser had painted the mast, the
			// heading and the county list, all of which are server-rendered and ready
			// to show. Handing the mount to the first idle slot after the first paint
			// reorders those two: the reader gets the page, then the map arrives on top
			// of it. The 1500 ms timeout is the cap — on a busy main thread the map
			// must still come, and come soon.
			afterFirstPaint(() => {
				if (!stage.isConnected) return; // navigated away while we waited
				mount().catch(() => {
					/* mount() already surfaces its own failure on the stage */
				});
			});
		},
		{ rootMargin: "600px" },
	);
	io.observe(stage.closest(".moskeer") ?? stage);
	return () => io.disconnect();
}

// At the router's page-load, as measured (see afterFirstPaint): the map is this page's
// largest paint, and its timing was tuned against Lighthouse runs.
onPage(observe, { when: "load" });
