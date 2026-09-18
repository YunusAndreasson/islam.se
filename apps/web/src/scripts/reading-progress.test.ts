import { afterEach, describe, expect, it, vi } from "vitest";
import { readProgress, recordProgress } from "./reading-progress";

/** An in-memory stand-in for window.localStorage — the two methods the module uses. */
function memoryStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => {
			map.set(k, v);
		},
	};
}

/** What a hardened Firefox profile hands the page: touching storage throws. */
function blockedStorage() {
	const deny = () => {
		throw new DOMException("The operation is insecure.", "SecurityError");
	};
	return { getItem: deny, setItem: deny };
}

afterEach(() => vi.unstubAllGlobals());

describe("reading progress", () => {
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
