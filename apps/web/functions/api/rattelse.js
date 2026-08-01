// Reader-submitted corrections: validate, gate on Turnstile, store in D1, notify.
//
// The root _middleware.js passes non-GET straight to next(), so this route is
// untouched by markdown negotiation.

const LIMITS = {
	page: 200,
	passage: 1000,
	description: 4000,
	source: 500,
	reporter_email: 200,
};

const MIN_DESCRIPTION = 10;
const MAX_PER_HOUR = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATH_PATTERN = /^\/[\w\-./åäöÅÄÖ]*$/;

// Site-relative path only. The pattern alone is not enough: it allows `/` anywhere,
// so "//evil.example/x" matches it — and that value is interpolated into the
// notification mail as `https://islam.se{page}` and into `pnpm rattelser`'s output.
// Resolving against the canonical origin is what actually proves it stays on-site.
function isSitePath(page) {
	if (!PATH_PATTERN.test(page)) return false;
	try {
		return new URL(page, "https://islam.se").origin === "https://islam.se";
	} catch {
		return false;
	}
}

function fail(error, status) {
	return Response.json({ ok: false, error }, { status });
}

// Same-origin guard. Comparing against the request's own host rather than a fixed
// allowlist keeps this working on islam.se, on every per-deploy *.pages.dev preview
// host, and under `wrangler pages dev` — an allowlist silently broke the last two.
function sameOrigin(request) {
	const origin = request.headers.get("origin");
	if (!origin) return true;
	try {
		return new URL(origin).host === new URL(request.url).host;
	} catch {
		return false;
	}
}

function field(body, name) {
	const raw = body[name];
	if (typeof raw !== "string") return "";
	return raw.trim().slice(0, LIMITS[name]);
}

async function hashIp(ip, salt) {
	const bytes = new TextEncoder().encode(`${salt}:${ip}`);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 32);
}

async function passesTurnstile(token, ip, secret) {
	const form = new FormData();
	form.append("secret", secret);
	form.append("response", token);
	if (ip) form.append("remoteip", ip);

	const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		body: form,
	});
	if (!res.ok) return false;
	const outcome = await res.json();
	return outcome.success === true;
}

export async function onRequestPost(context) {
	const { request, env } = context;

	if (!sameOrigin(request)) return fail("bad_origin", 403);

	// ⚠️ Both are Pages project secrets and neither can be defaulted. An unset IP_SALT
	// would hash the literal "undefined:<ip>", which is brute-forceable over the whole
	// IPv4 space and breaks the promise in integritetspolicy.astro; an unset
	// TURNSTILE_SECRET makes siteverify fail every reader with no server-side trace.
	// Failing loudly here is the only way either becomes visible.
	if (!(env.TURNSTILE_SECRET && env.IP_SALT)) {
		console.error("rattelse: missing secret", {
			turnstile_secret: Boolean(env.TURNSTILE_SECRET),
			ip_salt: Boolean(env.IP_SALT),
		});
		return fail("server_misconfigured", 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return fail("bad_json", 400);
	}

	// Honeypot: a real reader never sees this input, so anything in it is a bot.
	// Answer 200 so the bot has nothing to tune against.
	if (typeof body.website === "string" && body.website.trim() !== "") {
		return Response.json({ ok: true });
	}

	const page = field(body, "page");
	const passage = field(body, "passage");
	const description = field(body, "description");
	const source = field(body, "source");
	const reporterEmail = field(body, "reporter_email");

	if (!isSitePath(page)) return fail("bad_page", 400);
	if (description.length < MIN_DESCRIPTION) return fail("description_too_short", 400);
	if (reporterEmail && !EMAIL_PATTERN.test(reporterEmail)) return fail("bad_email", 400);

	const token = typeof body.turnstile_token === "string" ? body.turnstile_token : "";
	if (!token) return fail("missing_turnstile", 400);

	const ip = request.headers.get("cf-connecting-ip") || "";
	if (!(await passesTurnstile(token, ip, env.TURNSTILE_SECRET))) {
		return fail("turnstile_failed", 403);
	}

	const ipHash = await hashIp(ip, env.IP_SALT);

	// Format matches the column's own strftime default, so this compares as a string.
	const recent = await env.RATTELSER.prepare(
		`SELECT COUNT(*) AS n FROM corrections
		 WHERE ip_hash = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')`,
	)
		.bind(ipHash)
		.first();

	if (recent && recent.n >= MAX_PER_HOUR) return fail("rate_limited", 429);

	const inserted = await env.RATTELSER.prepare(
		`INSERT INTO corrections (page, passage, description, source, reporter_email, ip_hash)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
		 RETURNING id`,
	)
		.bind(page, passage || null, description, source || null, reporterEmail || null, ipHash)
		.first();

	const id = inserted?.id ?? 0;

	// The correction is already safe in D1; a failed notification must not fail the
	// submission, or the reader retries and we store it twice.
	try {
		const res = await env.MAILER.fetch("https://rattelse-mailer.internal/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id,
				page,
				passage,
				description,
				source,
				reporter_email: reporterEmail,
			}),
		});
		if (!res.ok) console.error("rattelse notify failed", { id, status: res.status });
	} catch (error) {
		console.error("rattelse notify threw", { id, message: String(error) });
	}

	return Response.json({ ok: true, id });
}

export async function onRequest() {
	return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
