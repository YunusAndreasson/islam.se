import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./rattelse.js";

const valid = {
	page: "/svar/test/",
	description: "En rättelse med tillräcklig text",
	turnstile_token: "test-token",
};

function setup(body: unknown = valid, origin = "https://islam.se") {
	const first = vi.fn(async () => ({ n: 0, id: 7 }));
	const prepare = vi.fn(() => ({ bind: () => ({ first }) }));
	const mail = vi.fn(async () => ({ ok: true, status: 200 }));
	const context = {
		request: new Request("https://islam.se/api/rattelse", {
			method: "POST",
			headers: { origin, "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
		env: {
			IP_SALT: "test-salt",
			TURNSTILE_SECRET: "test-secret",
			RATTELSER: { prepare },
			MAILER: { fetch: mail },
		},
	};
	return { context, prepare, mail };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("article correction boundary", () => {
	// Matching just the host accepted HTTP origins for the HTTPS endpoint.
	it("rejects a different scheme before verifying or storing", async () => {
		const { context, prepare } = setup(valid, "http://islam.se");
		const response = await onRequestPost(context);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ ok: false, error: "bad_origin" });
		expect(prepare).not.toHaveBeenCalled();
	});

	// A successful HTTP response can still contain null, invalid JSON or an array.
	// Such upstream responses must fail closed without throwing a TypeError.
	it.each(["null", "[]", "not JSON", '{"success":false}'])(
		"rejects an invalid verification response: %s",
		async (body) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(body)),
			);
			const { context, prepare, mail } = setup();
			const response = await onRequestPost(context);
			expect(response.status).toBe(403);
			expect(prepare).not.toHaveBeenCalled();
			expect(mail).not.toHaveBeenCalled();
		},
	);

	it("stores and notifies only after successful verification", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ success: true })),
		);
		const { context, mail } = setup();
		const response = await onRequestPost(context);
		expect(await response.json()).toEqual({ ok: true, id: 7 });
		expect(mail).toHaveBeenCalledOnce();
	});
});

// A network failure used to escape the handler; a stalled fetch had no deadline.
it("bounds verification time and answers service failures without storing", async () => {
	const started = Promise.withResolvers<void>();
	const fetchMock = vi.fn(
		(_url: string, init: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
				started.resolve();
			}),
	);
	vi.stubGlobal("fetch", fetchMock);
	// AbortSignal.timeout uses runtime timers, so mock its factory rather than sleeping.
	const controller = new AbortController();
	const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
	try {
		const { context, prepare } = setup();
		const pending = onRequestPost(context);
		await started.promise;
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(timeout).toHaveBeenCalledWith(5000);
		controller.abort();
		expect((await pending).status).toBe(503);
		expect(prepare).not.toHaveBeenCalled();
	} finally {
		timeout.mockRestore();
	}
});
