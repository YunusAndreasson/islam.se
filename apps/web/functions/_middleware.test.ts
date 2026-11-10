import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./_middleware.js";

function setup(path = "/essay/", accept = "text/markdown", method = "GET") {
	const fetch = vi.fn(
		async (_request: Request) =>
			new Response("# Essay", { headers: { "content-type": "text/markdown; charset=utf-8" } }),
	);
	const next = vi.fn(
		async () =>
			new Response("<h1>Essay</h1>", {
				headers: { "content-type": "text/html", vary: "Accept-Encoding" },
			}),
	);
	return {
		request: new Request(`https://islam.se${path}`, { method, headers: { accept } }),
		env: { ASSETS: { fetch } },
		next,
	};
}

describe("Markdown negotiation", () => {
	it("serves a Markdown twin and makes HEAD bodyless", async () => {
		for (const method of ["GET", "HEAD"]) {
			const context = setup("/essay/", "text/markdown", method);
			const response = await onRequest(context);
			expect(await response.text()).toBe(method === "HEAD" ? "" : "# Essay");
			expect(response.headers.get("vary")).toBe("Accept");
			expect(context.next).not.toHaveBeenCalled();
		}
	});

	// Markdown was served whenever text/markdown appeared at all, so a client that
	// preferred HTML and listed markdown only as a fallback got markdown.
	it("serves Markdown only when it is ranked at least as high as HTML", async () => {
		const cases: Array<[string, boolean]> = [
			["text/markdown, text/html;q=0.9", true],
			["text/markdown, text/html", true],
			["text/html, text/markdown;q=0.1", false],
			["text/html,application/xhtml+xml,*/*;q=0.8", false],
			["*/*", false],
		];
		for (const [accept, markdown] of cases) {
			const context = setup("/essay/", accept);
			const response = await onRequest(context);
			expect(await response.text(), `Accept: ${accept}`).toBe(
				markdown ? "# Essay" : "<h1>Essay</h1>",
			);
		}
	});

	// A path starting // used to be resolved as a network-path reference, changing
	// the host of the subrequest (and canonical URL) to attacker-controlled input.
	it("keeps double-slash asset requests on the site's origin", async () => {
		const context = setup("//evil.example/essay/");
		await onRequest(context);
		const request = context.env.ASSETS.fetch.mock.calls[0]?.[0];
		expect(request?.url).toBe("https://islam.se//evil.example/essay/index.md");
		expect(request?.redirect).toBe("manual");
	});

	it("keeps double-slash canonical links on-site", async () => {
		const context = setup("//evil.example/essay.md", "text/html");
		const response = await onRequest(context);
		expect(response.headers.get("link")).toBe(
			'<https://islam.se//evil.example/essay/>; rel="canonical"',
		);
	});

	// Cloudflare's HTML fallback can be a successful response for a missing .md.
	it("does not label fallback HTML as Markdown", async () => {
		const context = setup();
		context.env.ASSETS.fetch.mockImplementation(
			async () =>
				new Response("<html>fallback</html>", {
					headers: { "content-type": "text/html" },
				}),
		);
		const response = await onRequest(context);
		expect(await response.text()).toBe("<h1>Essay</h1>");
		expect(response.headers.get("vary")).toBe("Accept-Encoding, Accept");
	});

	it.each(["text/markdown;q=0", "text/markdown-other", "text/markdown;q=bad"])(
		"does not negotiate an unacceptable media range: %s",
		async (accept) => {
			const context = setup("/essay/", accept);
			await onRequest(context);
			expect(context.env.ASSETS.fetch).not.toHaveBeenCalled();
		},
	);

	it("preserves HTML when the asset binding fails or is absent", async () => {
		const context = setup();
		context.env.ASSETS.fetch.mockRejectedValue(new Error("asset unavailable"));
		expect(await (await onRequest(context)).text()).toBe("<h1>Essay</h1>");
		expect(await (await onRequest({ ...context, env: {} })).text()).toBe("<h1>Essay</h1>");
	});

	it("leaves non-GET requests untouched", async () => {
		const context = setup("/api/rattelse", "text/markdown", "POST");
		await onRequest(context);
		expect(context.env.ASSETS.fetch).not.toHaveBeenCalled();
		expect(context.next).toHaveBeenCalledOnce();
	});
});
