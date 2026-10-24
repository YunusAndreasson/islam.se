import { afterEach, describe, expect, it, vi } from "vitest";
import { readStored, readStoredJson, removeStored, writeStored } from "./web-storage";

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

describe("web storage", () => {
	it("round-trips a string and removes it", () => {
		vi.stubGlobal("localStorage", memoryStorage());
		writeStored("k", "v");
		expect(readStored("k")).toBe("v");
		removeStored("k");
		expect(readStored("k")).toBeNull();
	});

	it("parses stored JSON and reads anything unparseable as nothing stored", () => {
		vi.stubGlobal("localStorage", memoryStorage());
		writeStored("ok", JSON.stringify({ time: 12 }));
		writeStored("broken", "{");
		expect(readStoredJson("ok")).toEqual({ time: 12 });
		expect(readStoredJson("broken"), "a corrupt entry must read as absent, not throw").toBeNull();
		expect(readStoredJson("missing")).toBeNull();
	});

	it("never throws when storage is blocked", () => {
		vi.stubGlobal("localStorage", blockedStorage());
		// Every caller relies on this: a throw here escapes into scroll handlers and
		// page-load hooks and leaves the page half set up.
		expect(() => writeStored("k", "v")).not.toThrow();
		expect(() => removeStored("k")).not.toThrow();
		expect(readStored("k")).toBeNull();
		expect(readStoredJson("k")).toBeNull();
	});

	it("never throws where there is no storage at all", () => {
		// Node, and a sandboxed iframe that denies the global outright.
		expect(readStored("k")).toBeNull();
		expect(() => writeStored("k", "v")).not.toThrow();
	});
});
