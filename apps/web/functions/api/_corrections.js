// @ts-check
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

/** @param {string} error
 * @param {number} status */
export function fail(error, status) {
	return Response.json({ ok: false, error }, { status });
}

/** Enough for every correction field including JSON-escaped Unicode, without
 * buffering arbitrary request bodies or trusting the Content-Length header. */
export const MAX_JSON_BYTES = 64 * 1024;

/** Read a bounded JSON object, refusing malformed, oversized and non-object input.
 * Shared by request parsing and the small Turnstile verification response.
 * @param {{body: ReadableStream<Uint8Array> | null}} source
 * @returns {Promise<Record<string, unknown> | null>} */
export async function readJsonObject(source) {
	if (!source.body) return null;
	const reader = source.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_JSON_BYTES) {
				// Cancellation is cleanup; a stalled producer must not hold the response.
				reader.cancel().catch(() => undefined);
				return null;
			}
			text += decoder.decode(value, { stream: true });
		}
		/** @type {unknown} */
		const body = JSON.parse(text + decoder.decode());
		if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
		return /** @type {Record<string, unknown>} */ (body);
	} catch {
		return null;
	} finally {
		reader.releaseLock();
	}
}

/** A trimmed, length-clamped string field. Anything non-string reads as "". */
/** @param {Record<string, unknown>} body
 * @param {string} name
 * @param {number} max */
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
/** @param {string} ip
 * @param {string} salt */
export async function hashIp(ip, salt) {
	const bytes = new TextEncoder().encode(`${salt}:${ip}`);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 32);
}

/** Insert only if this IP is below the shared rolling-hour cap.
 * The condition and write execute as one statement, preventing concurrent
 * requests from all passing a separate COUNT query before any insert commits.
 * @param {import("./_types").CorrectionDatabase} db
 * @param {import("./_types").CorrectionInput} input
 * @returns {Promise<number | null>} null means the rate limit refused the insert. */
export async function storeCorrection(db, input) {
	const row = await db
		.prepare(`
		INSERT INTO corrections (kind, page, passage, description, source, reporter_email, ip_hash, mosque_id, reason)
		SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
		WHERE (SELECT COUNT(*) FROM corrections
			WHERE ip_hash = ?7 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')) < ?10
		RETURNING id
	`)
		.bind(
			input.kind,
			input.page,
			input.passage || null,
			input.description,
			input.source || null,
			input.reporterEmail || null,
			input.ipHash,
			input.mosqueId ?? null,
			input.reason ?? null,
			MAX_PER_HOUR,
		)
		.first();
	return row?.id ?? null;
}

/**
 * Hand the stored correction to the mailer Worker over the service binding.
 *
 * The correction is already safe in D1 by the time this runs, so a failed
 * notification must never fail the submission — the reporter would retry and we
 * would store it twice. Every failure path is logged and swallowed.
 */
/** @param {import("./_types").MailerEnvironment} env
 * @param {{id: number} & Record<string, unknown>} payload
 * @param {string} label */
export async function notifyMailer(env, payload, label) {
	try {
		const res = await env.MAILER.fetch("https://rattelse-mailer.internal/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) console.error(`${label} notify failed`, { id: payload.id, status: res.status });
	} catch (error) {
		console.error(`${label} notify threw`, { id: payload.id, message: String(error) });
	}
}
