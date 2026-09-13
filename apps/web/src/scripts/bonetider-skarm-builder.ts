// The builder's glue: controls → ScreenConfig → URL fragment → a link and a live preview.
//
// It holds no state of its own beyond the config. Every keystroke rebuilds the fragment
// and writes it onto the preview iframe, which is the real display page — so what the
// mosque is looking at while it configures is not a mock-up of the wall, it IS the wall.
//
// It also writes the value beside every collapsed disclosure. That is not decoration:
// a fold that hides its own state is how a mosque ends up praying by the wrong
// calculation method with nothing on the page admitting it.

import {
	DEFAULT_SCREEN_CONFIG,
	encodeScreenConfig,
	IQAMA_KEYS,
	type IqamaKey,
	type IqamaRule,
	normalizeClockTime,
	type ScreenConfig,
} from "../lib/bonetider/screen-config";
import type { PrayerSettings } from "../lib/bonetider/settings";
import { madhabLabel, methodLabel } from "../lib/bonetider/settings-options";
import { BT_SETTINGS_CHANGE, type BtSettingsChangeDetail } from "./bonetider-settings-form";

interface Entry {
	n: string;
	c: string;
	s: string;
	lat: number;
	lon: number;
}

const VISA = "/bonetider/skarm/visa/";

/** The one listener boot() puts on `document`, which outlives the page it was added on.
 *  See where it is registered. */
let onSettingsChange: ((e: Event) => void) | null = null;

function readJson<T>(id: string): T[] {
	const el = document.getElementById(id);
	if (!el?.textContent) return [];
	try {
		return JSON.parse(el.textContent) as T[];
	} catch {
		return [];
	}
}

function fillDatalist(list: HTMLDataListElement, entries: Entry[]): Map<string, Entry> {
	const byLabel = new Map<string, Entry>();
	const frag = document.createDocumentFragment();
	for (const e of entries) {
		// The label carries the city because Sweden has several Kyrkbyn and more than one
		// Islamiska Kulturcentret, and a picker that offers the same word twice is a picker
		// that will be chosen wrongly.
		const label = e.c && e.c !== e.n ? `${e.n} – ${e.c}` : e.n;
		if (byLabel.has(label)) continue;
		byLabel.set(label, e);
		const opt = document.createElement("option");
		opt.value = label;
		frag.append(opt);
	}
	list.append(frag);
	return byLabel;
}

/** "15 · 15 · 15 · 5 · 15 min", or a mixed row once a prayer is pinned to a clock
 *  time — in which case the unit is dropped, because half the row is no longer minutes. */
function iqamaSummary(config: ScreenConfig): string {
	const rules = IQAMA_KEYS.map((k) => config.iqama[k]);
	if (rules.every((r) => !r.at && r.offset === 0)) return "Inga iqāma-tider";
	const parts = rules.map((r) => r.at ?? String(r.offset));
	return rules.some((r) => r.at) ? parts.join(" · ") : `${parts.join(" · ")} min`;
}

function fredagSummary(config: ScreenConfig): string {
	if (config.jumua && config.notice) return `Khutba ${config.jumua} och anslag`;
	if (config.jumua) return `Khutba ${config.jumua}`;
	if (config.notice) return "Anslag";
	return "Inget ifyllt";
}

function setText(id: string, text: string): void {
	const el = document.getElementById(id);
	if (el) el.textContent = text;
}

