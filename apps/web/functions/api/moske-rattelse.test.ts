import { beforeEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error — plain JS module, no types; it runs on the Workers runtime.
import { onRequest, onRequestPost } from "./moske-rattelse.js";

// A minimal, valid report: "the address is wrong, here is the right one".
const VALID = {
	mosque_id: "alsalam-moske-karlshamn",
	mosque_name: "Alsalam moské, Karlshamn",
	city_slug: "morrum",
	kommun: "Karlshamn",
	lan: "Blekinge",
	current_address: "Fabriksvägen, Buskelund, Mörrum",
	reason: "adress",
	description: "Rätt adress är Storgatan 9",
	reporter_email: "",
	app_version: "1.0.4",
};

let binds: unknown[] = [];
let mailed: Record<string, unknown> | null = null;

/** env with a D1 stand-in that records what was inserted, and a capturing mailer. */
function env({ count = 0, salt = "test-salt" }: { count?: number; salt?: string } = {}) {
	return {
		IP_SALT: salt,
		RATTELSER: {
			prepare: (sql: string) => ({
				bind: (...args: unknown[]) => {
					if (sql.includes("INSERT")) binds = args;
					return { first: async () => (sql.includes("INSERT") ? { id: 99 } : { n: count }) };
				},
			}),
		},
		MAILER: {
			fetch: async (_url: string, init: RequestInit) => {
				mailed = JSON.parse(String(init.body));
				return { ok: true, status: 200 };
			},
		},
	};
}

function post(body: unknown, ip = "203.0.113.4") {
	return {
		method: "POST",
		headers: { get: (name: string) => (name === "cf-connecting-ip" ? ip : null) },
		json: async () => {
			if (typeof body === "string") throw new SyntaxError("bad json");
			return body;
		},
	};
}

async function call(body: unknown, e = env()) {
	const res = await onRequestPost({ request: post(body), env: e });
	return { status: res.status ?? 200, body: await res.json() };
}

describe("POST /api/moske-rattelse", () => {
	beforeEach(() => {
		binds = [];
		mailed = null;
		vi.restoreAllMocks();
	});

	it("stores a valid report and answers with its case number", async () => {
		const res = await call(VALID);
		expect(res.body).toEqual({ ok: true, id: 99 });

		// kind is hard-coded in the SQL, so the binds start at `page`. Order matters —
		// a reshuffle here would file the reason as the description.
		const [page, mosqueId, reason, snapshot, description, email, ipHash] = binds as string[];
		expect(page).toBe("/moskeer/morrum/");
		expect(mosqueId).toBe(VALID.mosque_id);
		expect(reason).toBe("adress");
		expect(description).toBe(VALID.description);
		expect(email).toBeNull();
		expect(ipHash).toMatch(/^[0-9a-f]{32}$/);
		// The snapshot is what triage compares the report against, since the web dataset
		// and the app's vendored copy have drifted.
		expect(snapshot).toContain(VALID.current_address);
		expect(snapshot).toContain("app 1.0.4");
	});

	it("hands the mailer the mosque shape, not the article shape", async () => {
		await call(VALID);
		// Without `kind` the mailer would render this as an article correction — the page
		// URL alone, dropping the mosque id and reason that say what to actually edit.
		expect(mailed?.kind).toBe("mosque");
		expect(mailed?.mosque_name).toBe(VALID.mosque_name);
	});

	// ⚠️ Never defaultable: hashing "undefined:<ip>" is brute-forceable across the whole
	// IPv4 space and breaks the promise in integritetspolicy.astro. Fail loudly instead.
	it("refuses to run without IP_SALT rather than hashing a constant", async () => {
		// Silenced, not ignored: the assertion below is that it DID log.
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const res = await call(VALID, env({ salt: "" }));
		expect(res.status).toBe(500);
		expect(res.body.error).toBe("server_misconfigured");
		expect(spy).toHaveBeenCalled();
	});

	it("rejects a body that is not JSON", async () => {
		const res = await call("<html>not json</html>");
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("bad_json");
	});

	describe("mosque identity", () => {
		// The id is interpolated into the notification mail and printed by `pnpm rattelser`.
		// A slug shape is the cheap guard that keeps anything else out of both.
		it.each([
			["a path", "../../etc/passwd"],
			["a URL", "https://evil.example/x"],
			["upper case and spaces", "Alsalam Moské"],
			["too short", "ab"],
			["empty", ""],
		])("rejects %s as a mosque id", async (_label, mosque_id) => {
			const res = await call({ ...VALID, mosque_id });
			expect(res.status).toBe(400);
			expect(res.body.error).toBe("bad_mosque");
		});

		it("rejects a report with no mosque name", async () => {
			const res = await call({ ...VALID, mosque_name: "" });
			expect(res.body.error).toBe("bad_mosque");
		});

		// city_slug becomes the `page` column. A traversal here would write a bogus path
		// that the triage output then prints as a link.
		it("rejects a city slug that is not a slug", async () => {
			const res = await call({ ...VALID, city_slug: "../admin" });
			expect(res.body.error).toBe("bad_mosque");
		});
	});

	describe("reason and description", () => {
		it.each(["stangd", "adress", "namn", "plats", "annat"])(
			"accepts the reason %s",
			async (reason) => {
				// Text is supplied so only the reason itself is under test here.
				const res = await call({ ...VALID, reason, description: "en beskrivning" });
				expect(res.body.ok).toBe(true);
			},
		);

		it("rejects a reason outside the enum", async () => {
			const res = await call({ ...VALID, reason: "något-annat-påhittat" });
			expect(res.status).toBe(400);
			expect(res.body.error).toBe("bad_reason");
		});

		// "Moskén har stängt" is complete on its own — the reason IS the report. Every other
		// reason names a value we do not have, so a report without it cannot be applied.
		it("accepts a closure with no description", async () => {
			const res = await call({ ...VALID, reason: "stangd", description: "" });
			expect(res.body.ok).toBe(true);
			// The column is NOT NULL, so the endpoint substitutes a readable placeholder.
			expect(binds[4]).toBe("(ingen beskrivning)");
		});

		it.each(["adress", "namn", "plats", "annat"])(
			"requires a description for %s",
			async (reason) => {
				const res = await call({ ...VALID, reason, description: "  " });
				expect(res.status).toBe(400);
				expect(res.body.error).toBe("description_required");
			},
		);

		// Three characters, not the article form's ten: the reason already says what is
		// wrong, so "Al-Huda" is a complete answer to "what is the right name?".
		it("accepts a very short but complete answer", async () => {
			const res = await call({ ...VALID, reason: "namn", description: "Al-Huda" });
			expect(res.body.ok).toBe(true);
		});

		it("clamps an overlong description instead of rejecting it", async () => {
			const res = await call({ ...VALID, description: "x".repeat(9000) });
			expect(res.body.ok).toBe(true);
			expect(String(binds[4])).toHaveLength(4000);
		});
	});

	describe("reporter email", () => {
		it("is optional", async () => {
			expect((await call({ ...VALID, reporter_email: "" })).body.ok).toBe(true);
		});

		it("is stored when well-formed", async () => {
			await call({ ...VALID, reporter_email: "someone@example.com" });
			expect(binds[5]).toBe("someone@example.com");
		});

		it("is rejected when malformed", async () => {
			const res = await call({ ...VALID, reporter_email: "not-an-address" });
			expect(res.status).toBe(400);
			expect(res.body.error).toBe("bad_email");
		});
	});

	// The only real abuse control this endpoint has, since there is no Turnstile.
	it("blocks a reporter who is over the hourly cap", async () => {
		const res = await call(VALID, env({ count: 5 }));
		expect(res.status).toBe(429);
		expect(res.body.error).toBe("rate_limited");
		expect(binds).toEqual([]);
		expect(mailed).toBeNull();
	});

	it("answers 405 to anything that is not a POST", async () => {
		const res = await onRequest();
		expect(res.status).toBe(405);
		expect(res.headers.get("allow")).toBe("POST");
	});
});
