import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { cloneSettings, loadSettings } from "./storage";

describe("loadSettings never hands out the shared defaults", () => {
	// THE BUG: both fallback branches returned the module-level DEFAULT_SETTINGS object
	// itself, and every caller mutates what it gets — the settings form does
	// `const s = loadSettings(); s.madhab = "hanafi"; saveSettings(s)`. So for any visitor
	// with nothing in localStorage, changing one setting rewrote DEFAULT_SETTINGS for the
	// rest of the page.
	//
	// It stayed invisible for as long as the result was only ever displayed. It stopped
	// being invisible the moment something compared against the defaults to decide what
	// was worth writing down: the moskéskärm encodes only the fields that differ from
	// their default, so a polluted default silently dropped the mosque's own calculation
	// method out of the link it was handed — a screen that then prayed by the wrong
	// method, with nothing on it to say so.
	//
	// There is no localStorage in this environment, so loadSettings finds nothing stored,
	// which is one of the two branches that was wrong.

	it("returns an object that is not the module's own defaults", () => {
		expect(loadSettings()).not.toBe(DEFAULT_SETTINGS);
	});

	it("survives a caller mutating what it was given", () => {
		const first = loadSettings();
		first.madhab = "hanafi";
		first.calculationMethod = "Turkey";
		first.adjustments.fajr = 7;

		expect(DEFAULT_SETTINGS.madhab, "a mutation reached the shared defaults").toBe("shafi");
		expect(DEFAULT_SETTINGS.calculationMethod).toBe("MuslimWorldLeague");
		expect(DEFAULT_SETTINGS.adjustments.fajr).toBe(0);
		expect(loadSettings().madhab, "the next caller inherited the mutation").toBe("shafi");
	});

	it("clones the nested objects, which is where callers actually reach", () => {
		const copy = cloneSettings(DEFAULT_SETTINGS);
		expect(copy.adjustments).not.toBe(DEFAULT_SETTINGS.adjustments);
		expect(copy.notifications).not.toBe(DEFAULT_SETTINGS.notifications);
		expect(copy.notifications.prayers).not.toBe(DEFAULT_SETTINGS.notifications.prayers);
		expect(copy).toEqual(DEFAULT_SETTINGS);
	});
});