function boot(): void {
	const root = document.querySelector<HTMLElement>(".sk-split");
	const frameEl = document.querySelector<HTMLIFrameElement>("#sk-frame");
	if (!(root && frameEl)) return;
	// Re-bound after the guard: TypeScript does not carry the narrowing into the nested
	// closures below, and it is used throughout.
	const frame: HTMLIFrameElement = frameEl;

	const mosques = readJson<Entry>("sk-mosque-data");
	const places = readJson<Entry>("sk-place-data");
	const mosqueList = document.querySelector<HTMLDataListElement>("#sk-mosques");
	const ortList = document.querySelector<HTMLDataListElement>("#sk-orter");
	const byMosque = mosqueList ? fillDatalist(mosqueList, mosques) : new Map<string, Entry>();
	const byOrt = ortList ? fillDatalist(ortList, places) : new Map<string, Entry>();
	const ortBySlug = new Map(places.map((p) => [p.s, p]));

	// Queried from the document, not from a form: this page has no <form> of its own.
	// PrayerSettings renders one, and a form nested in a form is dropped by the HTML
	// parser — silently, so the controls appear but never wire up.
	const el = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
	const mosqueInput = el<HTMLInputElement>("#sk-mosque");
	const ortInput = el<HTMLInputElement>("#sk-ort");
	const nameInput = el<HTMLInputElement>("#sk-name");
	const placeInput = el<HTMLInputElement>("#sk-place");
	const jumuaInput = el<HTMLInputElement>("#sk-jumua");
	const noticeInput = el<HTMLInputElement>("#sk-notice");
	const quietInput = el<HTMLInputElement>("#sk-quiet");
	const urlOut = el<HTMLElement>("#sk-url");
	const openLink = el<HTMLAnchorElement>("#sk-open");
	const copyBtn = el<HTMLButtonElement>("#sk-copy");

	let settings: PrayerSettings = DEFAULT_SCREEN_CONFIG.settings;

	// Seed the controls from the defaults so the form never starts blank — a mosque that
	// sees empty iqāma boxes assumes it has to fill in every one.
	for (const key of IQAMA_KEYS) {
		const input = el<HTMLInputElement>(`[data-iqama="${key}"]`);
		if (input) input.value = String(DEFAULT_SCREEN_CONFIG.iqama[key].offset);
	}
	if (quietInput) quietInput.value = String(DEFAULT_SCREEN_CONFIG.quietMinutes);

	/** "15" is an offset, "21:00" is a pinned clock time. One box, because a mosque
	 *  thinks in one number either way and a radio pair per prayer would be ten more
	 *  controls for a distinction most of them never make. */
	function readIqama(key: IqamaKey): IqamaRule {
		const raw = el<HTMLInputElement>(`[data-iqama="${key}"]`)?.value.trim() ?? "";
		const fallback = DEFAULT_SCREEN_CONFIG.iqama[key];
		if (raw.includes(":")) {
			const at = normalizeClockTime(raw);
			return at === "" ? fallback : { offset: fallback.offset, at };
		}
		const n = Number(raw);
		return Number.isFinite(n) ? { offset: Math.min(180, Math.max(0, Math.round(n))) } : fallback;
	}

	function currentConfig(): ScreenConfig {
		const picked =
			(mosqueInput?.value ? byMosque.get(mosqueInput.value) : undefined) ??
			(ortInput?.value ? byOrt.get(ortInput.value) : undefined);
		const ortEntry = picked
			? (ortBySlug.get(picked.s) ?? picked)
			: ortBySlug.get(DEFAULT_SCREEN_CONFIG.ort);

		const iqama = {} as Record<IqamaKey, IqamaRule>;
		for (const key of IQAMA_KEYS) iqama[key] = readIqama(key);

		return {
			ort: ortEntry?.s ?? DEFAULT_SCREEN_CONFIG.ort,
			ortName: ortEntry?.n ?? DEFAULT_SCREEN_CONFIG.ortName,
			name: nameInput?.value.trim() ?? "",
			place: placeInput?.value.trim() ?? "",
			// A mosque from the directory carries its own coordinates, so the marker lands
			// on the building rather than on the town centre.
			lat: picked?.lat ?? ortEntry?.lat ?? DEFAULT_SCREEN_CONFIG.lat,
			lon: picked?.lon ?? ortEntry?.lon ?? DEFAULT_SCREEN_CONFIG.lon,
			iqama,
			jumua: normalizeClockTime(jumuaInput?.value ?? ""),
			notice: noticeInput?.value.trim() ?? "",
			quietMinutes: Number(quietInput?.value ?? DEFAULT_SCREEN_CONFIG.quietMinutes) || 0,
			settings,
		};
	}

	const status = el<HTMLElement>("#sk-mosque-status");

	/** The line under the search box. Empty, it says the preview is a stand-in; with text
	 *  that matches no mosque, it says so — because the config then silently keeps the last
	 *  place it had, and a preview of the wrong mosque looks perfectly healthy.
	 *
	 *  `commit` is a change event (a pick, Enter, leaving the field). A non-match is only
	 *  announced then: mid-word, every keystroke is one. Once shown it stays until the text
	 *  matches or is cleared, so it does not flicker away on the next letter. */
	function writeStatus(commit: boolean): void {
		if (!(status && mosqueInput)) return;
		const typed = mosqueInput.value.trim();
		const manual = (ortInput?.value.trim() ?? "") !== "" || (nameInput?.value.trim() ?? "") !== "";
		let state = "";
		let text = "";
		if (typed === "" && !manual) {
			state = "empty";
			text = `Skärmen visar ${DEFAULT_SCREEN_CONFIG.ortName} tills ni väljer en moské.`;
		} else if (
			typed !== "" &&
			!byMosque.has(mosqueInput.value) &&
			(commit || status.dataset.state === "nomatch")
		) {
			state = "nomatch";
			text =
				"Ingen moské i listan heter så. Välj ett av förslagen, eller lägg till er moské nedan.";
		}
		status.dataset.state = state;
		if (status.textContent !== text) status.textContent = text;
		if (state === "nomatch") mosqueInput.setAttribute("aria-invalid", "true");
		else mosqueInput.removeAttribute("aria-invalid");
	}

	let settleTimer: number | undefined;

	function sync(): void {
		const config = currentConfig();
		const hash = encodeScreenConfig(config);
		const url = `${window.location.origin}${VISA}#${hash}`;

		if (urlOut) urlOut.textContent = url;
		if (openLink) openLink.href = `${VISA}#${hash}`;

		// What each fold holds, written whether it is open or shut.
		setText("sk-sum-iqama", iqamaSummary(config));
		setText("sk-sum-fredag", fredagSummary(config));
		setText("sk-sum-calc", `${methodLabel(config.settings)} · ${madhabLabel(config.settings)}`);

		// The preview reloads rather than updating in place, because that is what the
		// display page does with a hashchange — an operator retyping a live screen's URL
		// should get a clean re-init, not a half-applied config. So the cost is paid
		// here instead: the reload waits until typing stops, or the preview would flicker
		// through a page load on every keystroke.
		if (settleTimer !== undefined) clearTimeout(settleTimer);
		settleTimer = window.setTimeout(() => {
			const frameUrl = `${VISA}#${hash}`;
			if (frame.getAttribute("src") !== frameUrl) frame.setAttribute("src", frameUrl);
		}, 400);

		writeStatus(false);
	}

	/** Picking a mosque fills in the name and the place line, because a mosque that has
	 *  to retype its own name will assume the picker did nothing. */
	mosqueInput?.addEventListener("change", () => {
		// Before the root's own change listener runs sync(), so a non-match is announced on
		// this event and then merely kept by the sync that follows.
		writeStatus(true);
		const picked = byMosque.get(mosqueInput.value);
		if (!picked) return;
		if (nameInput && nameInput.value.trim() === "") nameInput.value = picked.n;
		if (placeInput && placeInput.value.trim() === "") placeInput.value = picked.c;
		const ort = ortBySlug.get(picked.s);
		if (ortInput && ort) ortInput.value = ort.c && ort.c !== ort.n ? `${ort.n} – ${ort.c}` : ort.n;
		sync();
	});

	root.addEventListener("input", sync);
	root.addEventListener("change", sync);
	// On the document, not on the root: the settings form lives inside a <details> that
	// may be closed, and its events are the same either way.
	//
	// Which is also why it has to be un-registered by hand. boot() runs on every
	// astro:page-load and Base.astro ships <ClientRouter />, so a view transition swaps
	// document.body — taking the root listeners above with it — while `document` itself
	// survives. Without this, three visits to the builder leave three live listeners, and
	// the next settings change runs sync() three times against a detached DOM, each one
	// arming a 400 ms timer that writes `src` on an iframe no longer in the page and each
	// one pinning that visit's copy of the mosque and place datasets.
	if (onSettingsChange) document.removeEventListener(BT_SETTINGS_CHANGE, onSettingsChange);
	onSettingsChange = (e: Event): void => {
		settings = (e as CustomEvent<BtSettingsChangeDetail>).detail.settings;
		sync();
	};
	document.addEventListener(BT_SETTINGS_CHANGE, onSettingsChange);

	copyBtn?.addEventListener("click", async () => {
		const url = urlOut?.textContent ?? "";
		try {
			await navigator.clipboard.writeText(url);
			copyBtn.textContent = "Kopierad";
			window.setTimeout(() => {
				copyBtn.textContent = "Kopiera länk";
			}, 2000);
		} catch {
			// Clipboard blocked (an insecure context, or a browser that wants a permission).
			// The URL is on screen and selectable, which is the fallback that always works.
			// It sits under the buttons, so "nedan".
			copyBtn.textContent = "Markera länken nedan";
		}
	});

	sync();
}

document.addEventListener("astro:page-load", boot);
