import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onPage } from "./page";

// The router's events, on a stand-in document: onPage only ever listens on `document`.
let doc: EventTarget;
const fire = (type: string) => doc.dispatchEvent(new Event(type));

beforeEach(() => {
	doc = new EventTarget();
	vi.stubGlobal("document", doc);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("onPage", () => {
	it("binds at once in ready mode, without waiting for the router's first page-load", () => {
		// The router fires its first `astro:page-load` from the window's `load` event; the
		// search palette bound there was dead until the last image of a cold visit arrived.
		const setup = vi.fn();
		onPage(setup);
		expect(setup, "ready mode must run when the module runs").toHaveBeenCalledTimes(1);
		fire("astro:page-load");
		expect(setup, "page-load must not bind a second time in ready mode").toHaveBeenCalledTimes(1);
	});

	it("unbinds before every swap and binds again after it", () => {
		const signals: AbortSignal[] = [];
		const cleanup = vi.fn();
		onPage((signal) => {
			signals.push(signal);
			return cleanup;
		});
		fire("astro:before-swap");
		expect(signals[0]?.aborted, "the old page's listeners must go before the swap").toBe(true);
		expect(cleanup).toHaveBeenCalledTimes(1);
		fire("astro:after-swap");
		expect(signals).toHaveLength(2);
		expect(signals[1]?.aborted).toBe(false);
	});

	it("never leaves two bindings alive, even if a swap event goes missing", () => {
		const signals: AbortSignal[] = [];
		onPage((signal) => {
			signals.push(signal);
		});
		fire("astro:after-swap");
		expect(signals[0]?.aborted, "a second run must abort the first").toBe(true);
	});

	it("keeps the router's timing in load mode, for work that measures the finished page", () => {
		const setup = vi.fn();
		onPage(setup, { when: "load" });
		expect(setup).not.toHaveBeenCalled();
		fire("astro:page-load");
		expect(setup).toHaveBeenCalledTimes(1);
		fire("astro:after-swap");
		expect(setup).toHaveBeenCalledTimes(1);
	});
});
