import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

/** The module boots when it is imported, as a module script does once the page is parsed
 *  (page.ts), and again after every swap; `surface: false` is a page without the bar. */
async function setup({ surface = true } = {}) {
	vi.resetModules();
	const list = {
		innerHTML: "original",
		dataset: {},
		removeAttribute: vi.fn(),
	};
	const rail = { setAttribute: vi.fn() };
	const document = Object.assign(new EventTarget(), {
		querySelector: vi.fn((selector: string) =>
			surface && selector.includes('"rail"') ? list : null,
		),
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
		// The request starts when the module runs, not at the router's first page-load,
		// which on a cold visit waits for every image on the page.
		const page = await setup();
		expect(page.fetch).toHaveBeenCalledTimes(1);
		page.requests[0]?.resolve(response());
		await vi.waitFor(() => expect(page.list.innerHTML).toContain("Aktuell nyhet"));
		// The bar holds its place from the first paint and is only SHOWN once it has
		// rows (nyheter.css keys on data-lage), so the page does not move when they land.
		expect(page.rail.setAttribute).toHaveBeenCalledWith("data-lage", "klar");
	});

	// A blocked or failed fetch is an ordinary outcome (a content blocker is enough).
	// The bar must then be taken out, not left as a held, empty place under the lead.
	it("takes the front page's bar out when the fetch brings nothing", async () => {
		const page = await setup();
		page.requests[0]?.resolve(new Response("", { status: 503 }));
		await vi.waitFor(() =>
			expect(
				page.rail.setAttribute,
				"with no news the bar must be marked »tom«, or its reserved place stays empty on the page",
			).toHaveBeenCalledWith("data-lage", "tom"),
		);
		expect(page.list.innerHTML).toBe("original");
	});

	it("cancels departed-page requests and ignores responses that race with cancellation", async () => {
		const page = await setup();
		const oldRequest = page.requests[0];
		page.fire("astro:before-swap");
		expect(oldRequest?.signal.aborted).toBe(true);
		page.document.getElementById.mockClear();
		// This fetch stub deliberately resolves even after abort, exercising the race guard.
		oldRequest?.resolve(response());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(page.list.innerHTML).toBe("original");
		expect(page.document.getElementById).not.toHaveBeenCalled();
		page.fire("astro:after-swap");
		expect(page.requests[1]?.signal.aborted).toBe(false);
		page.requests[1]?.resolve(response());
		await vi.waitFor(() => expect(page.list.innerHTML).toContain("Aktuell nyhet"));
	});

	it("does not fetch on pages without a news surface", async () => {
		const page = await setup({ surface: false });
		page.fire("astro:after-swap");
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
		expect(item.classList.add).toHaveBeenCalledWith("nyhet--utpekad");
		document.dispatchEvent(new Event("astro:before-swap"));
		for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
			window.dispatchEvent(new Event(type));
		}
		expect(item.classList.remove).not.toHaveBeenCalled();
	});
});
