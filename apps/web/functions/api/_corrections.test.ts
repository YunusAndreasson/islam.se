import { describe, expect, it, vi } from "vitest";

// A plain JS module — it runs on the Workers runtime; types are inferred via `allowJs`.
import {
	clampField,
	hashIp,
	isRateLimited,
	MAX_PER_HOUR,
	notifyMailer,
	readJsonObject,
} from "./_corrections.js";

/** A D1 stand-in whose COUNT(*) answers with `n`. */
function db(n: number) {
	return {
		prepare: () => ({ bind: () => ({ first: async () => ({ n }) }) }),
	};
}

describe("clampField", () => {
	it("trims and truncates to the caller's limit", () => {
		expect(clampField({ a: "  hej  " }, "a", 10)).toBe("hej");
		expect(clampField({ a: "x".repeat(50) }, "a", 10)).toHaveLength(10);
	});

	// Anything non-string reads as "" rather than reaching validation as a number, an
	// object or undefined — every caller then only has to reason about strings.
	it("reads any non-string as an empty string", () => {
		expect(clampField({ a: 42 }, "a", 10)).toBe("");
		expect(clampField({ a: null }, "a", 10)).toBe("");
		expect(clampField({}, "a", 10)).toBe("");
		expect(clampField({ a: { toString: () => "sneaky" } }, "a", 10)).toBe("");
	});
});

describe("readJsonObject", () => {
	const req = (json: () => Promise<unknown>) => ({ json });
	const ok = (body: unknown) => req(async () => body);

	it("returns the parsed object", async () => {
		await expect(readJsonObject(ok({ page: "/x/" }))).resolves.toEqual({ page: "/x/" });
	});

	// ⚠️ THE BUG THIS EXISTS FOR: `null` is valid JSON, so `request.json()` resolved and the
	// try/catch never fired — then the first field read threw TypeError ("Cannot read
	// properties of null"), and an unhandled throw in a Pages Function is a 500. One
	// `curl -d null` produced a server error on BOTH correction endpoints where a 400 was
	// intended. Anything that is not a JSON object must come back as null so the caller
	// answers bad_json.
	it.each([
		["null", null],
		["a number", 5],
		["a string", "hi"],
		["a boolean", true],
		["an array", []],
	])("refuses %s", async (_label, body) => {
		await expect(readJsonObject(ok(body))).resolves.toBeNull();
	});

	it("refuses a body that is not JSON at all", async () => {
		await expect(
			readJsonObject(
				req(async () => {
					throw new SyntaxError("Unexpected token <");
				}),
			),
		).resolves.toBeNull();
	});
});

describe("hashIp", () => {
	it("is deterministic and fixed-width", async () => {
		const a = await hashIp("203.0.113.4", "salt");
		const b = await hashIp("203.0.113.4", "salt");
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{32}$/);
	});

	// THE PRIVACY PROPERTY: integritetspolicy.astro promises the raw IP is never stored.
	// The hash must not be reversible by inspection, and it must not leak the address.
	it("never contains the address it hashed", async () => {
		expect(await hashIp("203.0.113.4", "salt")).not.toContain("203");
	});

	// The salt is the whole reason this is not brute-forceable: without it an attacker
	// could hash all 4 billion IPv4 addresses and match rows. Two salts must disagree.
	it("separates the same address under different salts", async () => {
		const withA = await hashIp("203.0.113.4", "salt-a");
		const withB = await hashIp("203.0.113.4", "salt-b");
		expect(withA).not.toBe(withB);
	});

	it("separates different addresses under the same salt", async () => {
		expect(await hashIp("203.0.113.4", "s")).not.toBe(await hashIp("203.0.113.5", "s"));
	});
});

describe("isRateLimited", () => {
	// The boundary is the whole point: MAX_PER_HOUR submissions must still be allowed and
	// the next one blocked. An off-by-one here either lets in one extra or silently costs
	// an honest reporter their last attempt.
	it("allows up to the cap and blocks at it", async () => {
		expect(await isRateLimited(db(MAX_PER_HOUR - 1), "hash")).toBe(false);
		expect(await isRateLimited(db(MAX_PER_HOUR), "hash")).toBe(true);
		expect(await isRateLimited(db(MAX_PER_HOUR + 1), "hash")).toBe(true);
	});

	it("treats an empty count as not limited", async () => {
		const empty = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };
		expect(await isRateLimited(empty, "hash")).toBe(false);
	});
});

describe("notifyMailer", () => {
	it("posts the payload as JSON to the service binding", async () => {
		const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
		await notifyMailer({ MAILER: { fetch: fetchMock } }, { id: 3, page: "/x/" }, "test");

		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({ id: 3, page: "/x/" });
	});

	// THE INVARIANT: the correction is already committed to D1 before this runs. If a mail
	// failure propagated, the endpoint would answer 500, the reporter would submit again,
	// and we would store the same correction twice. Both failure shapes stay swallowed.
	it("swallows a mailer error rather than failing the stored submission", async () => {
		// Silenced, not ignored: the assertion below is that both paths DID log.
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		await expect(
			notifyMailer(
				{ MAILER: { fetch: async () => ({ ok: false, status: 502 }) } },
				{ id: 1 },
				"test",
			),
		).resolves.toBeUndefined();

		await expect(
			notifyMailer(
				{
					MAILER: {
						fetch: async () => {
							throw new Error("binding down");
						},
					},
				},
				{ id: 2 },
				"test",
			),
		).resolves.toBeUndefined();

		// Swallowed, but never silent — the operator needs a trace for both paths.
		expect(spy).toHaveBeenCalledTimes(2);
		spy.mockRestore();
	});
});
