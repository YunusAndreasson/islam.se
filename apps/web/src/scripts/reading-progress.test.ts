import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRead, READ_AT, readProgress, recordProgress } from "./reading-progress";

/** An in-memory stand-in for window.localStorage — the methods the module uses. */
function memoryStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => {
			map.set(k, v);
		},
		removeItem: (k: string) => {
			map.delete(k);
		},
	};
}

/** What a hardened Firefox profile hands the page: touching storage throws. */
function blockedStorage() {
	const deny = () => {
		throw new DOMException("The operation is insecure.", "SecurityError");
	};
	return { getItem: deny, setItem: deny, removeItem: deny };
}

afterEach(() => vi.unstubAllGlobals());

describe("reading progress", () => {
	it.each(["Infinity", "-0.5", "2", "NaN", "broken"])(
		"ignores invalid saved progress %s",
		(value) => {
			const storage = memoryStorage();
			storage.setItem("rp:natten", value);
			vi.stubGlobal("localStorage", storage);
			expect(readProgress("natten")).toBe(0);
			recordProgress("natten", 0.4);
			expect(readProgress("natten")).toBe(0.4);
		},
	);

	it.each([NaN, Infinity, -0.5, 2])("ignores invalid incoming progress %s", (value) => {
		vi.stubGlobal("localStorage", memoryStorage());
		recordProgress("natten", 0.4);
		recordProgress("annan", value);
		expect(readProgress("natten")).toBe(0.4);
		expect(readProgress("annan")).toBe(0);
	});

	it("removes the retired »Fortsätt läsa« record, which named the last essay read", async () => {
		// Nothing has read `rp:last` since the front page dropped its offer (2026-09-28), and
		// the privacy page does not list it; it went on being written on every essay.
		const storage = memoryStorage();
		storage.setItem("rp:last", JSON.stringify({ slug: "natten", title: "Natten" }));
		storage.setItem("rp:natten", "0.4");
		vi.stubGlobal("localStorage", storage);
		vi.resetModules();
		await import("./reading-progress");
		expect(storage.getItem("rp:last")).toBeNull();
		expect(storage.getItem("rp:natten"), "an essay's own progress stays").toBe("0.4");
	});

	it("keeps the furthest point read, so scrolling back up never loses the place", () => {
		vi.stubGlobal("localStorage", memoryStorage());
		recordProgress("alis-princip", 0.6);
		recordProgress("alis-princip", 0.2);
		expect(readProgress("alis-princip")).toBe(0.6);
		recordProgress("alis-princip", 0.9);
		expect(readProgress("alis-princip")).toBe(0.9);
	});

	it("reads an essay never opened as 0", () => {
		vi.stubGlobal("localStorage", memoryStorage());
		expect(readProgress("tyst-teologi")).toBe(0);
	});

	// The bug: Base.astro called localStorage bare from its scroll handler and from the
	// astro:before-swap hook that aborts its listeners. With storage blocked the throw
	// skipped the abort, so every in-site navigation stacked another set of handlers.
	it("never throws when storage is blocked", () => {
		vi.stubGlobal("localStorage", blockedStorage());
		expect(() => recordProgress("alis-princip", 0.5)).not.toThrow();
		expect(readProgress("alis-princip")).toBe(0);
	});
});

// /essaer/ marked a row »läst« past 0.85 with its own inline comparison; the trådar on
// the front page fill a stop by the same rule. One helper, so the two surfaces cannot
// disagree about whether the same essay has been read.
describe("hasRead", () => {
	it("counts an essay as read only once the reader is past READ_AT", () => {
		vi.stubGlobal("localStorage", memoryStorage());
		recordProgress("natten", READ_AT);
		expect(hasRead("natten"), "exactly at the threshold is still »resume«, not »read«").toBe(false);
		recordProgress("natten", 0.9);
		expect(hasRead("natten")).toBe(true);
	});

	it("treats an essay never opened, or blocked storage, as unread instead of throwing", () => {
		vi.stubGlobal("localStorage", memoryStorage());
		expect(hasRead("tyst-teologi")).toBe(false);
		vi.stubGlobal("localStorage", blockedStorage());
		expect(() => hasRead("natten")).not.toThrow();
		expect(hasRead("natten")).toBe(false);
	});
});
