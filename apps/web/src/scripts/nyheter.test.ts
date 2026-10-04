import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function setup() {
	vi.resetModules();
	const list = {
		innerHTML: "original",
		dataset: {},
		removeAttribute: vi.fn(),
	};
	const rail = { removeAttribute: vi.fn() };
	const document = Object.assign(new EventTarget(), {
		querySelector: vi.fn((selector: string) => (selector.includes('"rail"') ? list : null)),
		getElementById: vi.fn(() => rail),
	});
	const requests: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
	const fetch = vi.fn(
		(_url: string, options: RequestInit) =>
			new Promise<Response>((resolve) => {
				requests.push({ signal: options.signal as AbortSignal, resolve });
			}),
	);
	vi.stubGlobal("document", document);
	vi.stubGlobal("fetch", fetch);
	await import("./nyheter");
	const fire = (name: string) => document.dispatchEvent(new Event(name));
	return { document, list, rail, requests, fetch, fire };
}

const response = () =>
	Response.json({
		artiklar: [
			{
				slug: "test-news",
				datum: new Date().toISOString(),
				titel: "Aktuell nyhet",
				plats: "Stockholm",
				kategori: "politik",
				addedAt: Date.now(),
				kalla: "Källa",
				kallaUrl: "https://example.test/news",
				kartaUrl: "https://zuhd.news/s/test-news",
				lat: 59.3,
				lng: 18.1,
				region: "EU",
				stycken: ["Nyhetens text."],
				lander: [],
			},
		],
	});

describe("news navigation lifecycle", () => {
	it("renders a completed request on the current page", async () => {
		const page = await setup();
		page.fire("astro:page-load");
		expect(page.fetch).toHaveBeenCalledTimes(1);
		page.requests[0]?.resolve(response());
		await vi.waitFor(() => expect(page.list.innerHTML).toContain("Aktuell nyhet"));
		expect(page.rail.removeAttribute).toHaveBeenCalledWith("hidden");
	});

	it("cancels departed-page requests and ignores responses that race with cancellation", async () => {
		const page = await setup();
		page.fire("astro:page-load");
		const oldRequest = page.requests[0];
		page.fire("astro:before-swap");
		expect(oldRequest?.signal.aborted).toBe(true);
		page.document.getElementById.mockClear();
		// This fetch stub deliberately resolves even after abort, exercising the race guard.
		oldRequest?.resolve(response());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(page.list.innerHTML).toBe("original");
		expect(page.document.getElementById).not.toHaveBeenCalled();
		page.fire("astro:page-load");
		expect(page.requests[1]?.signal.aborted).toBe(false);
		page.requests[1]?.resolve(response());
		await vi.waitFor(() => expect(page.list.innerHTML).toContain("Aktuell nyhet"));
	});

	it("does not fetch on pages without a news surface", async () => {
		const page = await setup();
		page.document.querySelector.mockReturnValue(null);
		page.fire("astro:page-load");
		expect(page.fetch).not.toHaveBeenCalled();
	});

	it("removes the departed news page's highlight listeners", async () => {
		vi.resetModules();
		const item = {
			scrollIntoView: vi.fn(),
			classList: { add: vi.fn(), remove: vi.fn() },
		};
		const full = Object.assign(new EventTarget(), { dataset: { nyheterKalla: "edge" } });
		const document = Object.assign(new EventTarget(), {
			querySelector: (selector: string) => (selector.includes('"full"') ? full : null),
			querySelectorAll: () => [],
			getElementById: () => item,
		});
		const window = new EventTarget();
		vi.stubGlobal("document", document);
		vi.stubGlobal("window", window);
		vi.stubGlobal("location", { hash: "#nyhet-test-news" });
		await import("./nyheter");
		document.dispatchEvent(new Event("astro:page-load"));
		expect(item.classList.add).toHaveBeenCalledWith("nyhet--utpekad");
		document.dispatchEvent(new Event("astro:before-swap"));
		for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
			window.dispatchEvent(new Event(type));
		}
		expect(item.classList.remove).not.toHaveBeenCalled();
	});
});
