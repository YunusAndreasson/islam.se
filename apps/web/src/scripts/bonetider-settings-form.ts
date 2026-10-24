// Wiring for the prayer-settings form, lifted out of PrayerSettings.astro so the same
// markup can serve two callers that must not share state.
//
// The visitor's own settings go to localStorage and emit `bonetider:change`, which is
// what every PrayerField on the page listens to. The moskéskärm builder needs the same
// twelve controls with none of that: a mosque configuring a wall display must not
// silently overwrite the prayer settings of whoever happens to be sitting at the laptop.
// So the form carries a mode, and in `detached` mode it persists nothing and merely
// announces what it now holds.
//
// Both modes always dispatch BT_SETTINGS_CHANGE; `storage` additionally saves. The
// visitor path is therefore unchanged in behaviour, in DOM and in event order.
import type { PrayerAdjustments, PrayerSettings } from "../lib/bonetider/settings";
import { DEFAULT_SETTINGS } from "../lib/bonetider/settings";
import { highLatLabel, madhabLabel, methodLabel } from "../lib/bonetider/settings-options";
import {
	cloneSettings,
	loadSettings,
	sanitizeSettings,
	saveSettings,
} from "../lib/bonetider/storage";

export const BT_SETTINGS_CHANGE = "bt-settings-change";

export interface BtSettingsChangeDetail {
	settings: PrayerSettings;
}

/** Per-form draft, for the mode that must not touch localStorage. */
const drafts = new WeakMap<HTMLFormElement, PrayerSettings>();

function modeOf(form: HTMLFormElement): "storage" | "detached" {
	return form.dataset.btMode === "detached" ? "detached" : "storage";
}

/** Always a fresh object: onChange mutates what this returns. */
function read(form: HTMLFormElement): PrayerSettings {
	if (modeOf(form) === "storage") return loadSettings();
	return cloneSettings(drafts.get(form) ?? DEFAULT_SETTINGS);
}

function write(form: HTMLFormElement, s: PrayerSettings): void {
	if (modeOf(form) === "storage") {
		saveSettings(s); // persists + emits bonetider:change → every field repaints
	} else {
		drafts.set(form, s);
	}
	form.dispatchEvent(
		new CustomEvent<BtSettingsChangeDetail>(BT_SETTINGS_CHANGE, {
			bubbles: true,
			detail: { settings: s },
		}),
	);
}

/** Scoped to the form, not the document — a page may now hold more than one. */
function updateSummary(form: HTMLFormElement, s: PrayerSettings): void {
	const el = form.querySelector<HTMLElement>(".bt-set-summary");
	if (el)
		el.textContent = `${methodLabel(s)} · ${madhabLabel(s)} · Höga latituder: ${highLatLabel(s)} · Tidszon Europe/Stockholm`;
}

/** Push a settings object into the controls without announcing it back. */
function paintSettingsForm(form: HTMLFormElement, s: PrayerSettings): void {
	for (const el of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]")) {
		const key = el.dataset.setting as keyof PrayerSettings | undefined;
		if (key && key in s) el.value = String(s[key]);
	}
	for (const el of form.querySelectorAll<HTMLInputElement>("[data-adjust]")) {
		const key = el.dataset.adjust as keyof PrayerAdjustments;
		el.value = String(s.adjustments[key] ?? 0);
	}
	updateSummary(form, s);
}

function onChange(form: HTMLFormElement, e: Event): void {
	const el = e.target as HTMLInputElement | HTMLSelectElement;
	// These forms save on change, so browser submit validation never runs.
	// Reject invalid numbers before they reach storage or the detached screen draft.
	if (!el.validity.valid) {
		el.reportValidity();
		return;
	}
	let s = read(form);
	if (el.dataset.setting) {
		const key = el.dataset.setting;
		const value = key === "hijriOffset" ? Number(el.value) || 0 : el.value;
		// The funnel a stored or linked config goes through (storage.ts): a value its lists
		// do not hold takes its default instead of reaching the calculation.
		s = sanitizeSettings({ ...s, [key]: value });
	} else if (el.dataset.adjust) {
		s.adjustments = { ...s.adjustments, [el.dataset.adjust]: Number(el.value) || 0 };
	} else return;
	write(form, s);
	updateSummary(form, s);
}

function wireSettingsForm(form: HTMLFormElement, initial?: PrayerSettings): void {
	if (form.dataset.wired) return;
	form.dataset.wired = "1";
	if (modeOf(form) === "detached") drafts.set(form, cloneSettings(initial ?? DEFAULT_SETTINGS));
	paintSettingsForm(form, read(form));
	// `change` only: selects commit on selection and the two number inputs commit on
	// blur/Enter/spinner. Binding `input` too would re-save, re-announce the aria-live
	// summary, and repaint every field's canvas on every keystroke while typing a minute
	// adjustment – noisy for screen readers and wasteful.
	form.addEventListener("change", (e) => {
		onChange(form, e);
	});
}

/** Wires every unwired form under `root`. */
export function wireAllSettingsForms(root: ParentNode = document): void {
	for (const form of root.querySelectorAll<HTMLFormElement>(".bt-settings")) wireSettingsForm(form);
}
