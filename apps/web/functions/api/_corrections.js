// Shared machinery for the two correction endpoints — /api/rattelse (reader
// corrections on an article) and /api/moske-rattelse (mosque data from the app).
//
// The two differ in what they validate and where the report comes from, but they
// share the parts that must NOT drift: the salted IP hash, the per-hour rate limit,
// and the fire-and-forget notification hand-off to the mailer Worker. Duplicating a
// rate limiter is how one copy quietly stops matching the other.
//
// Pages does not route files whose name starts with `_`, so this is a plain module.

/** Hard cap on submissions per hashed IP per hour, shared by both endpoints. */
export const MAX_PER_HOUR = 5;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function fail(error, status) {
	return Response.json({ ok: false, error }, { status });
}

/**
 * The request body as a JSON *object*, or null when it is anything else.
 *
 * ⚠️ `request.json()` resolves for any JSON value, and `null` is valid JSON — so a body of
 * literally `null` sailed straight through the try/catch and then threw TypeError on the
 * first field read (`body.website` in rattelse, `body[name]` via clampField in
 * moske-rattelse). An unhandled throw in a Pages Function is a 500, so one `curl -d null`
 * turned an intended 400 into a server error plus a logged exception, on both endpoints.
 * Primitives happened to survive (`(5).mosque_id` is undefined, so every field read "" and
 * validation answered 400) — but surviving by accident is not the same as being handled.
 *
 * Arrays are refused too: a correction is an object, and `[]` reaching the field readers
 * only ever produced a misleading `bad_page` / `bad_mosque`.
 *
 * Both endpoints read fields directly off the parsed body, so this check belongs here with
 * the rest of what must not drift between them.
 */
export async function readJsonObject(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return null;
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
	return body;
}

/** A trimmed, length-clamped string field. Anything non-string reads as "". */
export function clampField(body, name, max) {
	const raw = body[name];
	if (typeof raw !== "string") return "";
	return raw.trim().slice(0, max);
}

/**
 * Salted SHA-256 of the client IP, truncated to 32 hex chars. The raw IP is never
 * stored — integritetspolicy.astro promises exactly this, which is why callers must
 * fail loudly on a missing IP_SALT rather than hashing the literal "undefined:<ip>"
 * (brute-forceable across the whole IPv4 space).
 */
export async function hashIp(ip, salt) {
	const bytes = new TextEncoder().encode(`${salt}:${ip}`);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 32);
}

/**
 * True when this hashed IP has already filed MAX_PER_HOUR reports in the last hour.
 * The timestamp format matches the column's own strftime default, so the window
 * compares as a plain string; corrections_ip_hash_idx backs the lookup.
 */
export async function isRateLimited(db, ipHash) {
	const recent = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM corrections
			 WHERE ip_hash = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')`,
		)
		.bind(ipHash)
		.first();
	return Boolean(recent && recent.n >= MAX_PER_HOUR);
}

/**
 * Hand the stored correction to the mailer Worker over the service binding.
 *
 * The correction is already safe in D1 by the time this runs, so a failed
 * notification must never fail the submission — the reporter would retry and we
 * would store it twice. Every failure path is logged and swallowed.
 */
export async function notifyMailer(env, payload, label) {
	try {
		const res = await env.MAILER.fetch("https://rattelse-mailer.internal/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!res.ok) console.error(`${label} notify failed`, { id: payload.id, status: res.status });
	} catch (error) {
		console.error(`${label} notify threw`, { id: payload.id, message: String(error) });
	}
}
